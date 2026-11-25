#!/usr/bin/env node
/**
 * Builds the one-folder game pack server owners install: dist/game-pack/[pulse]/ with the pulsemdt resource,
 * every pulse_* script, and a pulse.cfg that starts them in order.
 *
 *   npm run pack:game                        (scripts from ../fivem-scripts)
 *   npm run pack:game -- D:\path\to\scripts  (scripts from somewhere else)
 *   npm run pack:game -- --zip               (also writes dist/game-pack/pulse-game-pack.zip for a release)
 *
 * The scripts stay separate resources inside the folder on purpose: each keeps its own NUI page, Config table and
 * export name, and one failing script cannot take the others down. Owners pick which ones run in the website
 * (Administration > Game scripts); a script switched off there stays loaded but dormant.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const wantZip = args.includes('--zip');
const pathArg = args.find((a) => !a.startsWith('--'));
const scriptsDir = resolve(pathArg ?? process.env.PULSE_SCRIPTS_DIR ?? join(root, '..', 'fivem-scripts'));
const bridge = join(root, 'game', 'pulsemdt');
const out = join(root, 'dist', 'game-pack', '[pulse]');

/** Never shipped: version control, dependencies, and the files a running server writes for itself. */
const SKIP = new Set([
  '.git',
  '.github',
  'node_modules',
  '.DS_Store',
  'Thumbs.db',
  'queue.json',
  'script-config.json',
  'installed-scripts.json',
]);
const copy = (from, to) =>
  cpSync(from, to, { recursive: true, filter: (path) => !SKIP.has(basename(path)) && !path.endsWith('.log') });

const fail = (message) => {
  console.error(`pack:game: ${message}`);
  process.exit(1);
};

if (!existsSync(join(bridge, 'fxmanifest.lua'))) fail(`no pulsemdt resource at ${bridge}`);
if (!existsSync(join(bridge, 'server', 'bridge.js')))
  fail('game/pulsemdt/server/bridge.js is missing. Build it first: npm run build -w @pulsemdt/game-bridge');
if (!existsSync(scriptsDir)) fail(`no pulse_* scripts folder at ${scriptsDir}. Pass its path as the first argument.`);

const scripts = readdirSync(scriptsDir)
  .filter((name) => /^pulse_[a-z0-9_]+$/.test(name))
  .filter((name) => statSync(join(scriptsDir, name)).isDirectory())
  .filter((name) => existsSync(join(scriptsDir, name, 'fxmanifest.lua')))
  .sort();
if (scripts.length === 0) fail(`no pulse_* resources in ${scriptsDir}`);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

copy(bridge, join(out, 'pulsemdt'));
for (const name of scripts) copy(join(scriptsDir, name), join(out, name));

// pulse_notify and pulse_core first: other scripts call into them while starting.
const FIRST = ['pulse_notify', 'pulse_core'];
const order = [...FIRST.filter((n) => scripts.includes(n)), ...scripts.filter((n) => !FIRST.includes(n))];

writeFileSync(
  join(out, 'pulse.cfg'),
  [
    '# PulseMDT game pack. Add these lines to server.cfg (the key comes from the website,',
    '# Administration > Game servers), after your framework (QBCore, Qbox, ESX) if you use one:',
    '#',
    '#   set pulsemdt_api_url "https://api.pulsemdt.com"',
    '#   set pulsemdt_server_key "pmdt_gs_..."',
    '#   exec resources/[pulse]/pulse.cfg',
    '#',
    '# Use set, never setr: the key must stay on the server.',
    '# Choose which features run in the website under Administration > Game scripts. A script switched off',
    '# there stays loaded but does nothing, so you never need to edit this file to turn one off.',
    '',
    'ensure pulsemdt',
    ...order.map((n) => `ensure ${n}`),
    '',
  ].join('\n'),
);

console.log(`pack:game: ${out}`);
console.log(`  pulsemdt + ${scripts.length} scripts: ${order.join(', ')}`);

if (wantZip) {
  // The zip holds the [pulse] folder itself, so it unpacks straight into a server's resources folder.
  const packDir = join(root, 'dist', 'game-pack');
  const zip = join(packDir, 'pulse-game-pack.zip');
  rmSync(zip, { force: true });
  if (process.platform === 'win32') execFileSync('tar', ['-a', '-c', '-f', zip, '[pulse]'], { cwd: packDir });
  else execFileSync('zip', ['-r', '-q', zip, '[pulse]'], { cwd: packDir });
  console.log(`  zip: ${zip}`);
}
