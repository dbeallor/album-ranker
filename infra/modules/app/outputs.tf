output "url" {
  description = "The address of this environment, on its own domain."
  value       = "https://${var.domain_name}"
}

output "cloudfront_url" {
  description = "CloudFront's own address for this environment. It still works, behind the same login."
  value       = "https://${aws_cloudfront_distribution.app.domain_name}"
}

output "password" {
  description = "The login password. Read with `terraform output -raw password`."
  value       = random_password.app.result
  sensitive   = true
}

output "data_bucket" {
  description = "The S3 bucket that holds the database file (album-ranker.db): back up and restore with aws s3 cp."
  value       = aws_s3_bucket.data.id
}

output "deployed_commit" {
  description = "The git commit the deployed build came from (dist/build-info.json)."
  value       = local.build_info.commit
}

# These two CloudFront types take no tags, so the CI deploy role can only be scoped to them by ID (infra/ci reads these).
output "response_headers_policy_id" {
  description = "ID of this environment's CloudFront response headers policy."
  value       = aws_cloudfront_response_headers_policy.security.id
}

output "origin_access_control_id" {
  description = "ID of this environment's CloudFront origin access control."
  value       = aws_cloudfront_origin_access_control.assets.id
}
