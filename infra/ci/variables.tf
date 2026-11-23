variable "region" {
  description = "AWS region of staging, and of the state bucket. Use the one in backend.hcl."
  type        = string
  default     = "us-east-1"
}

variable "state_bucket" {
  description = "The Terraform state bucket (`terraform -chdir=infra/bootstrap output`). The deploy role may touch only staging's state in it."
  type        = string
}

variable "github_repository" {
  description = "The GitHub repository (owner/name) whose main branch may assume the deploy role."
  type        = string
  default     = "dbeallor/album-ranker"

  # No wildcard may reach the trust policy's sub claim.
  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repository))
    error_message = "github_repository must be owner/name, with no wildcards."
  }
}

variable "zone_id" {
  description = "The Route 53 hosted zone of the domain: `terraform -chdir=infra/dns output -raw zone_id`."
  type        = string

  validation {
    condition     = can(regex("^Z[A-Z0-9]+$", var.zone_id))
    error_message = "zone_id must be a Route 53 hosted zone ID such as Z0123456789ABCDEFGHIJ."
  }
}

variable "staging_domain" {
  description = "The address of staging. The deploy role may change DNS records only at this name and under it."
  type        = string
  default     = "staging.album-ranker.com"

  validation {
    condition     = can(regex("^([a-z0-9]([a-z0-9-]*[a-z0-9])?\\.)+[a-z]{2,}$", var.staging_domain))
    error_message = "staging_domain must be a lower-case host name such as staging.album-ranker.com."
  }
}

variable "create_oidc_provider" {
  description = "false reads the account's existing GitHub OIDC provider instead of creating one (an account holds one per URL)."
  type        = bool
  default     = true
}
