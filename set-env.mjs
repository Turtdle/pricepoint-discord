#!/usr/bin/env node
// Push the Discord credentials from .env to the App Runner service's environment variables.
// Values are never printed — only the variable names. Usage: node set-env.mjs
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PROFILE = process.env.AWS_PROFILE || 'personal';
const REGION = process.env.AWS_REGION || 'us-east-1';
const ACCOUNT = 'AWS_ACCOUNT_ID';
const SERVICE_ARN = `arn:aws:apprunner:${REGION}:${ACCOUNT}:service/pricepoint-discord/APPRUNNER_SERVICE_ID`;
const KEYS = ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'DISCORD_BOT_TOKEN', 'DISCORD_PUBLIC_KEY'];

const env = Object.fromEntries(
  readFileSync(new URL('./.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);

const vars = { PUZZLE_SOURCE: 'pricepoint', ALLOW_ANON: '0' };
for (const k of KEYS) if (env[k]) vars[k] = env[k];
const missing = ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET'].filter((k) => !vars[k]);
if (missing.length) {
  console.error('missing in .env:', missing.join(', '));
  process.exit(1);
}

const spec = {
  ServiceArn: SERVICE_ARN,
  SourceConfiguration: {
    AuthenticationConfiguration: { AccessRoleArn: `arn:aws:iam::${ACCOUNT}:role/AppRunnerECRAccessRole` },
    AutoDeploymentsEnabled: true,
    ImageRepository: {
      ImageIdentifier: `${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/pricepoint-discord:latest`,
      ImageRepositoryType: 'ECR',
      ImageConfiguration: { Port: '3001', RuntimeEnvironmentVariables: vars },
    },
  },
};

const specPath = join(tmpdir(), `apprunner-env-${process.pid}.json`);
writeFileSync(specPath, JSON.stringify(spec));
try {
  const out = execFileSync(
    'aws',
    ['apprunner', 'update-service', '--cli-input-json', `file://${specPath}`, '--query', 'Service.Status', '--output', 'text', '--profile', PROFILE, '--region', REGION],
    { encoding: 'utf8' },
  );
  console.log(`set ${Object.keys(vars).join(', ')} -> ${out.trim()} (App Runner redeploys in ~2 min)`);
} finally {
  unlinkSync(specPath);
}
