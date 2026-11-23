# What the deploy role may do: apply infra/envs/staging and nothing else. Every write is scoped to staging by name, by tag
# or by record name; a read that can't be scoped is List/Describe/Get only. The action lists come from each resource in
# infra/modules/app plus the reads the AWS provider makes when it refreshes it. A missing action shows up as AccessDenied in
# a CI run; add it here, not in the console.

locals {
  region = var.region

  staging_buckets = "arn:aws:s3:::${local.staging_name}-*"
  assets_objects  = "arn:aws:s3:::${local.staging_name}-assets-*/*"
  state_key       = "album-ranker/staging.tfstate"
  function_arn    = "arn:aws:lambda:${local.region}:${local.account_id}:function:${local.staging_name}"
  log_group_arn   = "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/lambda/${local.staging_name}"
  cloudfront_arn  = "arn:aws:cloudfront::${local.account_id}"
  zone_arn        = "arn:aws:route53:::hostedzone/${var.zone_id}"
}

data "aws_iam_policy_document" "deploy" {
  # ------------------------------------------------ Terraform state (S3 backend)

  statement {
    sid       = "StateObject"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["arn:aws:s3:::${var.state_bucket}/${local.state_key}", "arn:aws:s3:::${var.state_bucket}/${local.state_key}.tflock"]
  }

  statement {
    sid       = "StateList"
    actions   = ["s3:ListBucket"]
    resources = ["arn:aws:s3:::${var.state_bucket}"]

    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["${local.state_key}*"]
    }
  }

  # ------------------------------------------------ S3 buckets of staging

  statement {
    sid = "AppBucketManage"
    actions = [
      "s3:CreateBucket",
      "s3:DeleteBucket",
      "s3:PutBucketTagging",
      "s3:PutBucketVersioning",
      "s3:PutEncryptionConfiguration",
      "s3:PutBucketPublicAccessBlock",
      "s3:PutBucketOwnershipControls",
      "s3:DeleteBucketOwnershipControls",
      "s3:PutBucketPolicy",
      "s3:DeleteBucketPolicy",
      "s3:PutLifecycleConfiguration",
    ]
    resources = [local.staging_buckets]
  }

  # What the provider reads when it refreshes a bucket and its settings. The versions and uploads listings are for the
  # assets bucket's force_destroy.
  statement {
    sid = "AppBucketRead"
    actions = [
      "s3:GetBucket*",
      "s3:GetAccelerateConfiguration",
      "s3:GetEncryptionConfiguration",
      "s3:GetLifecycleConfiguration",
      "s3:GetReplicationConfiguration",
      "s3:ListBucket",
      "s3:ListBucketVersions",
      "s3:ListBucketMultipartUploads",
    ]
    resources = [local.staging_buckets]
  }

  # Objects only in the assets bucket (build files). Nothing here reads or writes the database file in the data bucket.
  statement {
    sid = "AssetsObjects"
    actions = [
      "s3:GetObject",
      "s3:GetObjectVersion",
      "s3:GetObjectTagging",
      "s3:GetObjectLegalHold",
      "s3:GetObjectRetention",
      "s3:PutObject",
      "s3:PutObjectTagging",
      "s3:DeleteObject",
      "s3:DeleteObjectVersion",
      "s3:DeleteObjectTagging",
    ]
    resources = [local.assets_objects]
  }

  # ------------------------------------------------ Lambda

  statement {
    sid = "FunctionManage"
    actions = [
      "lambda:CreateFunction",
      "lambda:UpdateFunctionCode",
      "lambda:UpdateFunctionConfiguration",
      "lambda:DeleteFunction",
      "lambda:PutFunctionConcurrency",
      "lambda:DeleteFunctionConcurrency",
      "lambda:TagResource",
      "lambda:UntagResource",
      "lambda:CreateFunctionUrlConfig",
      "lambda:UpdateFunctionUrlConfig",
      "lambda:DeleteFunctionUrlConfig",
      # The provider adds and removes the two permissions a function URL with authorization NONE needs.
      "lambda:AddPermission",
      "lambda:RemovePermission",
    ]
    resources = [local.function_arn]
  }

  statement {
    sid = "FunctionRead"
    actions = [
      "lambda:GetFunction*",
      "lambda:GetRuntimeManagementConfig",
      "lambda:GetPolicy",
      "lambda:ListVersionsByFunction",
      "lambda:ListTags",
    ]
    resources = [local.function_arn]
  }

  # Attaching a layer needs read access to the layer version, which lives in AWS's account (Lambda Web Adapter).
  statement {
    sid       = "WebAdapterLayer"
    actions   = ["lambda:GetLayerVersion"]
    resources = ["arn:aws:lambda:${local.region}:753240598075:layer:LambdaAdapterLayerArm64:*"]
  }

  # ------------------------------------------------ IAM: the function's role only

  # Anything that changes who can assume the role or what it may do needs the boundary: set on create, and still on the
  # role when a policy changes. So the function's role can never be given more than the boundary allows.
  statement {
    sid = "FunctionRoleGrant"
    actions = [
      "iam:CreateRole",
      "iam:PutRolePolicy",
      "iam:DeleteRolePolicy",
      "iam:AttachRolePolicy",
      "iam:DetachRolePolicy",
      "iam:UpdateAssumeRolePolicy",
    ]
    resources = [local.role_arn]

    condition {
      test     = "StringEquals"
      variable = "iam:PermissionsBoundary"
      values   = [local.boundary_arn]
    }
  }

  # These grant nothing: delete, tags, description and session length, plus the reads the provider makes on refresh.
  statement {
    sid = "FunctionRoleMaintain"
    actions = [
      "iam:DeleteRole",
      "iam:UpdateRole",
      "iam:UpdateRoleDescription",
      "iam:TagRole",
      "iam:UntagRole",
      "iam:GetRole",
      "iam:GetRolePolicy",
      "iam:ListRolePolicies",
      "iam:ListAttachedRolePolicies",
      "iam:ListInstanceProfilesForRole",
      "iam:ListRoleTags",
    ]
    resources = [local.role_arn]
  }

  statement {
    sid       = "PassFunctionRole"
    actions   = ["iam:PassRole"]
    resources = [local.role_arn]

    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["lambda.amazonaws.com"]
    }
  }

  # Explicit denies, so no allow above (or added later) can undo them: keep the boundary on every role, leave the boundary
  # policy alone, and don't touch this role.
  statement {
    sid       = "DenyBoundaryRemoval"
    effect    = "Deny"
    actions   = ["iam:DeleteRolePermissionsBoundary"]
    resources = ["*"]
  }

  statement {
    sid    = "DenyBoundaryPolicyWrite"
    effect = "Deny"
    actions = [
      "iam:CreatePolicyVersion",
      "iam:DeletePolicy",
      "iam:DeletePolicyVersion",
      "iam:SetDefaultPolicyVersion",
      "iam:TagPolicy",
      "iam:UntagPolicy",
    ]
    resources = [local.boundary_arn]
  }

  statement {
    sid    = "DenyDeployRoleWrite"
    effect = "Deny"
    actions = [
      "iam:CreateRole",
      "iam:DeleteRole",
      "iam:UpdateRole",
      "iam:UpdateRoleDescription",
      "iam:UpdateAssumeRolePolicy",
      "iam:PutRolePolicy",
      "iam:DeleteRolePolicy",
      "iam:AttachRolePolicy",
      "iam:DetachRolePolicy",
      "iam:PutRolePermissionsBoundary",
      "iam:DeleteRolePermissionsBoundary",
      "iam:TagRole",
      "iam:UntagRole",
    ]
    resources = [aws_iam_role.deploy.arn]
  }

  # ------------------------------------------------ CloudWatch Logs

  statement {
    sid = "LogGroupManage"
    actions = [
      "logs:CreateLogGroup",
      "logs:DeleteLogGroup",
      "logs:PutRetentionPolicy",
      "logs:DeleteRetentionPolicy",
      "logs:TagResource",
      "logs:UntagResource",
      "logs:ListTagsForResource",
    ]
    resources = [local.log_group_arn, "${local.log_group_arn}:*"]
  }

  # DescribeLogGroups is how the provider finds a group by name, and IAM can only scope it to the group ARN pattern, not to a
  # single name.
  statement {
    sid       = "LogGroupDescribe"
    actions   = ["logs:DescribeLogGroups"]
    resources = ["arn:aws:logs:${local.region}:${local.account_id}:log-group:*"]
  }

  # ------------------------------------------------ CloudFront

  # A new distribution has no ARN yet, so create can't be scoped by it; the tag it carries from the start is the scope. The
  # request may only tag untagged resources, so a tagged production distribution can't be re-tagged as staging and then
  # updated.
  statement {
    sid       = "DistributionCreate"
    actions   = ["cloudfront:CreateDistribution", "cloudfront:TagResource"]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/environment"
      values   = ["staging"]
    }

    condition {
      test     = "Null"
      variable = "aws:ResourceTag/environment"
      values   = ["true"]
    }
  }

  statement {
    sid = "DistributionManage"
    actions = [
      "cloudfront:GetDistribution",
      "cloudfront:GetDistributionConfig",
      "cloudfront:ListTagsForResource",
      "cloudfront:UpdateDistribution",
      "cloudfront:DeleteDistribution",
      "cloudfront:TagResource",
      "cloudfront:UntagResource",
    ]
    resources = ["${local.cloudfront_arn}:distribution/*"]

    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/environment"
      values   = ["staging"]
    }
  }

  statement {
    sid = "FunctionCloudFrontManage"
    actions = [
      "cloudfront:CreateFunction",
      "cloudfront:UpdateFunction",
      "cloudfront:PublishFunction",
      "cloudfront:DeleteFunction",
      "cloudfront:DescribeFunction",
      "cloudfront:GetFunction",
    ]
    resources = ["${local.cloudfront_arn}:function/${local.staging_name}-*"]
  }

  # Response headers policies and origin access controls take no tags, so create is unscoped (it changes nothing that
  # exists), and reading one back right after create can't be scoped either: its ID is not in the state infra/ci reads yet.
  statement {
    sid = "UntaggableCreateRead"
    actions = [
      "cloudfront:CreateResponseHeadersPolicy",
      "cloudfront:GetResponseHeadersPolicy",
      "cloudfront:GetResponseHeadersPolicyConfig",
      "cloudfront:CreateOriginAccessControl",
      "cloudfront:GetOriginAccessControl",
      "cloudfront:GetOriginAccessControlConfig",
    ]
    resources = ["*"]
  }

  dynamic "statement" {
    for_each = length(local.response_headers_policy_ids) > 0 ? [1] : []

    content {
      sid       = "ResponseHeadersPolicyManage"
      actions   = ["cloudfront:UpdateResponseHeadersPolicy", "cloudfront:DeleteResponseHeadersPolicy"]
      resources = [for id in local.response_headers_policy_ids : "${local.cloudfront_arn}:response-headers-policy/${id}"]
    }
  }

  dynamic "statement" {
    for_each = length(local.origin_access_control_ids) > 0 ? [1] : []

    content {
      sid       = "OriginAccessControlManage"
      actions   = ["cloudfront:UpdateOriginAccessControl", "cloudfront:DeleteOriginAccessControl"]
      resources = [for id in local.origin_access_control_ids : "${local.cloudfront_arn}:origin-access-control/${id}"]
    }
  }

  # The managed cache and origin request policies are looked up by name, which means listing them. Read only.
  statement {
    sid = "ManagedPoliciesRead"
    actions = [
      "cloudfront:ListCachePolicies",
      "cloudfront:GetCachePolicy",
      "cloudfront:ListOriginRequestPolicies",
      "cloudfront:GetOriginRequestPolicy",
    ]
    resources = ["*"]
  }

  # ------------------------------------------------ ACM (CloudFront takes certificates from us-east-1 only)

  # Same as the distribution: a new certificate has no ARN yet, so the tag it is requested with is the scope.
  statement {
    sid       = "CertificateRequest"
    actions   = ["acm:RequestCertificate", "acm:AddTagsToCertificate"]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/environment"
      values   = ["staging"]
    }

    condition {
      test     = "Null"
      variable = "aws:ResourceTag/environment"
      values   = ["true"]
    }
  }

  statement {
    sid = "CertificateManage"
    actions = [
      "acm:DescribeCertificate",
      "acm:ListTagsForCertificate",
      "acm:AddTagsToCertificate",
      "acm:RemoveTagsFromCertificate",
      "acm:DeleteCertificate",
    ]
    resources = ["arn:aws:acm:us-east-1:${local.account_id}:certificate/*"]

    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/environment"
      values   = ["staging"]
    }
  }

  # ------------------------------------------------ Route 53 (one zone shared with production)

  # The zone holds production's records too, so every record in a change must be at the staging name or under it.
  statement {
    sid       = "StagingRecords"
    actions   = ["route53:ChangeResourceRecordSets"]
    resources = [local.zone_arn]

    condition {
      test     = "ForAllValues:StringLike"
      variable = "route53:ChangeResourceRecordSetsNormalizedRecordNames"
      values   = [var.staging_domain, "*.${var.staging_domain}"]
    }
  }

  statement {
    sid       = "ZoneRead"
    actions   = ["route53:GetHostedZone", "route53:ListResourceRecordSets", "route53:ListTagsForResource"]
    resources = [local.zone_arn]
  }

  # A change has its own ID, unknown until it exists.
  statement {
    sid       = "ChangeRead"
    actions   = ["route53:GetChange"]
    resources = ["arn:aws:route53:::change/*"]
  }

  # ------------------------------------------------ Budgets and STS

  statement {
    sid = "BudgetManage"
    actions = [
      "budgets:ViewBudget",
      "budgets:ModifyBudget",
      "budgets:TagResource",
      "budgets:UntagResource",
      "budgets:ListTagsForResource",
    ]
    resources = ["arn:aws:budgets::${local.account_id}:budget/${local.staging_name}-monthly"]
  }

  statement {
    sid       = "WhoAmI"
    actions   = ["sts:GetCallerIdentity"]
    resources = ["*"]
  }
}
