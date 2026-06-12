#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import {
  CLI_COMMANDS,
  LOCAL_COMMAND_METADATA,
  MCP_TOOLS,
} from '../../../shared/command-registry.mjs';
import { readRegistrySource } from '../lib/registry-source.mjs';

import { readCliSource } from '../lib/cli-source.mjs';

import { readMcpSource } from '../lib/mcp-source.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

async function readProjectFile(relativePath) {
  return fs.readFile(path.join(rootDir, relativePath), 'utf8').catch(() => '');
}

const [
  packageText,
  helperText,
  registryText,
  cliText,
  mcpText,
  readmeText,
  cliDocsText,
  mcpDocsText,
  packageContentsText,
] = await Promise.all([
  readProjectFile('package.json'),
  readProjectFile('shared/page-search.mjs'),
  readRegistrySource(rootDir),
  readCliSource(rootDir),
  readMcpSource(rootDir),
  readProjectFile('README.md'),
  readProjectFile('docs/CLI.md'),
  readProjectFile('docs/MCP.md'),
  readProjectFile('scripts/package/check-package-contents.mjs'),
]);

const packageJson = packageText ? JSON.parse(packageText) : {};

check(packageJson.scripts?.['check:page-search'] === 'node ./scripts/checks/features/check-page-search.mjs', 'package.json must expose check:page-search');
check(packageJson.scripts?.check?.includes('npm run check:page-search'), 'npm run check must include check:page-search');
const exportsBuildPageSearch = helperText.includes('export function buildPageSearch')
  || helperText.includes('export async function buildPageSearch');
check(exportsBuildPageSearch, 'shared/page-search.mjs must export buildPageSearch');
check(helperText.includes('PAGE_SEARCH_CONTRACT_VERSION'), 'page-search helper must expose a contract version');
check(CLI_COMMANDS.includes('page-search'), 'CLI commands must include page-search');
check(MCP_TOOLS.includes('chrome_bridge_page_search'), 'MCP tools must include chrome_bridge_page_search');
check(LOCAL_COMMAND_METADATA['page-search']?.usesLiveBridge === true, 'page-search must be a live bridge local command');
check(registryText.includes('chrome-bridge page-search --query <text>'), 'registry CLI usage must document page-search');
check(cliText.includes("cmd === 'page-search'") && cliText.includes('buildPageSearch'), 'CLI must implement page-search through buildPageSearch');
check(mcpText.includes('chrome_bridge_page_search') && mcpText.includes('buildPageSearch'), 'MCP must expose chrome_bridge_page_search');
check(readmeText.includes('page-search') && readmeText.includes('ranked snippets'), 'README must document page-search ranked snippets');
check(cliDocsText.includes('page-search') && cliDocsText.includes('ranked snippets'), 'CLI docs must document page-search ranked snippets');
check(mcpDocsText.includes('chrome_bridge_page_search') && mcpDocsText.includes('ranked snippets'), 'MCP docs must document page-search ranked snippets');
check(packageContentsText.includes('shared/page-search.mjs'), 'package contents checker must require shared/page-search.mjs');

if (exportsBuildPageSearch) {
  const helper = await import(pathToFileURL(path.join(rootDir, 'shared/page-search.mjs')).href);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chrome-bridge-page-search-check-'));
  try {
    const out = path.join(tempDir, 'page-search.json');
    const sample = [
      'Acme analytics dashboard overview',
      'Billing address controls live near the account settings section.',
      'Export current report as CSV or XLSX from the toolbar.',
      'Unrelated legal boilerplate repeated several times.',
    ].join('\n');
    const result = await helper.buildPageSearch({
      query: 'download spreadsheet report',
      text: sample,
      source: { url: 'https://example.test/dashboard', title: 'Dashboard' },
      out,
      maxMatches: 3,
    });
    check(result?.contract === helper.PAGE_SEARCH_CONTRACT_VERSION, 'page-search result must expose the contract version');
    check(result?.artifactPath === out, 'page-search must write the full local search artifact');
    check(result?.rawArtifactPath === null || typeof result?.rawArtifactPath === 'string', 'page-search summary must expose raw artifact path when available');
    check(result?.matches?.[0]?.snippet?.toLowerCase().includes('export current report'), 'page-search must rank semantically adjacent export/report text');
    check(!JSON.stringify(result).includes('Unrelated legal boilerplate repeated'), 'page-search stdout summary must not dump unrelated raw body text');
    const artifact = JSON.parse(await fs.readFile(out, 'utf8'));
    check(artifact.matches?.length >= 1, 'page-search local artifact must contain matches');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

if (failures.length) {
  process.stdout.write(`${JSON.stringify({ ok: false, failures }, null, 2)}\n`);
  process.exit(1);
}

process.stdout.write(`${JSON.stringify({ ok: true }, null, 2)}\n`);
