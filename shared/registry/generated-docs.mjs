import {
  BRIDGE_VERSION,
  DEBUGGER_SERIALIZED_ACTIONS,
  EXTENSION_ACTIONS,
} from './actions.mjs';
import { CLI_USAGE_GROUPS, CLI_USAGE_LINES } from './cli-usage.mjs';
import { COMMAND_CATALOG, LOCAL_COMMAND_CATALOG } from './metadata.mjs';
import { CLI_COMMANDS, MCP_TOOLS } from './surfaces.mjs';
export const GENERATED_CLI_REFERENCE_BEGIN = '<!-- BEGIN GENERATED CLI REFERENCE -->';
export const GENERATED_CLI_REFERENCE_END = '<!-- END GENERATED CLI REFERENCE -->';

export function commandCatalog() {
  return {
    version: BRIDGE_VERSION,
    commands: COMMAND_CATALOG,
    localCommands: LOCAL_COMMAND_CATALOG,
    cliCommands: CLI_COMMANDS,
    mcpTools: MCP_TOOLS,
    cliUsageLines: CLI_USAGE_LINES,
    cliUsageGroups: CLI_USAGE_GROUPS,
    debuggerSerializedActions: DEBUGGER_SERIALIZED_ACTIONS,
    counts: {
      actions: EXTENSION_ACTIONS.length,
      localCommands: LOCAL_COMMAND_CATALOG.length,
      cliCommands: CLI_COMMANDS.length,
      mcpTools: MCP_TOOLS.length,
    },
  };
}

function tableCell(value) {
  return String(value).replace(/\|/g, '\\|');
}

function formatTimeoutMs(value) {
  return Number.isFinite(value) ? `${value} ms` : '-';
}

function formatConfirmation(entry) {
  if (entry.requiresSensitiveConfirmation) return 'sensitive';
  if (entry.requiresConfirmation) return 'yes';
  if (entry.requiresConditionalConfirmation) return 'conditional';
  return 'no';
}

export function commandCatalogMarkdown() {
  const rows = COMMAND_CATALOG.map((entry) => [
    entry.action,
    entry.category,
    entry.riskTier,
    formatTimeoutMs(entry.defaultTimeoutMs),
    entry.cli.join(', ') || '-',
    entry.mcp.join(', ') || '-',
    formatConfirmation(entry),
    entry.allowedKeys.join(', ') || '-',
    entry.summary,
  ]);

  return [
    '# Chrome Bridge Command Catalog',
    '',
    `Version: ${BRIDGE_VERSION}`,
    '',
    '| Action | Category | Risk | Default Timeout | CLI | MCP | Confirm | Direct Payload Keys | Summary |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map((row) => `| ${row.map(tableCell).join(' | ')} |`),
    '',
    '## Local Commands And Tools',
    '',
    '| ID | Category | Risk | Default Timeout | CLI | MCP | Live Bridge | Summary |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...LOCAL_COMMAND_CATALOG.map((entry) => `| ${[
      entry.id,
      entry.category,
      entry.riskTier,
      formatTimeoutMs(entry.defaultTimeoutMs),
      entry.cli.join(', ') || '-',
      entry.mcp.join(', ') || '-',
      entry.liveBridge || (entry.usesLiveBridge ? 'yes' : 'no'),
      entry.summary,
    ].map(tableCell).join(' | ')} |`),
    '',
    '## CLI Usage Signatures',
    '',
    '```text',
    ...CLI_USAGE_LINES,
    '```',
    '',
    '## Debugger-Serialized Actions',
    '',
    'These extension actions use the Chrome Debugger API and are serialized per tab by the extension:',
    '',
    ...DEBUGGER_SERIALIZED_ACTIONS.map((action) => `- \`${action}\``),
    '',
  ].join('\n');
}

export const GENERATED_MCP_TOOLS_BEGIN = '<!-- BEGIN GENERATED MCP TOOLS -->';
export const GENERATED_MCP_TOOLS_END = '<!-- END GENERATED MCP TOOLS -->';
export const GENERATED_CLI_SAFETY_NOTES_BEGIN = '<!-- BEGIN GENERATED CLI SAFETY NOTES -->';
export const GENERATED_CLI_SAFETY_NOTES_END = '<!-- END GENERATED CLI SAFETY NOTES -->';
export const GENERATED_MCP_SAFETY_NOTES_BEGIN = '<!-- BEGIN GENERATED MCP SAFETY NOTES -->';
export const GENERATED_MCP_SAFETY_NOTES_END = '<!-- END GENERATED MCP SAFETY NOTES -->';

