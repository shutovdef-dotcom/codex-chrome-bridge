#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

async function read(relativePath) {
  return fs.readFile(path.join(rootDir, relativePath), 'utf8').catch(() => '');
}

const [
  packageText,
  autonomyText,
  cloudText,
  readmeText,
  safetyText,
  roadmapText,
] = await Promise.all([
  read('package.json'),
  read('docs/AUTONOMY-BOUNDARIES.md'),
  read('docs/CLOUD-AND-SCALE.md'),
  read('README.md'),
  read('docs/SAFETY.md'),
  read('docs/COMPETITIVE-ROADMAP.md'),
]);

const packageJson = packageText ? JSON.parse(packageText) : {};

check(packageJson.scripts?.['check:autonomy-cloud-boundaries'] === 'node ./scripts/checks/docs/check-autonomy-cloud-boundaries.mjs', 'package.json must expose check:autonomy-cloud-boundaries');
check(packageJson.scripts?.check?.includes('npm run check:autonomy-cloud-boundaries'), 'npm run check must include check:autonomy-cloud-boundaries');
check(autonomyText.includes('# Autonomy Boundaries'), 'docs/AUTONOMY-BOUNDARIES.md must exist with the expected title');
check(autonomyText.includes('act-preview') && autonomyText.includes('act-apply'), 'autonomy docs must anchor the supported high-level action model');
check(autonomyText.includes('exactly one deterministic action'), 'autonomy docs must preserve the one-action apply boundary');
check(autonomyText.includes('full autonomous agent-run is research-only'), 'autonomy docs must mark full agent-run as research-only');
check(autonomyText.includes('no remote LLM calls inside the bridge'), 'autonomy docs must forbid remote LLM calls inside the bridge');
check(autonomyText.includes('no self-approval'), 'autonomy docs must forbid self-approval of confirmations');
check(autonomyText.includes('emergency stop') && autonomyText.includes('max steps'), 'autonomy docs must capture future bounded-loop requirements');
check(cloudText.includes('# Cloud And Scale'), 'docs/CLOUD-AND-SCALE.md must exist with the expected title');
check(cloudText.includes('Research-only') && cloudText.includes('Not implemented in this release'), 'cloud docs must mark cloud/scale as research-only');
check(cloudText.includes('local real-profile provider') && cloudText.includes('remote browser provider') && cloudText.includes('artifact provider') && cloudText.includes('policy provider'), 'cloud docs must define the future adapter boundary');
check(cloudText.includes('No CAPTCHA bypass') && cloudText.includes('No proxy or stealth automation') && cloudText.includes('No scraping private content'), 'cloud docs must keep prohibited cloud-browser claims out of scope');
check(cloudText.includes('No API keys') && cloudText.includes('No paid-provider integration') && cloudText.includes('No remote browser execution'), 'cloud docs must avoid provider integration in this release');
check(readmeText.includes('AUTONOMY-BOUNDARIES.md') && readmeText.includes('CLOUD-AND-SCALE.md'), 'README must link autonomy and cloud boundary docs');
check(safetyText.includes('Autonomy boundaries') && safetyText.includes('no self-approval'), 'safety docs must mention autonomy confirmation boundaries');
check(roadmapText.includes('AUTONOMY-BOUNDARIES.md') && roadmapText.includes('CLOUD-AND-SCALE.md'), 'competitive roadmap must link boundary docs');

if (failures.length) {
  process.stdout.write(`${JSON.stringify({ ok: false, failures }, null, 2)}\n`);
  process.exit(1);
}

process.stdout.write(`${JSON.stringify({ ok: true }, null, 2)}\n`);
