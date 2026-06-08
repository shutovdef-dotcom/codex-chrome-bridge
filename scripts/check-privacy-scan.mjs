#!/usr/bin/env node
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const MAX_FILE_BYTES = 2_000_000;
const SKIP_PREFIXES = Object.freeze([
  '.git/',
  'node_modules/',
]);

const unixHomePrefixes = [
  ['/', 'Users', '/'].join(''),
  ['/', 'home', '/'].join(''),
].map((prefix) => prefix.replaceAll('/', String.raw`\/`));
const windowsHomePrefix = ['C:', '\\', 'Users', '\\'].join('').replaceAll('\\', String.raw`\\`);
const LOCAL_HOME_PATTERN = new RegExp(`(?:^|[^A-Za-z0-9_])(?:${[
  ...unixHomePrefixes,
  windowsHomePrefix,
].join('|')})`);

const CHECKS = Object.freeze([
  Object.freeze({
    id: 'local-home-path',
    pattern: LOCAL_HOME_PATTERN,
  }),
  Object.freeze({
    id: 'private-key',
    pattern: /-----BEGIN (?:RSA |OPENSSH |DSA |EC |PGP )?PRIVATE KEY-----/,
  }),
  Object.freeze({
    id: 'openai-key',
    pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/,
  }),
  Object.freeze({
    id: 'github-token',
    pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
  }),
  Object.freeze({
    id: 'aws-access-key',
    pattern: /\bAKIA[0-9A-Z]{16}\b/,
  }),
  Object.freeze({
    id: 'secret-assignment',
    pattern: /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|secret|password|passwd)\b\s*[:=]\s*["'][^"'\n]{8,}["']/i,
  }),
]);

function shouldSkip(filePath) {
  return SKIP_PREFIXES.some((prefix) => filePath.startsWith(prefix));
}

function lineNumberFor(text, index) {
  return text.slice(0, index).split('\n').length;
}

async function gitFiles() {
  const { stdout } = await execFileAsync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout.split('\0').filter(Boolean).sort();
}

async function scanFile(filePath) {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile() || stat.size > MAX_FILE_BYTES) return { findings: [], scanned: false };

  const buffer = await fs.readFile(filePath);
  if (buffer.includes(0)) return { findings: [], scanned: false };

  const text = buffer.toString('utf8');
  const findings = [];
  for (const check of CHECKS) {
    const match = check.pattern.exec(text);
    if (match) {
      findings.push({
        file: filePath,
        line: lineNumberFor(text, match.index),
        check: check.id,
      });
    }
  }
  return { findings, scanned: true };
}

const files = (await gitFiles()).filter((filePath) => !shouldSkip(filePath));
const findings = [];
let filesScanned = 0;

for (const filePath of files) {
  const result = await scanFile(filePath);
  if (result.scanned) filesScanned += 1;
  findings.push(...result.findings);
}

if (findings.length) {
  process.stderr.write(`${findings.map((finding) => (
    `- ${finding.file}:${finding.line} matched ${finding.check}`
  )).join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(JSON.stringify({
    ok: true,
    filesScanned,
    checks: CHECKS.length,
  }, null, 2));
  process.stdout.write('\n');
}
