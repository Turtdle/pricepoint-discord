#!/usr/bin/env bash
# Build and push a new image. App Runner has auto-deploy on, so pushing :latest redeploys the service.
# Reads AWS_ACCOUNT_ID (and optionally AWS_PROFILE / AWS_REGION) from the environment or .env.
set -euo pipefail
cd "$(dirname "$0")"

envval() { grep -E "^$1=" .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r'; }
PROFILE="${AWS_PROFILE:-$(envval AWS_PROFILE)}"; PROFILE="${PROFILE:-default}"
REGION="${AWS_REGION:-$(envval AWS_REGION)}"; REGION="${REGION:-us-east-1}"
ACCOUNT="${AWS_ACCOUNT_ID:-$(envval AWS_ACCOUNT_ID)}"
[ -n "$ACCOUNT" ] || { echo "AWS_ACCOUNT_ID not set (env or .env)"; exit 1; }

REGISTRY="$ACCOUNT.dkr.ecr.$REGION.amazonaws.com"
REPO="$REGISTRY/pricepoint-discord"

# App Runner rejects OCI image indexes, so no buildx attestations and one explicit platform.
docker build --platform linux/amd64 --provenance=false --sbom=false -t "$REPO:latest" .
aws ecr get-login-password --profile "$PROFILE" --region "$REGION" | docker login --username AWS --password-stdin "$REGISTRY"
docker push "$REPO:latest"
echo "pushed; App Runner will roll it out in a couple of minutes"
