// Where the scoreboard lives. S3 when RESULTS_S3_BUCKET is set (App Runner's disk is wiped on every deploy and
// whenever an instance is replaced), otherwise a local JSON file for development.
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const BUCKET = process.env.RESULTS_S3_BUCKET;
const KEY = process.env.RESULTS_S3_KEY || `${process.env.GAME || 'pricepoint'}/results.json`;
// Lives outside server/ so `node --watch` doesn't restart the dev server every time it's written.
const FILE = new URL(process.env.RESULTS_FILE || '../.data/results.json', import.meta.url);

export const location = BUCKET ? `s3://${BUCKET}/${KEY}` : FILE.pathname;

let s3 = null;
async function client() {
  if (!s3) {
    const { S3Client } = await import('@aws-sdk/client-s3');
    s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
  }
  return s3;
}

export async function load() {
  if (BUCKET) {
    try {
      const { GetObjectCommand } = await import('@aws-sdk/client-s3');
      const r = await (await client()).send(new GetObjectCommand({ Bucket: BUCKET, Key: KEY }));
      return JSON.parse(await r.Body.transformToString());
    } catch (err) {
      if (err.name !== 'NoSuchKey') console.warn('[storage] load failed:', err.name, err.message);
      return null;
    }
  }
  try {
    return JSON.parse(await readFile(FILE, 'utf8'));
  } catch {
    return null;
  }
}

export async function save(data) {
  const body = JSON.stringify(data);
  if (BUCKET) {
    try {
      const { PutObjectCommand } = await import('@aws-sdk/client-s3');
      await (await client()).send(new PutObjectCommand({ Bucket: BUCKET, Key: KEY, Body: body, ContentType: 'application/json' }));
    } catch (err) {
      console.warn('[storage] save failed:', err.name, err.message);
    }
    return;
  }
  await mkdir(new URL('./', FILE), { recursive: true });
  await writeFile(FILE, body);
}
