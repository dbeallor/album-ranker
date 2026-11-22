# The Route 53 hosted zone for the domain, shared by staging and production. Run once, after the bootstrap.
# The domain stays registered at its registrar (GoDaddy); only its name servers move here. See the README.

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
    key          = "album-ranker/dns.tfstate"
    encrypt      = true
    use_lockfile = true
  }
}

variable "region" {
  description = "AWS region for the API calls. Route 53 is global, so any region works; use the one in backend.hcl."
  type        = string
  default     = "us-east-1"
}

variable "domain" {
  description = "The domain registered at your registrar. Staging lives at staging.<domain>, production at <domain>."
  type        = string
  default     = "album-ranker.com"
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      project = "album-ranker"
    }
  }
}

resource "aws_route53_zone" "domain" {
  name    = var.domain
  comment = "album-ranker, managed by Terraform (infra/dns)"

  # Destroying the zone gives it new name servers, which would take both environments offline until they are changed at
  # the registrar again. To remove it on purpose, see the README.
  lifecycle {
    prevent_destroy = true
  }
}

output "zone_id" {
  description = "Put this in each environment's terraform.tfvars as zone_id."
  value       = aws_route53_zone.domain.zone_id
}

output "name_servers" {
  description = "Set these four at the registrar (GoDaddy: Nameservers, \"I'll use my own nameservers\")."
  value       = aws_route53_zone.domain.name_servers
}
