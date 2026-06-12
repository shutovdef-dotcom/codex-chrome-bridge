import fs from 'node:fs/promises';
import path from 'node:path';

export const REGISTRY_SOURCE_FILES = Object.freeze([
  'shared/command-registry.mjs',
  'shared/registry/actions.mjs',
  'shared/registry/metadata.mjs',
  'shared/registry/cli-usage.mjs',
  'shared/registry/surfaces.mjs',
  'shared/registry/generated-docs.mjs',
  'shared/registry/validation.mjs',
  'shared/registry/index.mjs',
]);

export async function readRegistrySource(rootDir) {
  const parts = await Promise.all(
    REGISTRY_SOURCE_FILES.map((relativePath) => fs.readFile(path.join(rootDir, relativePath), 'utf8').catch(() => '')),
  );
  return parts.join('\n');
}
