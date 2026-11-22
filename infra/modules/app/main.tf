# One environment of the app: Lambda (Next.js behind the Lambda Web Adapter), a function URL, CloudFront, the S3 bucket
# that holds the database file and the S3 bucket for build files. See docs/superpowers/specs/2026-11-22-album-14-aws-terraform-deploy.md.

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  name          = "album-ranker-${var.environment}"
  account_id    = data.aws_caller_identity.current.account_id
  region        = data.aws_region.current.region
  database_key  = "album-ranker.db"
  database_path = "/tmp/album-ranker.db"
  port          = 8080

  build_info = jsondecode(file("${var.dist_dir}/build-info.json"))

  static_dir   = "${var.dist_dir}/static"
  static_files = fileset(local.static_dir, "**")
  content_types = {
    js    = "text/javascript"
    mjs   = "text/javascript"
    css   = "text/css"
    json  = "application/json"
    map   = "application/json"
    txt   = "text/plain"
    html  = "text/html"
    svg   = "image/svg+xml"
    png   = "image/png"
    jpg   = "image/jpeg"
    jpeg  = "image/jpeg"
    gif   = "image/gif"
    webp  = "image/webp"
    avif  = "image/avif"
    ico   = "image/x-icon"
    woff  = "font/woff"
    woff2 = "font/woff2"
    ttf   = "font/ttf"
    otf   = "font/otf"
  }
}

# Generated here so no secret is typed into a file. They live in the encrypted state and the function's configuration.
resource "random_password" "app" {
  length  = 24
  special = false
}

resource "random_password" "origin_secret" {
  length  = 24
  special = false
}

# ---------------------------------------------------------------- data bucket (the database file)

