output "url" {
  description = "The address of this environment."
  value       = module.app.url
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
