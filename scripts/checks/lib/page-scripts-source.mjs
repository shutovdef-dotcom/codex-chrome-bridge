import fs from 'node:fs/promises';
import path from 'node:path';

export const PAGE_SCRIPTS_SOURCE_FILES = Object.freeze([
  'extension/page-scripts.js',
  'extension/page-scripts/main.js',
]);

export async function readPageScriptsSource(rootDir) {
  const parts = await Promise.all(
    PAGE_SCRIPTS_SOURCE_FILES.map((relativePath) => fs.readFile(path.join(rootDir, relativePath), 'utf8').catch(() => '')),
  );
  return parts.join('\n');
}
