#!/usr/bin/env node
// Over-the-air (OTA) JavaScript updates for the GilTube Android app, served
// by the API at /api/v1/mobile-updates (Expo Updates protocol v1).
//
//   node scripts/publish-ota.mjs publish -m "Fix the sign-in banner"
//   node scripts/publish-ota.mjs status
//   node scripts/publish-ota.mjs rollback              # previous OTA update
//   node scripts/publish-ota.mjs rollback --embedded   # the Play build's own JS
//   node scripts/publish-ota.mjs register-native       # after a Play release
//
// An update only reaches installs whose native code matches its runtime
// version (a fingerprint of android/, native modules, app.json, ...). After
// any native change ship a Play release instead and run register-native for
// it; `publish` refuses runtimes that no registered build uses.
//
// Manifests are signed here with keys/private-key.pem; the app only accepts
// updates signed by the key matching certs/certificate.pem. Options:
//   --channel NAME   default "production" (what Play builds request)
//   --dry-run        export and sign, but publish nothing
//   --yes            no confirmation prompt
import { execFileSync } from 'node:child_process';
import { createHash, createSign, randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const platform = 'android';
const publicURL = 'https://giltube.gilservers.com/api/v1/mobile-updates';
const dataDir = process.env.GILTUBE_MOBILE_UPDATES_DIR || '/mnt/storage/giltube/data/mobile-updates';
const privateKeyPath = join(root, 'keys', 'private-key.pem');

const args = process.argv.slice(2);
const command = args[0] && !args[0].startsWith('-') ? args.shift() : 'status';
const flag = (name) => args.includes(name);
const option = (name, fallback = '') => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const channel = option('--channel', 'production');
const dryRun = flag('--dry-run');

const die = (message) => { console.error(`publish-ota: ${message}`); process.exit(1); };
const npx = (...cmd) => execFileSync('npx', cmd, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 256 * 1024 * 1024 });
const sha256 = (data) => createHash('sha256').update(data);
const base64url = (buffer) => buffer.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
const tokenRE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
if (!tokenRE.test(channel)) die(`invalid channel "${channel}"`);

function resolveRuntimeVersion() {
  const output = npx('expo-updates', 'runtimeversion:resolve', '--platform', platform);
  const runtime = JSON.parse(output.slice(output.indexOf('{'))).runtimeVersion;
  if (!tokenRE.test(runtime || '')) die(`could not resolve the runtime version (${runtime})`);
  return runtime;
}

const runtimeDir = (runtime) => join(dataDir, platform, channel, runtime);
const readCurrent = (runtime) => {
  try { return readFileSync(join(runtimeDir(runtime), 'current'), 'utf8').trim(); } catch { return ''; }
};
const readHistory = (runtime) => {
  try {
    return readFileSync(join(runtimeDir(runtime), 'history.jsonl'), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
  } catch { return []; }
};

function sign(body) {
  if (!existsSync(privateKeyPath)) die(`missing signing key ${privateKeyPath}`);
  return createSign('RSA-SHA256').update(body, 'utf8').sign(readFileSync(privateKeyPath, 'utf8'), 'base64');
}

// Write the update first and switch `current` last (atomic rename), so the
// API never serves an id whose files are not all there.
function activate(runtime, id, files, entry) {
  const dir = join(runtimeDir(runtime), 'updates', id);
  mkdirSync(dir, { recursive: true });
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  const current = join(runtimeDir(runtime), 'current');
  writeFileSync(`${current}.tmp`, `${id}\n`);
  renameSync(`${current}.tmp`, current);
  writeFileSync(join(runtimeDir(runtime), 'history.jsonl'), `${JSON.stringify({ id, at: new Date().toISOString(), ...entry })}\n`, { flag: 'a' });
}

async function confirm(question) {
  if (flag('--yes') || dryRun) return;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`${question} [y/N] `)).trim().toLowerCase();
  rl.close();
  if (answer !== 'y' && answer !== 'yes') die('cancelled');
}

