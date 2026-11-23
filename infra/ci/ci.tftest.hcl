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

# What the admin credentials read back for the candidate IDs: the names infra/ci insists on.
override_data {
  target = data.aws_cloudfront_response_headers_policy.staging[0]
  values = {
    id   = "HDRPOLICY123"
    name = "album-ranker-staging-security"
  }
}

override_data {
  target = data.aws_cloudfront_origin_access_control.staging[0]
  values = {
    id   = "OAC123"
    name = "album-ranker-staging"
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
    condition     = alltrue([for s in data.aws_iam_policy_document.trust.statement : s.effect != "Deny" && toset(s.actions) == toset(["sts:AssumeRoleWithWebIdentity"])])
    error_message = "Only AssumeRoleWithWebIdentity may be allowed."
  }

  # Every statement pins both claims, so a statement added later can't skip one.
  assert {
    condition = alltrue([
      for s in data.aws_iam_policy_document.trust.statement :
      length([for c in s.condition : c if c.variable == "token.actions.githubusercontent.com:aud"]) > 0 && length([for c in s.condition : c if c.variable == "token.actions.githubusercontent.com:sub"]) > 0
    ])
    error_message = "Every trust statement must pin aud and sub."
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
    condition     = alltrue(flatten([for s in data.aws_iam_policy_document.trust.statement : [for c in s.condition : c.test == "StringEquals" && !anytrue([for v in c.values : strcontains(v, "*")])]]))
    error_message = "Every trust condition must be StringEquals with no wildcard."
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

  # Tagging on "*" is where a tagged production resource could be re-tagged as staging, so the resource must have no
  # environment tag yet.
  assert {
    condition = alltrue([
      for s in data.aws_iam_policy_document.deploy.statement :
      length([for c in s.condition : c if c.test == "Null" && c.variable == "aws:ResourceTag/environment" && toset(c.values) == toset(["true"])]) > 0
      if s.effect != "Deny" && contains(s.resources, "*") && length(setintersection(s.actions, ["cloudfront:TagResource", "acm:AddTagsToCertificate"])) > 0
    ])
    error_message = "Tagging on * must require that the resource has no environment tag yet."
  }

  assert {
    condition     = length([for s in data.aws_iam_policy_document.deploy.statement : s if s.effect != "Deny" && contains(s.resources, "*") && length(setintersection(s.actions, ["cloudfront:TagResource", "acm:AddTagsToCertificate"])) > 0]) > 0
    error_message = "The test would pass on nothing: expected tagging allows on *."
  }

  # Every allow on "*" is a create that the tag rules above cover, or read only.
  assert {
    condition = alltrue([
      for s in data.aws_iam_policy_document.deploy.statement :
      contains(["DistributionCreate", "CertificateRequest", "UntaggableCreateRead"], s.sid) || alltrue([for a in s.actions : can(regex("^[a-z0-9]+:(Get|List|Describe)", a))])
      if s.effect != "Deny" && contains(s.resources, "*")
    ])
    error_message = "An allow on * must be a known create statement or only Get, List and Describe."
  }

  # The unscoped create statement for the two untaggable types may hold only their creates and reads, no update or delete.
  assert {
    condition = alltrue([
      for s in data.aws_iam_policy_document.deploy.statement :
      alltrue([for a in s.actions : contains(["cloudfront:CreateResponseHeadersPolicy", "cloudfront:CreateOriginAccessControl"], a) || can(regex("^cloudfront:Get", a))])
      if s.effect != "Deny" && s.sid == "UntaggableCreateRead"
    ])
    error_message = "UntaggableCreateRead may only create and read."
  }
}

run "deploy_policy_iam_is_the_two_function_roles_only" {
  command = plan

  assert {
    condition = alltrue([
      for s in data.aws_iam_policy_document.deploy.statement :
      toset(s.resources) == toset(["arn:aws:iam::123456789012:role/album-ranker-staging", "arn:aws:iam::123456789012:role/album-ranker-staging-events"])
      if s.effect != "Deny" && anytrue([for a in s.actions : startswith(a, "iam:")])
    ])
    error_message = "Every iam allow statement must be limited to the app role and the events role."
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
      if s.effect != "Deny" && length(setintersection(s.actions, ["iam:CreateRole", "iam:PutRolePolicy", "iam:AttachRolePolicy"])) > 0
    ])
    error_message = "Role creation and grants must require the boundary."
  }

  # UpdateAssumeRolePolicy is not subject to the boundary condition (IAM probably never matches it there), so its own
  # statement names the two function roles and nothing else.
  assert {
    condition = alltrue([
      for s in data.aws_iam_policy_document.deploy.statement :
      toset(s.resources) == toset(["arn:aws:iam::123456789012:role/album-ranker-staging", "arn:aws:iam::123456789012:role/album-ranker-staging-events"]) && length(s.condition) == 0
      if s.effect != "Deny" && contains(s.actions, "iam:UpdateAssumeRolePolicy")
    ])
    error_message = "iam:UpdateAssumeRolePolicy must be allowed on the app role and the events role only, with no boundary condition."
  }

  assert {
    condition     = length([for s in data.aws_iam_policy_document.deploy.statement : s if s.effect != "Deny" && contains(s.actions, "iam:UpdateAssumeRolePolicy")]) > 0
    error_message = "The test would pass on nothing: the function role's trust must be updatable."
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

# The events function (ALBUM-85) is a second function with its own role and log group. Each resource type is limited to
# exactly the app's name and the events name: no prefix wildcard, so production's names and any third function stay out.
run "deploy_policy_function_role_and_log_group_are_the_two_staging_names" {
  command = plan

  assert {
    condition = alltrue([
      for s in data.aws_iam_policy_document.deploy.statement :
      toset(s.resources) == toset(["arn:aws:lambda:us-east-1:123456789012:function:album-ranker-staging", "arn:aws:lambda:us-east-1:123456789012:function:album-ranker-staging-events"])
      if s.effect != "Deny" && length([for a in s.actions : a if startswith(a, "lambda:") && a != "lambda:GetLayerVersion"]) > 0
    ])
    error_message = "Every lambda allow (the layer read aside) must be limited to the app function and the events function."
  }

  assert {
    condition = alltrue([
      for s in data.aws_iam_policy_document.deploy.statement :
      toset(s.resources) == toset([
        "arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/album-ranker-staging", "arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/album-ranker-staging:*",
        "arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/album-ranker-staging-events", "arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/album-ranker-staging-events:*",
      ])
      if s.sid == "LogGroupManage"
    ])
    error_message = "LogGroupManage must be limited to the app and events log groups."
  }

  assert {
    condition     = length([for s in data.aws_iam_policy_document.deploy.statement : s if s.sid == "LogGroupManage" || s.sid == "FunctionManage" || s.sid == "FunctionRead"]) == 3
    error_message = "The test would pass on nothing: expected the log group and function statements."
  }

  # Neither the policy nor the boundary may name anything wider than the two names (no album-ranker-staging*).
  assert {
    condition     = !anytrue(flatten([for s in data.aws_iam_policy_document.deploy.statement : [for r in s.resources : strcontains(r, "album-ranker-staging*") || strcontains(r, "function:*") || strcontains(r, "role/*")] if s.effect != "Deny"]))
    error_message = "No allow statement may use a wildcard on the staging name, or on all functions or roles."
  }

  # The boundary must let the events role write its own log group, or the function runs but logs nothing.
  assert {
    condition = length([
      for s in data.aws_iam_policy_document.boundary.statement : s
      if s.sid == "WriteLogs" && toset(s.resources) == toset(["arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/album-ranker-staging:*", "arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/album-ranker-staging-events:*"])
    ]) == 1
    error_message = "The boundary must allow log writes to the app and events log groups only."
  }
}

run "deploy_policy_protects_the_boundary_and_the_role" {
  command = plan

  assert {
    condition     = length([for s in data.aws_iam_policy_document.deploy.statement : s if s.effect == "Deny" && contains(s.actions, "iam:DeleteRolePermissionsBoundary") && contains(s.resources, "*")]) > 0
    error_message = "Missing the explicit Deny on removing a permissions boundary."
  }

  assert {
    condition = length([
      for s in data.aws_iam_policy_document.deploy.statement : s
      if s.effect == "Deny" && toset(s.resources) == toset(["arn:aws:iam::123456789012:policy/album-ranker-staging-function-boundary"]) && contains(s.actions, "iam:CreatePolicyVersion") && contains(s.actions, "iam:DeletePolicy") && contains(s.actions, "iam:SetDefaultPolicyVersion")
    ]) > 0
    error_message = "Missing the explicit Deny on writes to the boundary policy."
  }

  assert {
    condition = length([
      for s in data.aws_iam_policy_document.deploy.statement : s
      if s.effect == "Deny" && toset(s.resources) == toset(["arn:aws:iam::123456789012:role/album-ranker-ci-staging-deploy"]) && contains(s.actions, "iam:UpdateAssumeRolePolicy") && contains(s.actions, "iam:PutRolePolicy") && contains(s.actions, "iam:AttachRolePolicy") && contains(s.actions, "iam:DeleteRole")
    ]) > 0
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

  # The state itself is never deleted, only the lock file.
  assert {
    condition = alltrue([
      for s in data.aws_iam_policy_document.deploy.statement :
      alltrue([for r in s.resources : r == "arn:aws:s3:::album-ranker-tfstate-123456789012/album-ranker/staging.tfstate.tflock"])
      if s.effect != "Deny" && contains(s.actions, "s3:DeleteObject") && anytrue([for r in s.resources : strcontains(r, "album-ranker-tfstate-123456789012")])
    ])
    error_message = "s3:DeleteObject on the state bucket must be limited to the lock file."
  }

  assert {
    condition     = length([for s in data.aws_iam_policy_document.deploy.statement : s if s.effect != "Deny" && contains(s.actions, "s3:DeleteObject") && contains(s.resources, "arn:aws:s3:::album-ranker-tfstate-123456789012/album-ranker/staging.tfstate.tflock")]) > 0
    error_message = "The test would pass on nothing: the lock file must be deletable."
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

  # Every allow that changes records is limited like this, so a second statement can't skip the condition.
  assert {
    condition = alltrue([
      for s in data.aws_iam_policy_document.deploy.statement :
      toset(s.resources) == toset(["arn:aws:route53:::hostedzone/Z0123456789ABCDEFGHIJ"])
      && length([for c in s.condition : c if c.test == "ForAllValues:StringLike" && c.variable == "route53:ChangeResourceRecordSetsNormalizedRecordNames" && toset(c.values) == toset(["staging.album-ranker.com", "*.staging.album-ranker.com"])]) > 0
      if s.effect != "Deny" && contains(s.actions, "route53:ChangeResourceRecordSets")
    ])
    error_message = "Record changes must be limited to the staging name and below."
  }

  assert {
    condition     = length([for s in data.aws_iam_policy_document.deploy.statement : s if s.effect != "Deny" && contains(s.actions, "route53:ChangeResourceRecordSets")]) > 0
    error_message = "The test would pass on nothing: expected a statement that changes records."
  }
}

run "deploy_policy_untaggable_cloudfront_updates_use_staging_ids" {
  command = plan

  assert {
    condition = alltrue([
      for s in data.aws_iam_policy_document.deploy.statement :
      toset(s.resources) == toset(["arn:aws:cloudfront::123456789012:response-headers-policy/HDRPOLICY123"])
      if s.effect != "Deny" && contains(s.actions, "cloudfront:UpdateResponseHeadersPolicy")
    ])
    error_message = "Updating a response headers policy must be limited to staging's ID."
  }

  assert {
    condition = alltrue([
      for s in data.aws_iam_policy_document.deploy.statement :
      toset(s.resources) == toset(["arn:aws:cloudfront::123456789012:origin-access-control/OAC123"])
      if s.effect != "Deny" && contains(s.actions, "cloudfront:UpdateOriginAccessControl")
    ])
    error_message = "Updating an origin access control must be limited to staging's ID."
  }

  assert {
    condition     = length([for s in data.aws_iam_policy_document.deploy.statement : s if s.effect != "Deny" && (contains(s.actions, "cloudfront:UpdateResponseHeadersPolicy") || contains(s.actions, "cloudfront:UpdateOriginAccessControl"))]) > 0
    error_message = "The test would pass on nothing: expected the two update statements."
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

# The IDs come from a state the deploy role can write. An ID that doesn't name staging's resource stops the apply.
run "deploy_policy_refuses_a_response_headers_policy_that_is_not_stagings" {
  command = plan

  override_data {
    target = data.aws_cloudfront_response_headers_policy.staging[0]
    values = {
      id   = "PRODHDR999"
      name = "album-ranker-production-security"
    }
  }

  expect_failures = [data.aws_cloudfront_response_headers_policy.staging[0]]
}

run "deploy_policy_refuses_an_origin_access_control_that_is_not_stagings" {
  command = plan

  override_data {
    target = data.aws_cloudfront_origin_access_control.staging[0]
    values = {
      id   = "PRODOAC999"
      name = "album-ranker-production"
    }
  }

  expect_failures = [data.aws_cloudfront_origin_access_control.staging[0]]
}
