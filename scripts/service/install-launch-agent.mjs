#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const label = 'com.codex.chrome-bridge';
const launchAgentsDir = path.join(os.homedir(), 'Library/LaunchAgents');
const logsDir = path.join(os.homedir(), 'Library/Logs/CodexChromeBridge');
const plistPath = path.join(launchAgentsDir, `${label}.plist`);
const nodePath = process.execPath;

function plistString(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${plistString(label)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${plistString(nodePath)}</string>
    <string>${plistString(path.join(rootDir, 'bin/chrome-bridge.mjs'))}</string>
    <string>server</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${plistString(rootDir)}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${plistString(path.join(logsDir, 'stdout.log'))}</string>
  <key>StandardErrorPath</key>
  <string>${plistString(path.join(logsDir, 'stderr.log'))}</string>
</dict>
</plist>
`;

await fs.mkdir(launchAgentsDir, { recursive: true });
await fs.mkdir(logsDir, { recursive: true });
await fs.writeFile(plistPath, plist, 'utf8');

const domain = `gui/${process.getuid()}`;
await execFileAsync('launchctl', ['bootout', domain, plistPath]).catch(() => {});
await execFileAsync('launchctl', ['bootstrap', domain, plistPath]);
await execFileAsync('launchctl', ['kickstart', '-k', `${domain}/${label}`]);

process.stdout.write(`Installed ${label}\n`);
process.stdout.write(`Plist: ${plistPath}\n`);
process.stdout.write(`Logs: ${logsDir}\n`);
