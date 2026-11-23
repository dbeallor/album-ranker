output "url" {
  description = "The address of this environment, on its own domain."
  value       = module.app.url
}

output "cloudfront_url" {
  description = "CloudFront's own address. It still works, behind the same login."
  value       = module.app.cloudfront_url
}

output "password" {
  description = "The login password. Read with `terraform output -raw password`."
  value       = module.app.password
  sensitive   = true
}

output "data_bucket" {
  description = "The S3 bucket that holds the database file."
  value       = module.app.data_bucket
}

output "deployed_commit" {
  description = "The git commit of the build this environment runs."
  value       = module.app.deployed_commit
}

output "response_headers_policy_id" {
  description = "Read by infra/ci to scope the deploy role to this environment's response headers policy."
  value       = module.app.response_headers_policy_id
}

output "origin_access_control_id" {
  description = "Read by infra/ci to scope the deploy role to this environment's origin access control."
  value       = module.app.origin_access_control_id
}
