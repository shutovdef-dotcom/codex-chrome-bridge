#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CLI_COMMANDS,
  CLI_USAGE_GROUPS,
  CLI_USAGE_LINES,
  GENERATED_CLI_REFERENCE_BEGIN,
  GENERATED_CLI_REFERENCE_END,
  GENERATED_MCP_TOOLS_BEGIN,
  GENERATED_MCP_TOOLS_END,
  MCP_TOOLS,
  cliCommandReferenceMarkdown,
  generatedCliUsageBlock,
  generatedCliUsageBegin,
  generatedCliUsageEnd,
  mcpToolReferenceMarkdown,
} from '../shared/command-registry.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

const [cliText, mcpText] = await Promise.all([
  fs.readFile(path.join(rootDir, 'docs/CLI.md'), 'utf8'),
  fs.readFile(path.join(rootDir, 'docs/MCP.md'), 'utf8'),
]);

function check(condition, message) {
  if (!condition) failures.push(message);
}

function cliCommandPattern(command) {
  const escaped = command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[\\s\`])(?:chrome-bridge\\s+)?${escaped}(?:[\\s\`\\[]|$)`, 'm');
}

function generatedBlock(text, beginMarker, endMarker) {
  const begin = text.indexOf(beginMarker);
  const end = text.indexOf(endMarker);
  if (begin === -1 || end === -1 || end < begin) return null;
  return text.slice(begin + beginMarker.length, end).trim();
}

for (const command of CLI_COMMANDS) {
  check(cliCommandPattern(command).test(cliText), `docs/CLI.md does not mention CLI command: ${command}`);
}

for (const usageLine of CLI_USAGE_LINES) {
  check(cliText.includes(usageLine), `docs/CLI.md does not include CLI usage signature: ${usageLine}`);
}

for (const group of CLI_USAGE_GROUPS) {
  const actualCliUsageBlock = generatedBlock(
    cliText,
    generatedCliUsageBegin(group.id),
    generatedCliUsageEnd(group.id),
  );
  const expectedCliUsageBlock = generatedCliUsageBlock(group.id)
    .replace(generatedCliUsageBegin(group.id), '')
    .replace(generatedCliUsageEnd(group.id), '')
    .trim();
  check(actualCliUsageBlock !== null, `docs/CLI.md must include generated CLI usage block markers for ${group.id}`);
  check(
    actualCliUsageBlock === expectedCliUsageBlock,
    `docs/CLI.md generated CLI usage block must match registry group: ${group.id}`,
  );
}

const expectedCliReferenceBlock = cliCommandReferenceMarkdown();
const actualCliReferenceBlock = generatedBlock(cliText, GENERATED_CLI_REFERENCE_BEGIN, GENERATED_CLI_REFERENCE_END);
check(actualCliReferenceBlock !== null, 'docs/CLI.md must include generated CLI reference block markers');
check(
  actualCliReferenceBlock === expectedCliReferenceBlock,
  'docs/CLI.md generated CLI reference block must exactly match registry CLI command metadata',
);
check(
  actualCliReferenceBlock?.includes('| Command | Contract | Risk | Default Timeout | Confirm | Live Bridge | Summary |'),
  'docs/CLI.md generated CLI reference block must expose registry risk, timeout, confirmation, live-bridge, and summary metadata',
);
check(
  actualCliReferenceBlock?.includes('| `runtime-smoke` | `runtime-smoke` | interaction | 180000 ms | no | yes |'),
  'docs/CLI.md generated CLI reference block must expose local live-bridge metadata for runtime smoke',
);
check(
  actualCliReferenceBlock?.includes('| `cookies` | `cookiesList` | private-read | 30000 ms | sensitive | yes |'),
  'docs/CLI.md generated CLI reference block must expose sensitive confirmation metadata for private browser data commands',
);

for (const tool of MCP_TOOLS) {
  check(mcpText.includes(tool), `docs/MCP.md does not mention MCP tool: ${tool}`);
}

const expectedMcpToolBlock = mcpToolReferenceMarkdown();
const actualMcpToolBlock = generatedBlock(mcpText, GENERATED_MCP_TOOLS_BEGIN, GENERATED_MCP_TOOLS_END);
check(actualMcpToolBlock !== null, 'docs/MCP.md must include generated MCP tool block markers');
check(
  actualMcpToolBlock === expectedMcpToolBlock,
  'docs/MCP.md generated MCP tool block must exactly match registry MCP_TOOLS',
);
check(
  actualMcpToolBlock?.includes('| Tool | Contract | Risk | Default Timeout | Confirm | Live Bridge | Summary |'),
  'docs/MCP.md generated MCP tool block must expose registry risk, timeout, confirmation, live-bridge, and summary metadata',
);
check(
  actualMcpToolBlock?.includes('| `chrome_bridge_runtime_smoke` | `runtime-smoke` | interaction | 180000 ms | no | yes |'),
  'docs/MCP.md generated MCP tool block must expose local live-bridge metadata for runtime smoke',
);
check(
  actualMcpToolBlock?.includes('| `chrome_bridge_cookies_list` | `cookiesList` | private-read | 30000 ms | sensitive | yes |'),
  'docs/MCP.md generated MCP tool block must expose sensitive confirmation metadata for private browser data tools',
);

check(cliText.includes('COMMAND-CATALOG.md'), 'docs/CLI.md must link to generated command catalog');
check(mcpText.includes('COMMAND-CATALOG.md'), 'docs/MCP.md must link to generated command catalog');

if (failures.length) {
  process.stderr.write(`${failures.map((failure) => `- ${failure}`).join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(JSON.stringify({
    ok: true,
    cliCommands: CLI_COMMANDS.length,
    cliUsageGroups: CLI_USAGE_GROUPS.length,
    cliUsageLines: CLI_USAGE_LINES.length,
    mcpTools: MCP_TOOLS.length,
  }, null, 2));
  process.stdout.write('\n');
}
