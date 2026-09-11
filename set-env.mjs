#!/usr/bin/env node
// Push the Discord credentials from .env to the App Runner service's environment variables.
// Values are never printed — only the variable names. Usage: node set-env.mjs [.env.lego]
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const env = Object.fromEntries(
  readFileSync(new URL(process.argv[2] || './.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);

const PROFILE = process.env.AWS_PROFILE || env.AWS_PROFILE || 'default';
const REGION = process.env.AWS_REGION || env.AWS_REGION || 'us-east-1';
const ACCOUNT = process.env.AWS_ACCOUNT_ID || env.AWS_ACCOUNT_ID;
const SERVICE_ID = process.env.APPRUNNER_SERVICE_ID || env.APPRUNNER_SERVICE_ID;
const KEYS = ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'DISCORD_BOT_TOKEN', 'DISCORD_PUBLIC_KEY', 'GAME', 'BRICKSET_API_KEY', 'GAME_TZ'];
const SERVICE_NAME = env.APPRUNNER_SERVICE_NAME || 'pricepoint-discord';

const missing = ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET'].filter((k) => !env[k]);
if (!ACCOUNT || !SERVICE_ID) missing.push('AWS_ACCOUNT_ID / APPRUNNER_SERVICE_ID');
if (missing.length) {
  console.error('missing in .env:', missing.join(', '));
  process.exit(1);
}

const vars = { PUZZLE_SOURCE: 'pricepoint', ALLOW_ANON: '0' };
for (const k of KEYS) if (env[k]) vars[k] = env[k];

const spec = {
  ServiceArn: `arn:aws:apprunner:${REGION}:${ACCOUNT}:service/${SERVICE_NAME}/${SERVICE_ID}`,
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
  console.log(`${SERVICE_NAME}: set ${Object.keys(vars).join(', ')} -> ${out.trim()} (App Runner redeploys in ~2 min)`);
} finally {
  unlinkSync(specPath);
}
