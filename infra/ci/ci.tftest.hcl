# Offline checks of the trust policy and the deploy policy. A mock provider doesn't render policy JSON, so the checks read
# the aws_iam_policy_document inputs (the statements) instead; the JSON is just their rendering. Run:
# terraform -chdir=infra/ci test (after init -backend=false). Needs no AWS access.

mock_provider "aws" {
  override_during = plan

  # The attribute only has to be valid JSON for the resources that take it.
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }
}

override_data {
  target = data.aws_caller_identity.current
  values = {
    account_id = "123456789012"
  }
}

override_data {
  target = data.terraform_remote_state.staging
  values = {
    outputs = {
      response_headers_policy_id = "HDRPOLICY123"
      origin_access_control_id   = "OAC123"
    }
  }
}

# The one ARN the documents read from a resource.
override_resource {
  target = aws_iam_openid_connect_provider.github
  values = {
    arn = "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
  }
}

variables {
  state_bucket = "album-ranker-tfstate-123456789012"
  zone_id      = "Z0123456789ABCDEFGHIJ"
}

# ---------------------------------------------------------------- trust policy, one run per repository

run "trust_default_repository" {
  command = plan

  assert {
    condition     = length(data.aws_iam_policy_document.trust.statement) == 1
    error_message = "The trust policy must have exactly one statement."
  }

  assert {
    condition     = toset([for s in data.aws_iam_policy_document.trust.statement : s.actions][0]) == toset(["sts:AssumeRoleWithWebIdentity"])
    error_message = "Only AssumeRoleWithWebIdentity may be allowed."
  }

  assert {
    condition     = toset([for c in data.aws_iam_policy_document.trust.statement[0].condition : c.values if c.variable == "token.actions.githubusercontent.com:sub"][0]) == toset(["repo:dbeallor/album-ranker:ref:refs/heads/main"])
    error_message = "sub must be exactly the main branch of dbeallor/album-ranker."
  }

  assert {
    condition     = toset([for c in data.aws_iam_policy_document.trust.statement[0].condition : c.values if c.variable == "token.actions.githubusercontent.com:aud"][0]) == toset(["sts.amazonaws.com"])
    error_message = "aud must be exactly sts.amazonaws.com."
  }

  assert {
    condition     = alltrue([for c in data.aws_iam_policy_document.trust.statement[0].condition : c.test == "StringEquals" && !anytrue([for v in c.values : strcontains(v, "*")])])
    error_message = "Both conditions must be StringEquals with no wildcard."
  }

  assert {
    condition     = length(data.aws_iam_policy_document.trust.statement[0].condition) == 2
    error_message = "Only the aud and sub conditions are expected."
  }

  assert {
    condition     = aws_iam_role.deploy.max_session_duration == 3600
    error_message = "Sessions last one hour."
  }
}

run "trust_other_repository" {
  command = plan

  variables {
    github_repository = "acme/widgets"
  }

  assert {
    condition     = toset([for c in data.aws_iam_policy_document.trust.statement[0].condition : c.values if c.variable == "token.actions.githubusercontent.com:sub"][0]) == toset(["repo:acme/widgets:ref:refs/heads/main"])
    error_message = "sub must follow github_repository."
  }

  assert {
    condition     = !anytrue([for c in data.aws_iam_policy_document.trust.statement[0].condition : anytrue([for v in c.values : strcontains(v, "*")])])
    error_message = "No wildcard may reach the trust policy."
  }
}

run "trust_repository_with_dots_and_dashes" {
  command = plan

  variables {
    github_repository = "Some-Org/repo.name_1"
  }

  assert {
    condition     = toset([for c in data.aws_iam_policy_document.trust.statement[0].condition : c.values if c.variable == "token.actions.githubusercontent.com:sub"][0]) == toset(["repo:Some-Org/repo.name_1:ref:refs/heads/main"])
    error_message = "sub must follow github_repository."
  }
}

run "trust_refuses_wildcard_repository" {
  command = plan

  variables {
    github_repository = "acme/*"
  }

  expect_failures = [var.github_repository]
}

run "trust_refuses_owner_wildcard" {
  command = plan

  variables {
    github_repository = "*/widgets"
  }

  expect_failures = [var.github_repository]
}

# ---------------------------------------------------------------- deploy policy

