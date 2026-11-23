# The AWS side of the staging deploy from GitHub Actions: a GitHub OIDC provider and one role that the main branch of
# this repository can assume to apply infra/envs/staging, and nothing else. Run once by hand with the operator's admin
# profile, after the bootstrap and dns roots and before the first CI deploy. See the README ("Set up the CI deploy") and
# docs/superpowers/specs/2026-11-23-album-84-ci-staging-deploy.md.

terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.73"
    }
  }

  # The bucket and region come from backend.hcl (see backend.hcl.example): `terraform init -backend-config=backend.hcl`.
  backend "s3" {
    key          = "album-ranker/ci.tfstate"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      project = "album-ranker"
    }
  }
}

data "aws_caller_identity" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id

  # Fixed names: the app module builds the same ones (infra/modules/app: album-ranker-<environment>).
  staging_name = "album-ranker-staging"
  role_arn     = "arn:aws:iam::${local.account_id}:role/${local.staging_name}"

  # Built from the names, the way infra/envs/staging builds the boundary's ARN, so the policies below don't wait on the
  # resources to read them.
  deploy_role_name = "album-ranker-ci-staging-deploy"
  deploy_role_arn  = "arn:aws:iam::${local.account_id}:role/${local.deploy_role_name}"
  boundary_name    = "${local.staging_name}-function-boundary"
  boundary_arn     = "arn:aws:iam::${local.account_id}:policy/${local.boundary_name}"

  oidc_provider_arn = var.create_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn : data.aws_iam_openid_connect_provider.github[0].arn
}

# ---------------------------------------------------------------- GitHub OIDC provider

# An account holds one provider per URL, so an existing one can be read instead (create_oidc_provider = false).
resource "aws_iam_openid_connect_provider" "github" {
  count = var.create_oidc_provider ? 1 : 0

  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

data "aws_iam_openid_connect_provider" "github" {
  count = var.create_oidc_provider ? 0 : 1

  url = "https://token.actions.githubusercontent.com"
}

# ---------------------------------------------------------------- deploy role

# Exact match on the audience and on the subject. A pull request, a fork, another branch, a tag or another repository
# carries a different sub claim and is refused. Adding a GitHub environment later only changes the sub string.
data "aws_iam_policy_document" "trust" {
  statement {
    sid     = "GitHubMain"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [local.oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repository}:ref:refs/heads/main"]
    }
  }
}

resource "aws_iam_role" "deploy" {
  name                 = local.deploy_role_name
  description          = "Assumed by GitHub Actions on main to apply infra/envs/staging"
  assume_role_policy   = data.aws_iam_policy_document.trust.json
  max_session_duration = 3600
}

# Inline on purpose: IAM counts about 8,300 characters (no whitespace) of this policy, over the 6,144 a managed policy
# allows and under the 10,240 an inline one does. Check the size again when adding statements.
resource "aws_iam_role_policy" "deploy" {
  name   = "staging-deploy"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy.json
}

# ---------------------------------------------------------------- permissions boundary of the function role

# The most the staging function's role may ever do. The deploy role can create and change that role only while this is its
# boundary, so it can't hand the function (and itself, by running as it) anything beyond this, such as production's data.
data "aws_iam_policy_document" "boundary" {
  statement {
    sid       = "ReadWriteDatabase"
    actions   = ["s3:GetObject", "s3:PutObject"]
    resources = ["arn:aws:s3:::${local.staging_name}-data-*/*"]
  }

  statement {
    sid       = "ListDatabaseBucket"
    actions   = ["s3:ListBucket"]
    resources = ["arn:aws:s3:::${local.staging_name}-data-*"]
  }

  statement {
    sid       = "WriteLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["arn:aws:logs:${var.region}:${local.account_id}:log-group:/aws/lambda/${local.staging_name}:*"]
  }
}

resource "aws_iam_policy" "boundary" {
  name        = local.boundary_name
  description = "Permissions boundary of the staging function's role (infra/modules/app)"
  policy      = data.aws_iam_policy_document.boundary.json
}

# ---------------------------------------------------------------- staging's untaggable CloudFront resources

# Response headers policies and origin access controls take no tags and get random IDs, so the role can update or delete
# only the ones named here. Staging's state is written by the deploy role, so it is only a source of candidate IDs: each one
# is read back with the credentials running this root (the operator's, not the deploy role's) and refused unless the
# resource carries staging's name. CloudFront keeps both names unique in an account, so a planted ID of another resource
# (production's, say) fails the apply here instead of getting update and delete granted. Until staging has been applied
# with the module's new outputs (README) there are no candidates, and the role gets no update or delete on those two types.
data "terraform_remote_state" "staging" {
  backend = "s3"

  config = {
    bucket = var.state_bucket
    key    = "album-ranker/staging.tfstate"
    region = var.region
  }
}

locals {
  response_headers_policy_candidates = [for id in [try(data.terraform_remote_state.staging.outputs.response_headers_policy_id, null)] : id if id != null && id != ""]
  origin_access_control_candidates   = [for id in [try(data.terraform_remote_state.staging.outputs.origin_access_control_id, null)] : id if id != null && id != ""]
}

# The provider can look a response headers policy up by name, but that fails while staging has none, so this goes by the
# candidate ID too and checks the name.
data "aws_cloudfront_response_headers_policy" "staging" {
  count = length(local.response_headers_policy_candidates)

  id = local.response_headers_policy_candidates[count.index]

  lifecycle {
    postcondition {
      condition     = self.name == "${local.staging_name}-security"
      error_message = "The response headers policy ID in staging's state is named \"${self.name}\", not \"${local.staging_name}-security\". Refusing to grant update or delete on it. Look for a changed staging state."
    }
  }
}

# The provider has no lookup of an origin access control by name, only by ID.
data "aws_cloudfront_origin_access_control" "staging" {
  count = length(local.origin_access_control_candidates)

  id = local.origin_access_control_candidates[count.index]

  lifecycle {
    postcondition {
      condition     = self.name == local.staging_name
      error_message = "The origin access control ID in staging's state is named \"${self.name}\", not \"${local.staging_name}\". Refusing to grant update or delete on it. Look for a changed staging state."
    }
  }
}

locals {
  # Only IDs that passed the name check above reach the policy.
  response_headers_policy_ids = [for d in data.aws_cloudfront_response_headers_policy.staging : d.id]
  origin_access_control_ids   = [for d in data.aws_cloudfront_origin_access_control.staging : d.id]
}
