#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const label = 'com.codex.chrome-bridge';
const plistPath = path.join(os.homedir(), 'Library/LaunchAgents', `${label}.plist`);
const domain = `gui/${process.getuid()}`;

await execFileAsync('launchctl', ['bootout', domain, plistPath]).catch(() => {});
await fs.rm(plistPath, { force: true });

process.stdout.write(`Uninstalled ${label}\n`);

