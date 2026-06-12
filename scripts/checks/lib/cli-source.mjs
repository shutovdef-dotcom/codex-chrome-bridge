import fs from 'node:fs/promises';
import path from 'node:path';

export const CLI_SOURCE_FILES = Object.freeze([
  'bin/chrome-bridge.mjs',
  'bin/cli/main.mjs',
]);

export async function readCliSource(rootDir) {
  const parts = await Promise.all(
    CLI_SOURCE_FILES.map((relativePath) => fs.readFile(path.join(rootDir, relativePath), 'utf8').catch(() => '')),
  );
  return parts.join('\n');
}
