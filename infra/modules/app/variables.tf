variable "environment" {
  description = "staging or production. Becomes DEPLOY_ENV in the function and the prefix of every resource name."
  type        = string

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production."
  }
}

variable "dist_dir" {
  description = "The folder `npm run build:lambda` writes: lambda/, static/ and build-info.json."
  type        = string
}

variable "musicbrainz_user_agent" {
  description = "Sent to MusicBrainz with every request; MusicBrainz asks for contact details in it, e.g. \"album-ranker/0.1 (you@example.com)\"."
  type        = string

  validation {
    condition     = trimspace(var.musicbrainz_user_agent) != ""
    error_message = "musicbrainz_user_agent must not be empty."
  }
}

variable "budget_email" {
  description = "Email address for the monthly cost alert (above 5 USD). Empty means no budget is created."
  type        = string
  default     = ""
}

variable "reserved_concurrency" {
  description = "Reserved concurrent executions for the function. 1 keeps at most one copy running. Use -1 to remove the reservation if the account's concurrency quota is too low to reserve any (the conditional S3 write still stops a second writer from overwriting)."
  type        = number
  default     = 1
}

variable "web_adapter_layer_version" {
  description = "Version of the AWS Lambda Web Adapter layer (LambdaAdapterLayerArm64, account 753240598075)."
  type        = number
  default     = 30
}

variable "memory_size" {
  description = "Function memory in MB."
  type        = number
  default     = 1024
}

variable "timeout" {
  description = "Function timeout in seconds."
  type        = number
  default     = 30
}
