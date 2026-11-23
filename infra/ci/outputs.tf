# The four values to set as GitHub repository variables (Settings, Secrets and variables, Actions, Variables).

output "deploy_role_arn" {
  description = "GitHub variable AWS_DEPLOY_ROLE_ARN."
  value       = aws_iam_role.deploy.arn
}

output "aws_region" {
  description = "GitHub variable AWS_REGION."
  value       = var.region
}

output "state_bucket" {
  description = "GitHub variable TF_STATE_BUCKET."
  value       = var.state_bucket
}

output "zone_id" {
  description = "GitHub variable ZONE_ID."
  value       = var.zone_id
}