run "deploy_policy_stays_out_of_production" {
  command = plan

  assert {
    condition     = !anytrue(flatten([for s in data.aws_iam_policy_document.deploy.statement : [for r in s.resources : strcontains(r, "production")] if s.effect != "Deny"]))
    error_message = "No allow statement may name a production resource."
  }

  assert {
    condition     = !anytrue(flatten([for s in data.aws_iam_policy_document.deploy.statement : [for c in s.condition : [for v in c.values : strcontains(v, "production")]] if s.effect != "Deny"]))
    error_message = "No allow statement may mention production in a condition value."
  }

  # Every allow on a write that can't be scoped by ARN to staging carries a tag condition instead.
  assert {
    condition = alltrue([
      for s in data.aws_iam_policy_document.deploy.statement :
      length([for c in s.condition : c if strcontains(c.variable, "aws:RequestTag/environment") || strcontains(c.variable, "aws:ResourceTag/environment")]) > 0
      if s.effect != "Deny" && anytrue([for a in s.actions : startswith(a, "acm:") && !startswith(a, "acm:Describe") && !startswith(a, "acm:List")])
    ])
    error_message = "Every ACM write must be limited by an environment tag."
  }

  assert {
    condition = alltrue([
      for s in data.aws_iam_policy_document.deploy.statement :
      length([for c in s.condition : c if strcontains(c.variable, "aws:RequestTag/environment") || strcontains(c.variable, "aws:ResourceTag/environment")]) > 0
      if s.effect != "Deny" && anytrue([for a in s.actions : contains(["cloudfront:CreateDistribution", "cloudfront:UpdateDistribution", "cloudfront:DeleteDistribution", "cloudfront:TagResource"], a)])
    ])
    error_message = "Every CloudFront distribution write must be limited by an environment tag."
  }

  assert {
    condition = alltrue(flatten([
      for s in data.aws_iam_policy_document.deploy.statement : [
        for c in s.condition : alltrue([for v in c.values : v == "staging"]) if strcontains(c.variable, "environment") && c.test == "StringEquals"
      ] if s.effect != "Deny"
    ]))
    error_message = "Every environment tag condition must say staging."
  }
}

run "deploy_policy_iam_is_the_function_role_only" {
  command = plan

  assert {
    condition = alltrue([
      for s in data.aws_iam_policy_document.deploy.statement :
      length(s.resources) == 1 && contains(s.resources, "arn:aws:iam::123456789012:role/album-ranker-staging")
      if s.effect != "Deny" && anytrue([for a in s.actions : startswith(a, "iam:")])
    ])
    error_message = "Every iam allow statement must be limited to the staging function role."
  }

  assert {
    condition     = length([for s in data.aws_iam_policy_document.deploy.statement : s if s.effect != "Deny" && anytrue([for a in s.actions : startswith(a, "iam:")])]) > 0
    error_message = "The test would pass on nothing: expected iam allow statements."
  }

  # Anything that grants permissions to the role needs the boundary.
  assert {
    condition = alltrue([
      for s in data.aws_iam_policy_document.deploy.statement :
      length([for c in s.condition : c if c.variable == "iam:PermissionsBoundary" && c.test == "StringEquals" && toset(c.values) == toset(["arn:aws:iam::123456789012:policy/album-ranker-staging-function-boundary"])]) == 1
      if s.effect != "Deny" && length(setintersection(s.actions, ["iam:CreateRole", "iam:PutRolePolicy", "iam:AttachRolePolicy", "iam:UpdateAssumeRolePolicy"])) > 0
    ])
    error_message = "Role creation and grants must require the boundary."
  }

  assert {
    condition = alltrue([
      for s in data.aws_iam_policy_document.deploy.statement :
      length([for c in s.condition : c if c.variable == "iam:PassedToService" && toset(c.values) == toset(["lambda.amazonaws.com"])]) == 1
      if s.effect != "Deny" && contains(s.actions, "iam:PassRole")
    ])
    error_message = "PassRole must be limited to Lambda."
  }

  assert {
    condition     = !anytrue([for s in data.aws_iam_policy_document.deploy.statement : contains(s.actions, "iam:PutRolePermissionsBoundary") || contains(s.actions, "iam:DeleteRolePermissionsBoundary") if s.effect != "Deny"])
    error_message = "No allow statement may change a permissions boundary."
  }
}

run "deploy_policy_protects_the_boundary_and_the_role" {
  command = plan

  assert {
    condition     = length([for s in data.aws_iam_policy_document.deploy.statement : s if s.effect == "Deny" && contains(s.actions, "iam:DeleteRolePermissionsBoundary") && contains(s.resources, "*")]) == 1
    error_message = "Missing the explicit Deny on removing a permissions boundary."
  }

  assert {
    condition = length([
      for s in data.aws_iam_policy_document.deploy.statement : s
      if s.effect == "Deny" && toset(s.resources) == toset(["arn:aws:iam::123456789012:policy/album-ranker-staging-function-boundary"]) && contains(s.actions, "iam:CreatePolicyVersion") && contains(s.actions, "iam:DeletePolicy") && contains(s.actions, "iam:SetDefaultPolicyVersion")
    ]) == 1
    error_message = "Missing the explicit Deny on writes to the boundary policy."
  }

  assert {
    condition = length([
      for s in data.aws_iam_policy_document.deploy.statement : s
      if s.effect == "Deny" && toset(s.resources) == toset(["arn:aws:iam::123456789012:role/album-ranker-ci-staging-deploy"]) && contains(s.actions, "iam:UpdateAssumeRolePolicy") && contains(s.actions, "iam:PutRolePolicy") && contains(s.actions, "iam:AttachRolePolicy") && contains(s.actions, "iam:DeleteRole")
    ]) == 1
    error_message = "Missing the explicit Deny on writes to the deploy role."
  }
}

