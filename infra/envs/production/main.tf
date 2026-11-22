terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.73"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.9"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.8"
    }
  }

  # The bucket and region come from backend.hcl (see backend.hcl.example): `terraform init -backend-config=backend.hcl`.
  backend "s3" {
    key          = "album-ranker/production.tfstate"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      project     = "album-ranker"
      environment = "production"
    }
  }
}

module "app" {
  source = "../../modules/app"

  environment            = "production"
  dist_dir               = "${path.root}/../../../dist"
  musicbrainz_user_agent = var.musicbrainz_user_agent
  budget_email           = var.budget_email
  reserved_concurrency   = var.reserved_concurrency
}