function commandSurfaceMetadata(surface, id) {
  const surfaceKey = surface === 'cli' ? 'cli' : 'mcp';
  const action = COMMAND_CATALOG.find((entry) => entry[surfaceKey].includes(id));
  if (action) {
    return {
      id,
      contract: action.action,
      riskTier: action.riskTier,
      defaultTimeoutMs: action.defaultTimeoutMs,
      confirm: formatConfirmation(action),
      liveBridge: 'yes',
      summary: action.summary,
    };
  }

  const localCommand = LOCAL_COMMAND_CATALOG.find((entry) => entry[surfaceKey].includes(id));
  if (localCommand) {
    return {
      id,
      contract: localCommand.id,
      riskTier: localCommand.riskTier,
      defaultTimeoutMs: localCommand.defaultTimeoutMs,
      confirm: localCommand.requiresConfirmation ? 'yes' : 'no',
      liveBridge: localCommand.liveBridge,
      summary: localCommand.summary,
    };
  }

  throw new Error(`Missing ${surface.toUpperCase()} metadata for id: ${id}`);
}

function commandSurfaceReferenceMarkdown(surface, ids, firstColumn) {
  const rows = ids.map((id) => {
    const entry = commandSurfaceMetadata(surface, id);
    return `| ${[
      `\`${entry.id}\``,
      `\`${entry.contract}\``,
      entry.riskTier,
      formatTimeoutMs(entry.defaultTimeoutMs),
      entry.confirm,
      entry.liveBridge,
      entry.summary,
    ].map(tableCell).join(' | ')} |`;
  });

  return [
    `| ${firstColumn} | Contract | Risk | Default Timeout | Confirm | Live Bridge | Summary |`,
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

export function cliCommandReferenceMarkdown() {
  return commandSurfaceReferenceMarkdown('cli', CLI_COMMANDS, 'Command');
}

export function generatedCliReferenceBlock() {
  return [
    GENERATED_CLI_REFERENCE_BEGIN,
    cliCommandReferenceMarkdown(),
    GENERATED_CLI_REFERENCE_END,
  ].join('\n');
}

export function mcpToolReferenceMarkdown() {
  return commandSurfaceReferenceMarkdown('mcp', MCP_TOOLS, 'Tool');
}

export function generatedMcpToolsBlock() {
  return [
    GENERATED_MCP_TOOLS_BEGIN,
    mcpToolReferenceMarkdown(),
    GENERATED_MCP_TOOLS_END,
  ].join('\n');
}

function codeList(values) {
  return values.map((value) => `\`${value}\``).join(', ');
}

function commandIdsByConfirmation(surface, ids, confirmation) {
  return ids.filter((id) => commandSurfaceMetadata(surface, id).confirm === confirmation);
}

export function cliSafetyNotesMarkdown() {
  const required = commandIdsByConfirmation('cli', CLI_COMMANDS, 'yes');
  const conditional = commandIdsByConfirmation('cli', CLI_COMMANDS, 'conditional');
  const sensitive = commandIdsByConfirmation('cli', CLI_COMMANDS, 'sensitive');

  return [
    'The safety notes below are generated from the shared registry by `npm run docs:commands`.',
    '',
    `- \`--confirm\` is required for: ${codeList(required)}.`,
    `- \`--confirm\` is conditionally required for: ${codeList(conditional)}; use it with \`--all\` on scoped inventory commands.`,
    `- \`--confirm-sensitive\` is required in addition to \`--confirm\` for private-value requests exposed by: ${codeList(sensitive)}.`,
    '- Live bridge caution: run `reload-extension --confirm`, `doctor --live-checks`, and `runtime-smoke` only when no other session is using the bridge.',
  ].join('\n');
}

export function generatedCliSafetyNotesBlock() {
  return [
    GENERATED_CLI_SAFETY_NOTES_BEGIN,
    cliSafetyNotesMarkdown(),
    GENERATED_CLI_SAFETY_NOTES_END,
  ].join('\n');
}

export function mcpSafetyNotesMarkdown() {
  const required = commandIdsByConfirmation('mcp', MCP_TOOLS, 'yes');
  const conditional = commandIdsByConfirmation('mcp', MCP_TOOLS, 'conditional');
  const sensitive = commandIdsByConfirmation('mcp', MCP_TOOLS, 'sensitive');

  return [
    'The safety notes below are generated from the shared registry by `npm run docs:commands`.',
    '',
    `- \`confirmed: true\` is required for: ${codeList(required)}.`,
    `- \`confirmed: true\` is conditionally required for: ${codeList(conditional)}; use it when passing \`includeAll: true\`.`,
    `- \`confirmSensitive: true\` is required in addition to \`confirmed: true\` for private-value requests exposed by: ${codeList(sensitive)}.`,
    '- Live bridge caution: run `chrome_bridge_reload_extension`, `chrome_bridge_doctor` with `liveChecks: true`, and `chrome_bridge_runtime_smoke` only when no other session is using the bridge.',
  ].join('\n');
}

export function generatedMcpSafetyNotesBlock() {
  return [
    GENERATED_MCP_SAFETY_NOTES_BEGIN,
    mcpSafetyNotesMarkdown(),
    GENERATED_MCP_SAFETY_NOTES_END,
  ].join('\n');
}
