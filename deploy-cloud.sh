#!/usr/bin/env bash
# Build + push in AWS CodeBuild (from the GitHub repo's main branch) instead of local Docker.
# Commit and push first — CodeBuild builds what's on GitHub, not your working tree.
set -euo pipefail
cd "$(dirname "$0")"
envval() { grep -E "^$1=" .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r'; }
PROFILE="${AWS_PROFILE:-$(envval AWS_PROFILE)}"; PROFILE="${PROFILE:-default}"
REGION="${AWS_REGION:-$(envval AWS_REGION)}"; REGION="${REGION:-us-east-1}"

ID=$(aws codebuild start-build --project-name pricepoint-discord-build --profile "$PROFILE" --region "$REGION" --query 'build.id' --output text)
echo "build started: $ID"
while :; do
  read -r STATUS PHASE <<<"$(aws codebuild batch-get-builds --ids "$ID" --profile "$PROFILE" --region "$REGION" --query 'builds[0].[buildStatus,currentPhase]' --output text)"
  printf '\r%s (%s)   ' "$STATUS" "$PHASE"
  case "$STATUS" in SUCCEEDED) echo; echo "pushed; App Runner will roll it out in a couple of minutes"; exit 0;; FAILED|FAULT|STOPPED|TIMED_OUT) echo; echo "build $STATUS — see CodeBuild logs"; exit 1;; esac
  sleep 10
done
