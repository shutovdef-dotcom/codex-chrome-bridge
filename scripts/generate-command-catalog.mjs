#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CLI_USAGE_GROUPS,
  GENERATED_CLI_REFERENCE_BEGIN,
  GENERATED_CLI_REFERENCE_END,
  GENERATED_CLI_SAFETY_NOTES_BEGIN,
  GENERATED_CLI_SAFETY_NOTES_END,
  GENERATED_MCP_TOOLS_BEGIN,
  GENERATED_MCP_TOOLS_END,
  GENERATED_MCP_SAFETY_NOTES_BEGIN,
  GENERATED_MCP_SAFETY_NOTES_END,
  commandCatalogMarkdown,
  generatedCliUsageBegin,
  generatedCliUsageBlock,
  generatedCliUsageEnd,
  generatedCliReferenceBlock,
  generatedCliSafetyNotesBlock,
  generatedMcpSafetyNotesBlock,
  generatedMcpToolsBlock,
} from '../shared/command-registry.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = path.join(rootDir, 'docs/COMMAND-CATALOG.md');
const cliPath = path.join(rootDir, 'docs/CLI.md');
const mcpPath = path.join(rootDir, 'docs/MCP.md');

async function replaceManagedBlock(filePath, beginMarker, endMarker, nextBlock) {
  const text = await fs.readFile(filePath, 'utf8');
  const begin = text.indexOf(beginMarker);
  const end = text.indexOf(endMarker);
  if (begin === -1 || end === -1 || end < begin) {
    throw new Error(`${filePath} is missing generated block markers: ${beginMarker} / ${endMarker}`);
  }
  const before = text.slice(0, begin);
  const after = text.slice(end + endMarker.length);
  await fs.writeFile(filePath, `${before}${nextBlock}${after}`);
}

await fs.writeFile(catalogPath, commandCatalogMarkdown());
await replaceManagedBlock(
  cliPath,
  GENERATED_CLI_REFERENCE_BEGIN,
  GENERATED_CLI_REFERENCE_END,
  generatedCliReferenceBlock(),
);
await replaceManagedBlock(
  cliPath,
  GENERATED_CLI_SAFETY_NOTES_BEGIN,
  GENERATED_CLI_SAFETY_NOTES_END,
  generatedCliSafetyNotesBlock(),
);
for (const group of CLI_USAGE_GROUPS) {
  await replaceManagedBlock(
    cliPath,
    generatedCliUsageBegin(group.id),
    generatedCliUsageEnd(group.id),
    generatedCliUsageBlock(group.id),
  );
}
await replaceManagedBlock(
  mcpPath,
  GENERATED_MCP_TOOLS_BEGIN,
  GENERATED_MCP_TOOLS_END,
  generatedMcpToolsBlock(),
);
await replaceManagedBlock(
  mcpPath,
  GENERATED_MCP_SAFETY_NOTES_BEGIN,
  GENERATED_MCP_SAFETY_NOTES_END,
  generatedMcpSafetyNotesBlock(),
);
process.stdout.write(`Wrote ${catalogPath}\n`);
process.stdout.write(`Updated ${cliPath}\n`);
process.stdout.write(`Updated ${mcpPath}\n`);
