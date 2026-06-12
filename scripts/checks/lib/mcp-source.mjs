import fs from 'node:fs/promises';
import path from 'node:path';

export const MCP_SOURCE_FILES = Object.freeze([
  'mcp/chrome-bridge-mcp.mjs',
  'mcp/server/main.mjs',
]);

export async function readMcpSource(rootDir) {
  const parts = await Promise.all(
    MCP_SOURCE_FILES.map((relativePath) => fs.readFile(path.join(rootDir, relativePath), 'utf8').catch(() => '')),
  );
  return parts.join('\n');
}
