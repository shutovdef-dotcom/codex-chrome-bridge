import fs from 'node:fs/promises';
import path from 'node:path';

export async function readProjectFile(rootDir, relativePath) {
  return fs.readFile(path.join(rootDir, relativePath), 'utf8');
}

export async function projectFileLineCount(rootDir, relativePath) {
  const text = await readProjectFile(rootDir, relativePath);
  return text.split('\n').length;
}

export async function projectFileLineCounts(rootDir, files) {
  return Promise.all(files.map(async (file) => ({
    file,
    lines: await projectFileLineCount(rootDir, file),
  })));
}
