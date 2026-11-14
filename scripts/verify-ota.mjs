#!/usr/bin/env node
// Checks the live OTA endpoint the way the app does: asks for an update,
// verifies the manifest's signature against certs/certificate.pem, then
// downloads every asset and checks its SHA-256.
//
//   node scripts/verify-ota.mjs <runtimeVersion> [--channel production] [--update-id <id>]
import { X509Certificate, createHash, createVerify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const runtime = args[0];
if (!runtime || runtime.startsWith('-')) { console.error('usage: verify-ota.mjs <runtimeVersion> [--channel NAME] [--update-id ID]'); process.exit(2); }
const url = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8')).expo.updates.url;
const fail = (message) => { console.error(`FAIL: ${message}`); process.exit(1); };

const headers = {
  accept: 'multipart/mixed,application/expo+json,application/json',
  'expo-protocol-version': '1',
  'expo-platform': 'android',
  'expo-runtime-version': runtime,
  'expo-channel-name': option('--channel', 'production'),
  'expo-expect-signature': 'sig, keyid="main", alg="rsa-v1_5-sha256"',
};
if (option('--update-id')) headers['expo-current-update-id'] = option('--update-id');
const response = await fetch(url, { headers });
if (response.status === 204) { console.log('204: no update for this runtime/channel'); process.exit(0); }
if (!response.ok) fail(`manifest request ${response.status} ${await response.text()}`);
if (response.headers.get('expo-protocol-version') !== '1') fail('missing expo-protocol-version: 1');
const boundary = /boundary=([^;]+)/.exec(response.headers.get('content-type') || '')?.[1];
if (!boundary) fail(`not multipart: ${response.headers.get('content-type')}`);

const raw = Buffer.from(await response.arrayBuffer()).toString('utf8');
const part = raw.split(`--${boundary}`).find((chunk) => /name="(manifest|directive)"/.test(chunk));
if (!part) fail('no manifest or directive part');
const split = part.indexOf('\r\n\r\n');
const partHeaders = part.slice(0, split);
const body = part.slice(split + 4).replace(/\r\n$/, '');
const kind = /name="(manifest|directive)"/.exec(partHeaders)[1];
const sig = /expo-signature:\s*sig="([^"]+)"/i.exec(partHeaders)?.[1];
if (!sig) fail('part has no expo-signature');
const publicKey = new X509Certificate(readFileSync(join(root, 'certs', 'certificate.pem'))).publicKey;
if (!createVerify('RSA-SHA256').update(body, 'utf8').verify(publicKey, sig, 'base64')) fail('signature does not verify against certs/certificate.pem');
console.log(`OK  ${kind} signature verifies`);

const json = JSON.parse(body);
if (kind === 'directive') { console.log(`    directive ${json.type}`); process.exit(0); }
for (const field of ['id', 'createdAt', 'runtimeVersion', 'launchAsset']) if (!json[field]) fail(`manifest lacks ${field}`);
if (json.runtimeVersion !== runtime) fail(`manifest runtime ${json.runtimeVersion} != ${runtime}`);
console.log(`    update ${json.id} "${json.extra?.message || ''}" ${json.createdAt}`);

const assets = [json.launchAsset, ...(json.assets || [])];
let bytes = 0;
for (const asset of assets) {
  if (!asset.key || /[/\\]/.test(`${asset.key}${asset.fileExtension || ''}`)) fail(`unsafe asset filename ${asset.key}`);
  const download = await fetch(asset.url);
  if (!download.ok) fail(`${asset.url} -> ${download.status}`);
  const data = Buffer.from(await download.arrayBuffer());
  const hash = createHash('sha256').update(data).digest('base64url');
  if (hash !== asset.hash) fail(`hash mismatch for ${asset.url}`);
  bytes += data.length;
}
console.log(`OK  ${assets.length} assets downloaded and hash-checked (${(bytes / 1048576).toFixed(1)} MiB)`);
