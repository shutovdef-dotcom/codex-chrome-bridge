#!/usr/bin/env node
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  LIGHTHOUSE_PLAN_OUTPUT_CONTRACT_VERSION,
  buildLighthousePlan,
} from '../../../shared/lighthouse-plan.mjs';

const execFileAsync = promisify(execFile);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const cliPath = path.join(rootDir, 'bin/chrome-bridge.mjs');
const mcpPath = path.join(rootDir, 'mcp/chrome-bridge-mcp.mjs');
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    failures.push(`${label} did not return JSON: ${error?.message || error}`);
    return null;
  }
}

async function runCli(args) {
  try {
    const result = await execFileAsync(process.execPath, [cliPath, ...args], {
      cwd: rootDir,
      timeout: 15_000,
      maxBuffer: 1024 * 1024,
    });
    return { ok: true, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      ok: false,
      stdout: error?.stdout || '',
      stderr: error?.stderr || '',
      error: String(error?.message || error),
    };
  }
}

async function withMcpClient(fn) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [mcpPath],
    env: process.env,
  });
  const client = new Client({ name: 'chrome-bridge-lighthouse-plan-check', version: '0.1.0' });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

function checkPlanShape(plan, label) {
  check(plan?.ok === true, `${label} must report ok=true`);
  check(plan?.action === 'lighthouse-plan', `${label} must report action=lighthouse-plan`);
  check(plan?.outputContract === LIGHTHOUSE_PLAN_OUTPUT_CONTRACT_VERSION, `${label} must expose the lighthouse-plan output contract version`);
  check(plan?.mode === 'handoff-only', `${label} must stay handoff-only`);
  check(Array.isArray(plan?.finalCommands) && plan.finalCommands.length === 2, `${label} must return exactly two final commands`);
  check(typeof plan?.lighthouseCommand === 'string' && plan.lighthouseCommand.includes('npx lighthouse'), `${label} must emit an npx lighthouse command`);
  check(plan?.lighthouseCommand?.includes('--output json'), `${label} must request JSON output`);
  check(plan?.lighthouseCommand?.includes('--output-path'), `${label} must emit an output path`);
  check(plan?.followUpCommand?.includes('chrome-bridge lighthouse-ingest --report'), `${label} must emit the ingest follow-up command`);
  check(plan?.finalCommands?.[0] === plan?.lighthouseCommand, `${label} must place the Lighthouse command first`);
  check(plan?.finalCommands?.[1] === plan?.followUpCommand, `${label} must place the ingest command second`);
  check(plan?.privacy?.runsLighthouseDirectly === false, `${label} must state that the bridge does not run Lighthouse directly`);
  check(plan?.privacy?.rawReportInStdout === false, `${label} must state that the raw report is kept out of stdout`);
}

const directPlan = buildLighthousePlan({
  url: 'https://example.com/shop?ref=bridge',
  out: '/tmp/lighthouse-report.json',
  summaryOut: '/tmp/lighthouse-summary.json',
  chromePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  chromeFlags: '--headless=new',
  emulatedFormFactor: 'mobile',
  onlyCategories: 'performance,seo',
});
checkPlanShape(directPlan, 'Direct helper');
check(directPlan.url === 'https://example.com/shop?ref=bridge', 'Direct helper must normalize the URL');
check(directPlan.reportPath === path.resolve('/tmp/lighthouse-report.json'), 'Direct helper must preserve custom report path');
check(directPlan.summaryPath === path.resolve('/tmp/lighthouse-summary.json'), 'Direct helper must preserve custom summary path');
check(directPlan.lighthouseCommand.includes("--emulated-form-factor 'mobile'"), 'Direct helper must forward emulated form factor');
check(directPlan.lighthouseCommand.includes("--only-categories 'performance,seo'"), 'Direct helper must forward only-categories');
check(directPlan.lighthouseCommand.includes("--chrome-path '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'"), 'Direct helper must forward chrome-path');
check(directPlan.lighthouseCommand.includes("--chrome-flags '--headless=new'"), 'Direct helper must forward chrome flags');
check(directPlan.followUpCommand.includes("--out '/tmp/lighthouse-summary.json'"), 'Direct helper must forward summary path to ingest');

let invalidRejected = false;
try {
  buildLighthousePlan({ url: 'file:///tmp/index.html' });
} catch (error) {
  invalidRejected = String(error?.message || error).includes('http:// or https://');
}
check(invalidRejected, 'Direct helper must reject non-http(s) URLs');

const cliResult = await runCli([
  'lighthouse-plan',
  '--url',
  'https://example.com/products',
  '--out',
  '/tmp/cli-lighthouse-report.json',
  '--summary-out',
  '/tmp/cli-lighthouse-summary.json',
  '--only-categories',
  'performance',
]);
check(cliResult.ok, `CLI lighthouse-plan must succeed: ${cliResult.stderr || cliResult.error || cliResult.stdout}`);
const cliJson = parseJson(cliResult.stdout, 'CLI lighthouse-plan');
checkPlanShape(cliJson, 'CLI lighthouse-plan');
check(cliJson?.reportPath === path.resolve('/tmp/cli-lighthouse-report.json'), 'CLI lighthouse-plan must forward --out');
check(cliJson?.summaryPath === path.resolve('/tmp/cli-lighthouse-summary.json'), 'CLI lighthouse-plan must forward --summary-out');
check(cliJson?.lighthouseCommand?.includes("--only-categories 'performance'"), 'CLI lighthouse-plan must forward --only-categories');

const cliInvalid = await runCli(['lighthouse-plan', '--url', 'about:blank']);
check(!cliInvalid.ok, 'CLI lighthouse-plan must fail for non-http(s) URLs');
check((cliInvalid.stderr || cliInvalid.error || '').includes('http:// or https://'), 'CLI lighthouse-plan invalid URL failure must explain the protocol requirement');

await withMcpClient(async (client) => {
  const tools = await client.listTools();
  check(tools.tools.some((tool) => tool.name === 'chrome_bridge_lighthouse_plan'), 'MCP listTools must include chrome_bridge_lighthouse_plan');

  const result = await client.callTool({
    name: 'chrome_bridge_lighthouse_plan',
    arguments: {
      url: 'https://example.com/docs',
      out: '/tmp/mcp-lighthouse-report.json',
      summaryOut: '/tmp/mcp-lighthouse-summary.json',
      emulatedFormFactor: 'desktop',
    },
  });
  const text = result.content?.find((entry) => entry.type === 'text')?.text || '';
  const json = parseJson(text, 'MCP lighthouse-plan');
  checkPlanShape(json, 'MCP lighthouse-plan');
  check(json?.reportPath === path.resolve('/tmp/mcp-lighthouse-report.json'), 'MCP lighthouse-plan must forward out');
  check(json?.summaryPath === path.resolve('/tmp/mcp-lighthouse-summary.json'), 'MCP lighthouse-plan must forward summaryOut');
});

if (failures.length > 0) {
  process.stderr.write(`check-lighthouse-plan failed (${failures.length} issue(s)):\n`);
  for (const failure of failures) {
    process.stderr.write(`- ${failure}\n`);
  }
  process.exit(1);
}

process.stdout.write('check-lighthouse-plan: ok\n');
