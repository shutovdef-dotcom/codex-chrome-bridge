#!/usr/bin/env node
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const aliasDir = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(aliasDir, '..', 'node_modules', 'codex-chrome-bridge', 'mcp', 'chrome-bridge-mcp.mjs');
const child = spawn(process.execPath, [target, ...process.argv.slice(2)], { stdio: 'inherit' });

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