function requireRegistered(runtime) {
  const native = join(runtimeDir(runtime), 'native.json');
  if (existsSync(native) || flag('--force')) return existsSync(native) ? JSON.parse(readFileSync(native, 'utf8')) : null;
  const known = existsSync(join(dataDir, platform, channel)) ? readdirSync(join(dataDir, platform, channel)) : [];
  die(`no Play build is registered for runtime ${runtime}.\n` +
    `Native code or app.json changed since the last registered build (${known.join(', ') || 'none'}), so this JS would not reach anyone.\n` +
    'Ship a Play release and run `register-native`, or pass --force.');
}

async function publish() {
  const message = option('-m') || option('--message');
  if (!message) die('describe the update with -m "..."');
  const runtime = resolveRuntimeVersion();
  const native = requireRegistered(runtime);

  const outDir = join(root, 'dist-ota', `export-${Date.now()}`);
  console.log(`Exporting the ${platform} bundle…`);
  execFileSync('npx', ['expo', 'export', '--platform', platform, '--output-dir', outDir], { cwd: root, stdio: 'inherit' });
  const metadata = JSON.parse(readFileSync(join(outDir, 'metadata.json'), 'utf8')).fileMetadata[platform];
  const expoClient = JSON.parse(npx('expo', 'config', '--type', 'public', '--json'));

  const assetsDir = join(dataDir, 'assets');
  const toCopy = [];
  const describe = (relativePath, ext, contentType) => {
    const data = readFileSync(join(outDir, relativePath));
    const hex = sha256(data).digest('hex');
    const name = `${hex}.${ext}`;
    toCopy.push([join(outDir, relativePath), join(assetsDir, name)]);
    return {
      hash: base64url(sha256(data).digest()),
      key: createHash('md5').update(data).digest('hex'),
      contentType,
      fileExtension: `.${ext}`,
      url: `${publicURL}/assets/${name}`,
    };
  };
  const contentTypes = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', ttf: 'font/ttf', otf: 'font/otf', json: 'application/json', mp3: 'audio/mpeg', mp4: 'video/mp4' };
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const manifest = {
    id,
    createdAt,
    runtimeVersion: runtime,
    launchAsset: describe(metadata.bundle, 'hbc', 'application/javascript'),
    assets: metadata.assets.map((asset) => describe(asset.path, asset.ext.toLowerCase(), contentTypes[asset.ext.toLowerCase()] || 'application/octet-stream')),
    metadata: {},
    extra: { expoClient, message },
  };
  const body = JSON.stringify(manifest);
  const signature = sign(body);
  const size = toCopy.reduce((total, [from]) => total + readFileSync(from).length, 0);

  console.log(`\nUpdate ${id}\n  runtime  ${runtime}${native ? ` (Play ${native.version}, versionCode ${native.versionCode})` : ' (unregistered, --force)'}\n  channel  ${channel}\n  message  ${message}\n  files    ${toCopy.length}, ${(size / 1048576).toFixed(1)} MiB`);
  if (dryRun) {
    console.log(`\nDry run: signed manifest left in ${outDir}/ota-manifest.json`);
    writeFileSync(join(outDir, 'ota-manifest.json'), body);
    return;
  }
  await confirm(`Publish to every ${channel} install on this runtime?`);
  mkdirSync(assetsDir, { recursive: true });
  for (const [from, to] of toCopy) {
    if (existsSync(to)) continue;
    copyFileSync(from, `${to}.tmp`);
    renameSync(`${to}.tmp`, to);
  }
  activate(runtime, id, { 'manifest.json': body, 'manifest.sig': signature }, { type: 'update', message, createdAt });
  rmSync(outDir, { recursive: true, force: true });
  console.log(`Published. Apps download it on their next launch or foreground check.`);
}

