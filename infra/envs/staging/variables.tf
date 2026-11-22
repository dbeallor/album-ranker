variable "region" {
  description = "AWS region for this environment."
  type        = string
  default     = "us-east-1"
}

variable "musicbrainz_user_agent" {
  description = "Sent to MusicBrainz with every request; holds your contact email, e.g. \"album-ranker/0.1 (you@example.com)\"."
  type        = string
}

variable "budget_email" {
  description = "Email for a monthly cost alert above 5 USD. Leave empty to skip the budget."
  type        = string
  default     = ""
}

variable "reserved_concurrency" {
  description = "1 keeps at most one copy of the function running. Set -1 if the account's Lambda concurrency quota is too low to reserve any."
  type        = number
  default     = 1
}

variable "domain_name" {
  description = "The address of this environment. Must be the zone's domain or a name under it."
  type        = string
  default     = "staging.album-ranker.com"
}

variable "zone_id" {
  description = "The Route 53 hosted zone of the domain. Copy it from `terraform -chdir=infra/dns output -raw zone_id`."
  type        = string
}
