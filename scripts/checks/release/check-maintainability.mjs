import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  projectFileLineCount,
  readProjectFile,
} from '../lib/file-metrics.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

const guide = await readProjectFile(rootDir, 'docs/MAINTAINABILITY.md');
const packageJson = JSON.parse(await readProjectFile(rootDir, 'package.json'));
const hotSpots = [
  { file: 'bin/cli/main.mjs', refactorTarget: true },
  { file: 'mcp/server/main.mjs', refactorTarget: true },
  { file: 'extension/page-scripts/main.js', refactorTarget: true },
  { file: 'scripts/checks/contracts/check-command-registry.mjs', refactorTarget: true },
  { file: 'scripts/checks/cli/check-cli-local-tools.mjs', refactorTarget: true },
  { file: 'scripts/checks/mcp/check-mcp-local-tools.mjs', refactorTarget: true },
];

const hotSpotReport = await Promise.all(hotSpots.map(async (item) => ({
  ...item,
  lines: await projectFileLineCount(rootDir, item.file),
})));

for (const item of hotSpotReport) {
  check(guide.includes(item.file), `maintainability guide must mention hot spot ${item.file}`);
}

check(guide.includes('Source-String Check Policy'), 'maintainability guide must document source-string check policy');
check(guide.includes('Prefer registry-derived assertions'), 'maintainability guide must prefer registry-derived assertions');
check(guide.includes('Dependency Strategy'), 'maintainability guide must document dependency strategy');
check(guide.includes('Zod v4'), 'maintainability guide must document Zod v4 migration criteria');
check(packageJson.dependencies?.zod?.startsWith('^3.'), 'Zod dependency is expected to remain on v3 until migration criteria are met');
check(guide.includes('Adding Or Changing A Command'), 'maintainability guide must document command change workflow');

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures, hotSpots: hotSpotReport }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  hotSpots: hotSpotReport,
  zod: packageJson.dependencies.zod,
  sourceStringPolicy: true,
  commandWorkflow: true,
}, null, 2));