async function rollback() {
  const runtime = resolveRuntimeVersion();
  const current = readCurrent(runtime);
  if (flag('--embedded')) {
    await confirm(`Send every ${channel} install on runtime ${runtime} back to the JS built into its Play release?`);
    const body = JSON.stringify({ type: 'rollBackToEmbedded', parameters: { commitTime: new Date().toISOString() } });
    activate(runtime, `rollback-${Date.now()}`, { 'directive.json': body, 'directive.sig': sign(body) }, { type: 'rollBackToEmbedded' });
    console.log('Rolled back to the embedded bundle.');
    return;
  }
  const updates = readHistory(runtime).filter((entry) => entry.type === 'update' && entry.id !== current);
  const target = option('--to') ? updates.find((entry) => entry.id === option('--to')) : updates.at(-1);
  if (!target) die('no earlier OTA update to roll back to (use --embedded)');
  // Re-serve the earlier update under a fresh id and createdAt: apps only
  // switch to updates newer than the one they run.
  const old = JSON.parse(readFileSync(join(runtimeDir(runtime), 'updates', target.id, 'manifest.json'), 'utf8'));
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const body = JSON.stringify({ ...old, id, createdAt, extra: { ...old.extra, message: `Rollback to ${target.id}: ${target.message}`, rollbackOf: target.id } });
  await confirm(`Roll ${channel} back to ${target.id} (${target.message})?`);
  activate(runtime, id, { 'manifest.json': body, 'manifest.sig': sign(body) }, { type: 'update', message: `Rollback to ${target.id}`, createdAt, rollbackOf: target.id });
  console.log(`Rolled back: now serving ${target.id}'s bundle as ${id}.`);
}

function registerNative() {
  const runtime = resolveRuntimeVersion();
  const appJSON = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8')).expo;
  const aab = join(root, 'android', 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab');
  // The fingerprint the build embedded must match today's tree, or the
  // registration would point OTA updates at the wrong runtime.
  if (existsSync(aab)) {
    const embedded = execFileSync('python3', ['-I', '-c', 'import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);n=[x for x in z.namelist() if x.endswith("assets/fingerprint")];print(z.read(n[0]).decode().strip() if n else "")', aab], { encoding: 'utf8' }).trim();
    if (embedded && embedded !== runtime) die(`the release AAB was built for runtime ${embedded}, but the tree resolves to ${runtime}. Rebuild first.`);
    if (!embedded) console.warn('publish-ota: could not read the runtime from the AAB; registering the resolved one.');
  } else {
    console.warn('publish-ota: no release AAB found; registering the resolved runtime.');
  }
  if (dryRun) { console.log(`Would register ${runtime} for ${appJSON.version} (${appJSON.android.versionCode})`); return; }
  mkdirSync(runtimeDir(runtime), { recursive: true });
  writeFileSync(join(runtimeDir(runtime), 'native.json'), `${JSON.stringify({ version: appJSON.version, versionCode: appJSON.android.versionCode, registeredAt: new Date().toISOString() }, null, 2)}\n`);
  console.log(`Registered runtime ${runtime} for ${appJSON.version} (versionCode ${appJSON.android.versionCode}).`);
}

function status() {
  const base = join(dataDir, platform, channel);
  const runtimes = existsSync(base) ? readdirSync(base) : [];
  if (!runtimes.length) { console.log(`Nothing registered in ${base}.`); return; }
  for (const runtime of runtimes) {
    let native = null;
    try { native = JSON.parse(readFileSync(join(base, runtime, 'native.json'), 'utf8')); } catch { /* unregistered */ }
    const current = readCurrent(runtime);
    const latest = readHistory(runtime).find((entry) => entry.id === current);
    console.log(`${runtime}  ${native ? `Play ${native.version} (${native.versionCode})` : 'unregistered'}\n  serving: ${current ? `${current} ${latest?.type === 'rollBackToEmbedded' ? '(rollback to embedded)' : `"${latest?.message || ''}" ${latest?.at || ''}`}` : 'embedded bundle (no OTA yet)'}`);
  }
}

const commands = { publish, rollback, 'register-native': registerNative, status };
if (!commands[command]) die(`unknown command "${command}". Use publish, rollback, register-native or status.`);
await commands[command]();
