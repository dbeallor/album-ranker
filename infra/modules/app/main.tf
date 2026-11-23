# One environment of the app: Lambda (Next.js behind the Lambda Web Adapter), a function URL, CloudFront, the S3 bucket
# that holds the database file and the S3 bucket for build files. See docs/superpowers/specs/2026-11-22-album-14-aws-terraform-deploy.md.
# A second, small function takes the browser's front-end events (ALBUM-85, docs/superpowers/specs/2026-11-23-album-85-front-end-event-capture.md).

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

  # The fixed hosted zone ID every CloudFront alias record points at.
  cloudfront_zone_id = "Z2FDTNDATAQYW2"
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

# Refuse plain-HTTP access.
data "aws_iam_policy_document" "data_bucket" {
  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.data.arn, "${aws_s3_bucket.data.arn}/*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "data" {
  bucket = aws_s3_bucket.data.id
  policy = data.aws_iam_policy_document.data_bucket.json

  depends_on = [aws_s3_bucket_public_access_block.data]
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
    resources = ["${aws_s3_bucket.data.arn}/${local.database_key}"]
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

# ---------------------------------------------------------------- events function (front-end events, ALBUM-85)

# Separate from the app because the app runs one request at a time: a batch sent while a page loads would make one of
# the two answer 429, and each batch would cost the app an S3 HEAD. This one checks the request and writes log lines.
data "archive_file" "events" {
  type        = "zip"
  source_dir  = "${var.dist_dir}/events"
  output_path = "${path.root}/.terraform/${local.name}-events.zip"
}

resource "aws_cloudwatch_log_group" "events" {
  name              = "/aws/lambda/${local.name}-events"
  retention_in_days = var.client_events_retention_days
}

resource "aws_iam_role" "events" {
  name               = "${local.name}-events"
  assume_role_policy = data.aws_iam_policy_document.assume.json
}

# Writes to its own log group and nothing else: no S3, no database.
data "aws_iam_policy_document" "events" {
  statement {
    sid       = "WriteLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.events.arn}:*"]
  }
}

resource "aws_iam_role_policy" "events" {
  name   = "${local.name}-events"
  role   = aws_iam_role.events.id
  policy = data.aws_iam_policy_document.events.json
}

resource "aws_lambda_function" "events" {
  function_name = "${local.name}-events"
  role          = aws_iam_role.events.arn

  runtime       = "nodejs24.x"
  architectures = ["arm64"]
  handler       = "lambda/events.handler"
  memory_size   = 128
  timeout       = 5

  filename         = data.archive_file.events.output_path
  source_code_hash = data.archive_file.events.output_base64sha256

  # A cap on how much a stray caller can run up. It follows the app's -1 convention for accounts whose concurrency
  # quota is too low to reserve any.
  reserved_concurrent_executions = var.reserved_concurrency == -1 ? -1 : 2

  environment {
    variables = {
      DEPLOY_ENV    = var.environment
      APP_PASSWORD  = random_password.app.result
      ORIGIN_SECRET = random_password.origin_secret.result
      CLIENT_EVENTS = var.client_events ? "on" : "off"
    }
  }

  depends_on = [aws_cloudwatch_log_group.events, aws_iam_role_policy.events]
}

# Public by address only, like the app's: the function refuses any request without CloudFront's secret header.
# With authorization_type NONE the provider also adds the two resource permissions the URL needs.
resource "aws_lambda_function_url" "events" {
  function_name      = aws_lambda_function.events.function_name
  authorization_type = "NONE"
}

# ---------------------------------------------------------------- domain name and certificate

# CloudFront only takes a certificate from us-east-1, so this one uses the aliased provider the environment passes in.
resource "aws_acm_certificate" "app" {
  provider = aws.us_east_1

  domain_name       = var.domain_name
  validation_method = "DNS"

  # A replaced certificate has to exist before the distribution lets go of the old one.
  lifecycle {
    create_before_destroy = true
  }
}

# Proves to ACM that this account owns the name, with records in the zone. allow_overwrite lets a rerun take over a
# record left by an earlier attempt.
resource "aws_route53_record" "certificate_validation" {
  for_each = {
    for option in aws_acm_certificate.app.domain_validation_options : option.domain_name => {
      name   = option.resource_record_name
      record = option.resource_record_value
      type   = option.resource_record_type
    }
  }

  zone_id         = var.zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.record]
  ttl             = 60
  allow_overwrite = true
}

# Waits until ACM has seen the records. The first apply of an environment blocks here (up to 75 minutes), and only
# succeeds once the name servers at the registrar point at the zone.
resource "aws_acm_certificate_validation" "app" {
  provider = aws.us_east_1

  certificate_arn         = aws_acm_certificate.app.arn
  validation_record_fqdns = [for record in aws_route53_record.certificate_validation : record.fqdn]
}

# The address points at CloudFront, for IPv4 and IPv6.
resource "aws_route53_record" "app_a" {
  zone_id = var.zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.app.domain_name
    zone_id                = local.cloudfront_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "app_aaaa" {
  zone_id = var.zone_id
  name    = var.domain_name
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.app.domain_name
    zone_id                = local.cloudfront_zone_id
    evaluate_target_health = false
  }
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
# x-forwarded-host (server action origin check, login redirect), so pass it along. It also sets x-viewer-ip, which the
# login limiter keys on: the managed origin request policy doesn't forward CloudFront-Viewer-Address. Assigning the header
# overwrites anything the viewer sent.
resource "aws_cloudfront_function" "forward_host" {
  name    = "${local.name}-forward-host"
  runtime = "cloudfront-js-2.0"
  publish = true
  comment = "Copies Host to x-forwarded-host and sets x-viewer-ip for the Next.js server"
  code    = <<-JS
    function handler(event) {
      var request = event.request;
      request.headers["x-forwarded-host"] = { value: request.headers.host.value };
      request.headers["x-viewer-ip"] = { value: event.viewer.ip };
      return request;
    }
  JS
}

# Security headers on every response, the app's pages and the build files alike. HSTS covers this host only (no
# includeSubdomains, no preload), so staging and production stay independent of each other.
resource "aws_cloudfront_response_headers_policy" "security" {
  name    = "${local.name}-security"
  comment = "HSTS, nosniff, referrer policy and frame denial"

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = false
      preload                    = false
      override                   = true
    }

    content_type_options {
      override = true
    }

    referrer_policy {
      referrer_policy = "same-origin"
      override        = true
    }

    frame_options {
      frame_option = "DENY"
      override     = true
    }
  }
}

resource "aws_cloudfront_distribution" "app" {
  enabled         = true
  is_ipv6_enabled = true
  http_version    = "http2and3"
  price_class     = "PriceClass_100"
  comment         = local.name
  aliases         = [var.domain_name]

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

  origin {
    origin_id   = "events"
    domain_name = trimsuffix(trimprefix(aws_lambda_function_url.events.function_url, "https://"), "/")

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
    target_origin_id           = "app"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id   = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.forward_host.arn
    }
  }

  # The browser's front-end events go to the events function. CloudFront needs the full method list to allow POST. The
  # origin request policy passes the session cookie and Sec-Fetch-Site on for the function's checks. Host stays out of
  # it, as the function URL answers only to its own host name.
  ordered_cache_behavior {
    path_pattern               = "/events"
    target_origin_id           = "events"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id   = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id
  }

  ordered_cache_behavior {
    path_pattern           = "/_next/static/*"
    target_origin_id       = "assets"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    cache_policy_id        = data.aws_cloudfront_cache_policy.optimized.id

    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.app.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
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
