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

# CloudFront only takes a certificate from us-east-1, whatever `region` is.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      project     = "album-ranker"
      environment = "production"
    }
  }
}

module "app" {
  source = "../../modules/app"

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  environment            = "production"
  domain_name            = var.domain_name
  zone_id                = var.zone_id
  dist_dir               = "${path.root}/../../../dist"
  musicbrainz_user_agent = var.musicbrainz_user_agent
  budget_email           = var.budget_email
  reserved_concurrency   = var.reserved_concurrency

  client_events                = var.client_events
  client_events_retention_days = var.client_events_retention_days
}
