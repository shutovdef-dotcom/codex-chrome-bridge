#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extensionDir = path.join(rootDir, 'extension');
const packageJson = JSON.parse(await fs.readFile(path.join(rootDir, 'package.json'), 'utf8'));
const manifestJson = JSON.parse(await fs.readFile(path.join(extensionDir, 'manifest.json'), 'utf8'));

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) {
      args._.push(value);
      continue;
    }
    const key = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

async function listFiles(dir, prefix = '') {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolutePath = path.join(dir, entry.name);
    const relativePath = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      return listFiles(absolutePath, relativePath);
    }
    if (entry.isFile()) {
      return [relativePath];
    }
    return [];
  }));
  return nested.flat().sort();
}

const args = parseArgs(process.argv.slice(2));
const distDir = path.resolve(args.outDir || path.join(rootDir, 'dist'));
const outputPath = path.resolve(args.out || path.join(
  distDir,
  `chrome-mcp-bridge-extension-v${manifestJson.version}.zip`,
));

if (manifestJson.version !== packageJson.version) {
  throw new Error(`Extension manifest version ${manifestJson.version} does not match package version ${packageJson.version}`);
}

const files = await listFiles(extensionDir);
if (files.length === 0) {
  throw new Error('No extension files found to package');
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.rm(outputPath, { force: true });

await execFileAsync('/usr/bin/zip', ['-X', '-q', outputPath, ...files], {
  cwd: extensionDir,
});

const stat = await fs.stat(outputPath);
process.stdout.write(`${JSON.stringify({
  ok: true,
  action: 'extension-zip',
  version: manifestJson.version,
  outputPath,
  fileCount: files.length,
  sizeBytes: stat.size,
  files,
}, null, 2)}\n`);