resource "aws_s3_bucket" "data" {
  bucket = "${local.name}-data-${local.account_id}"

  # A destroy must not delete the rankings. To tear an environment down on purpose, see the README.
  force_destroy = false

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "data" {
  bucket = aws_s3_bucket.data.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "data" {
  bucket = aws_s3_bucket.data.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "data" {
  bucket = aws_s3_bucket.data.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "data" {
  bucket = aws_s3_bucket.data.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# Every write replaces the object, so old versions are the automatic backup: keep each for 30 days after it is replaced.
resource "aws_s3_bucket_lifecycle_configuration" "data" {
  bucket = aws_s3_bucket.data.id

  rule {
    id     = "expire-old-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 30
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }

  depends_on = [aws_s3_bucket_versioning.data]
}

# ---------------------------------------------------------------- assets bucket (build files, no data)

resource "aws_s3_bucket" "assets" {
  bucket = "${local.name}-assets-${local.account_id}"

  # Only build files that `npm run build:lambda` can recreate.
  force_destroy = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "assets" {
  bucket = aws_s3_bucket.assets.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "assets" {
  bucket = aws_s3_bucket.assets.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# Build files have unique names, so they cache for a year and need no invalidation.
resource "aws_s3_object" "static" {
  for_each = local.static_files

  bucket        = aws_s3_bucket.assets.id
  key           = "_next/static/${each.value}"
  source        = "${local.static_dir}/${each.value}"
  etag          = filemd5("${local.static_dir}/${each.value}")
  content_type  = lookup(local.content_types, lower(try(regex("[^.]+$", each.value), "")), "application/octet-stream")
  cache_control = "public, max-age=31536000, immutable"
}

data "aws_iam_policy_document" "assets" {
  statement {
    sid       = "CloudFrontRead"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.assets.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.app.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "assets" {
  bucket = aws_s3_bucket.assets.id
  policy = data.aws_iam_policy_document.assets.json

  depends_on = [aws_s3_bucket_public_access_block.assets]
}

# ---------------------------------------------------------------- function

data "archive_file" "lambda" {
  type        = "zip"
  source_dir  = "${var.dist_dir}/lambda"
  output_path = "${path.root}/.terraform/${local.name}-lambda.zip"

  # run.sh has to be executable; with no mode set the archive would keep whatever the build machine had.
  output_file_mode = "0755"
}

resource "aws_cloudwatch_log_group" "app" {
  name              = "/aws/lambda/${local.name}"
  retention_in_days = 14
}

data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "app" {
  name               = local.name
  assume_role_policy = data.aws_iam_policy_document.assume.json
}

data "aws_iam_policy_document" "app" {
  # ListBucket is what makes a missing object answer 404 instead of 403, which is how the app tells a fresh
  # environment from a denied one.
  statement {
    sid       = "ReadWriteDatabase"
    actions   = ["s3:GetObject", "s3:PutObject"]
    resources = ["${aws_s3_bucket.data.arn}/*"]
  }

  statement {
    sid       = "ListDatabaseBucket"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.data.arn]
  }

  statement {
    sid       = "WriteLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.app.arn}:*"]
  }
}

resource "aws_iam_role_policy" "app" {
  name   = "${local.name}-app"
  role   = aws_iam_role.app.id
  policy = data.aws_iam_policy_document.app.json
}

resource "aws_lambda_function" "app" {
  function_name = local.name
  role          = aws_iam_role.app.arn

  runtime       = "nodejs24.x"
  architectures = ["arm64"]
  handler       = "run.sh"
  memory_size   = var.memory_size
  timeout       = var.timeout

  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256

  # At most one copy runs, so there is one writer to the database file.
  reserved_concurrent_executions = var.reserved_concurrency

  layers = ["arn:aws:lambda:${local.region}:753240598075:layer:LambdaAdapterLayerArm64:${var.web_adapter_layer_version}"]

  environment {
    variables = {
      # Lambda Web Adapter: run.sh starts the Next.js server, the adapter forwards requests to it.
      AWS_LAMBDA_EXEC_WRAPPER = "/opt/bootstrap"
      AWS_LWA_PORT            = tostring(local.port)
      # A TCP check: an HTTP one would be a request through the S3 sync wrapper before the first real request.
      AWS_LWA_READINESS_CHECK_PROTOCOL = "tcp"
      PORT                             = tostring(local.port)
      HOSTNAME                         = "127.0.0.1"

      DEPLOY_ENV    = var.environment
      APP_PASSWORD  = random_password.app.result
      ORIGIN_SECRET = random_password.origin_secret.result

      DATABASE_S3_BUCKET = aws_s3_bucket.data.id
      DATABASE_S3_KEY    = local.database_key
      DATABASE_PATH      = local.database_path

      MUSICBRAINZ_USER_AGENT = var.musicbrainz_user_agent
    }
  }

  depends_on = [aws_cloudwatch_log_group.app, aws_iam_role_policy.app]
}

# Public by address only: the gate in the app refuses any request without CloudFront's secret header. AWS_IAM
# authorization would need signed requests, which CloudFront can't produce for POST bodies (server actions).
# With authorization_type NONE the provider also adds the two resource permissions the URL needs.
resource "aws_lambda_function_url" "app" {
  function_name      = aws_lambda_function.app.function_name
  authorization_type = "NONE"
}

# ---------------------------------------------------------------- CloudFront

data "aws_cloudfront_cache_policy" "disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_cache_policy" "optimized" {
  name = "Managed-CachingOptimized"
}

# Every viewer header except Host (a function URL answers only to its own host name), plus cookies and query strings.
data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

resource "aws_cloudfront_origin_access_control" "assets" {
  name                              = local.name
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# The function sees the function URL's host name as Host. Next.js takes the address the browser used from
# x-forwarded-host (server action origin check, login redirect), so pass it along.
resource "aws_cloudfront_function" "forward_host" {
  name    = "${local.name}-forward-host"
  runtime = "cloudfront-js-2.0"
  publish = true
  comment = "Copies Host to x-forwarded-host for the Next.js server"
  code    = <<-JS
    function handler(event) {
      var request = event.request;
      request.headers["x-forwarded-host"] = { value: request.headers.host.value };
      return request;
    }
  JS
}

resource "aws_cloudfront_distribution" "app" {
  enabled         = true
  is_ipv6_enabled = true
  http_version    = "http2and3"
  price_class     = "PriceClass_100"
  comment         = local.name

  origin {
    origin_id                = "assets"
    domain_name              = aws_s3_bucket.assets.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.assets.id
  }

  origin {
    origin_id   = "app"
    domain_name = trimsuffix(trimprefix(aws_lambda_function_url.app.function_url, "https://"), "/")

    custom_header {
      name  = "x-origin-secret"
      value = random_password.origin_secret.result
    }

    custom_origin_config {
      http_port                = 80
      https_port               = 443
      origin_protocol_policy   = "https-only"
      origin_ssl_protocols     = ["TLSv1.2"]
      origin_read_timeout      = 60
      origin_keepalive_timeout = 5
    }
  }

  # Everything that isn't a build file goes to the function, uncached.
  default_cache_behavior {
    target_origin_id         = "app"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    compress                 = true
    cache_policy_id          = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.forward_host.arn
    }
  }

  ordered_cache_behavior {
    path_pattern           = "/_next/static/*"
    target_origin_id       = "assets"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    cache_policy_id        = data.aws_cloudfront_cache_policy.optimized.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

# ---------------------------------------------------------------- cost alert (optional)

resource "aws_budgets_budget" "monthly" {
  count = var.budget_email == "" ? 0 : 1

  name         = "${local.name}-monthly"
  budget_type  = "COST"
  limit_amount = "5"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.budget_email]
  }
}
