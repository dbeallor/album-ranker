output "url" {
  description = "The address of this environment."
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