run "deploy_policy_state_access_is_staging_only" {
  command = plan

  # Every allow that reaches the state bucket is one of the two object keys, or the list call with the prefix condition.
  assert {
    condition = alltrue([
      for s in data.aws_iam_policy_document.deploy.statement :
      alltrue([for r in s.resources : can(regex("^arn:aws:s3:::album-ranker-tfstate-123456789012/album-ranker/staging\\.tfstate(\\.tflock)?$", r))])
      if s.effect != "Deny" && anytrue([for r in s.resources : strcontains(r, "album-ranker-tfstate-123456789012/")])
    ])
    error_message = "State objects must be limited to staging.tfstate and its lock file."
  }

  assert {
    condition = alltrue([
      for s in data.aws_iam_policy_document.deploy.statement :
      toset(s.actions) == toset(["s3:ListBucket"]) && length([for c in s.condition : c if c.test == "StringLike" && c.variable == "s3:prefix" && toset(c.values) == toset(["album-ranker/staging.tfstate*", "env:/*"])]) == 1
      if s.effect != "Deny" && contains(s.resources, "arn:aws:s3:::album-ranker-tfstate-123456789012")
    ])
    error_message = "Listing the state bucket must be limited to the staging.tfstate prefix."
  }

  assert {
    condition     = length([for s in data.aws_iam_policy_document.deploy.statement : s if s.effect != "Deny" && anytrue([for r in s.resources : strcontains(r, "album-ranker-tfstate-123456789012")])]) == 2
    error_message = "Expected exactly the state object and state list statements."
  }

  # No other S3 statement reaches a bucket outside staging's.
  assert {
    condition = alltrue([
      for s in data.aws_iam_policy_document.deploy.statement :
      alltrue([for r in s.resources : startswith(r, "arn:aws:s3:::album-ranker-staging-") || strcontains(r, "album-ranker-tfstate-123456789012")])
      if s.effect != "Deny" && anytrue([for a in s.actions : startswith(a, "s3:")])
    ])
    error_message = "S3 allows may name only staging buckets and the staging state."
  }
}

run "deploy_policy_dns_is_limited_to_the_staging_name" {
  command = plan

  assert {
    condition = length([
      for s in data.aws_iam_policy_document.deploy.statement : s
      if s.effect != "Deny" && contains(s.actions, "route53:ChangeResourceRecordSets") && toset(s.resources) == toset(["arn:aws:route53:::hostedzone/Z0123456789ABCDEFGHIJ"])
      && length([for c in s.condition : c if c.test == "ForAllValues:StringLike" && c.variable == "route53:ChangeResourceRecordSetsNormalizedRecordNames" && toset(c.values) == toset(["staging.album-ranker.com", "*.staging.album-ranker.com"])]) == 1
    ]) == 1
    error_message = "Record changes must be limited to the staging name and below."
  }

  assert {
    condition     = length([for s in data.aws_iam_policy_document.deploy.statement : s if s.effect != "Deny" && contains(s.actions, "route53:ChangeResourceRecordSets")]) == 1
    error_message = "Only one statement may change records."
  }
}

run "deploy_policy_untaggable_cloudfront_updates_use_staging_ids" {
  command = plan

  assert {
    condition = length([
      for s in data.aws_iam_policy_document.deploy.statement : s
      if s.effect != "Deny" && contains(s.actions, "cloudfront:UpdateResponseHeadersPolicy") && toset(s.resources) == toset(["arn:aws:cloudfront::123456789012:response-headers-policy/HDRPOLICY123"])
    ]) == 1
    error_message = "Updating a response headers policy must be limited to staging's ID."
  }

  assert {
    condition = length([
      for s in data.aws_iam_policy_document.deploy.statement : s
      if s.effect != "Deny" && contains(s.actions, "cloudfront:UpdateOriginAccessControl") && toset(s.resources) == toset(["arn:aws:cloudfront::123456789012:origin-access-control/OAC123"])
    ]) == 1
    error_message = "Updating an origin access control must be limited to staging's ID."
  }

  # No update or delete of those types anywhere else.
  assert {
    condition = alltrue([
      for s in data.aws_iam_policy_document.deploy.statement :
      length(setintersection(s.actions, ["cloudfront:UpdateResponseHeadersPolicy", "cloudfront:DeleteResponseHeadersPolicy", "cloudfront:UpdateOriginAccessControl", "cloudfront:DeleteOriginAccessControl"])) == 0 || !contains(s.resources, "*")
      if s.effect != "Deny"
    ])
    error_message = "Update and delete of response headers policies and origin access controls must not be unscoped."
  }
}

# Before staging has been applied with the module's new outputs there are no IDs: no update or delete on those types.
run "deploy_policy_without_staging_ids_grants_no_untaggable_updates" {
  command = plan

  override_data {
    target = data.terraform_remote_state.staging
    values = {
      outputs = {}
    }
  }

  assert {
    condition     = length([for s in data.aws_iam_policy_document.deploy.statement : s if anytrue([for a in s.actions : strcontains(a, "ResponseHeadersPolicy") && (startswith(a, "cloudfront:Update") || startswith(a, "cloudfront:Delete"))])]) == 0
    error_message = "With no IDs in staging's state, no update or delete may be allowed."
  }
}
