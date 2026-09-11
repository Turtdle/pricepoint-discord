#!/usr/bin/env bash
# Build and push a new image. App Runner has auto-deploy on, so pushing :latest redeploys the service.
set -euo pipefail
cd "$(dirname "$0")"

PROFILE="${AWS_PROFILE:-personal}"
REGION="${AWS_REGION:-us-east-1}"
ACCOUNT=AWS_ACCOUNT_ID
REPO="$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/pricepoint-discord"

# App Runner rejects OCI image indexes, so no buildx attestations and one explicit platform.
docker build --platform linux/amd64 --provenance=false --sbom=false -t "$REPO:latest" .
aws ecr get-login-password --profile "$PROFILE" --region "$REGION" \
  | docker login --username AWS --password-stdin "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com"
docker push "$REPO:latest"
echo "pushed; App Runner will roll it out in a couple of minutes"
