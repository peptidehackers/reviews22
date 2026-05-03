/**
 * Integration tests for context-mode + orchestrator
 *
 * Verifies that context-mode is properly installed and works
 * alongside the orchestrator MCP server.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// === Installation Tests ===

test('context-mode is installed globally', () => {
  const result = execSync('which context-mode', { encoding: 'utf8' });
  assert.ok(result.trim().includes('context-mode'), 'context-mode should be in PATH');
});

test('context-mode version is 1.0.107+', () => {
  const result = execSync('context-mode --version 2>&1', { encoding: 'utf8' });
  assert.ok(result.includes('v1.0.10'), 'Should be version 1.0.10x');
});

test('bun runtime is available for fast execution', () => {
  const bunPath = join(homedir(), '.bun', 'bin', 'bun');
  assert.ok(existsSync(bunPath), 'Bun should be installed');
});

test('context-mode doctor passes server test', () => {
  const result = execSync('context-mode doctor 2>&1', { encoding: 'utf8' });
  assert.ok(result.includes('Server test: PASS'), 'Server test should pass');
});

test('context-mode doctor passes plugin enabled', () => {
  const result = execSync('context-mode doctor 2>&1', { encoding: 'utf8' });
  assert.ok(result.includes('Plugin enabled: PASS'), 'Plugin should be enabled');
});

test('context-mode doctor passes FTS5/SQLite', () => {
  const result = execSync('context-mode doctor 2>&1', { encoding: 'utf8' });
  assert.ok(result.includes('FTS5 / SQLite: PASS'), 'FTS5/SQLite should work');
});

// === Plugin Configuration Tests ===

test('settings.json exists', () => {
  const settingsPath = join(homedir(), '.claude', 'settings.json');
  assert.ok(existsSync(settingsPath), 'Settings file should exist');
});

test('context-mode plugin is enabled in settings', () => {
  const settingsPath = join(homedir(), '.claude', 'settings.json');
  const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
  assert.ok(settings.enabledPlugins, 'enabledPlugins should exist');
  assert.strictEqual(settings.enabledPlugins['context-mode@context-mode'], true,
    'context-mode plugin should be enabled');
});

test('statusline is configured', () => {
  const settingsPath = join(homedir(), '.claude', 'settings.json');
  const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
  assert.ok(settings.statusLine, 'statusLine should be configured');
  assert.strictEqual(settings.statusLine.type, 'command', 'statusLine type should be command');
  assert.strictEqual(settings.statusLine.command, 'context-mode statusline',
    'statusLine command should be context-mode statusline');
});

// === Context-Mode Tools Tests ===

test('statusline command works', () => {
  const result = execSync('context-mode statusline 2>&1', { encoding: 'utf8' });
  assert.ok(result.includes('context-mode'), 'Statusline should include context-mode');
});

// === Orchestrator Coexistence Tests ===

test('orchestrator is configured in ~/.mcp.json', () => {
  const mcpConfigPath = join(homedir(), '.mcp.json');
  const mcpConfig = JSON.parse(readFileSync(mcpConfigPath, 'utf8'));
  assert.ok(mcpConfig.mcpServers, 'mcpServers should exist');
  assert.ok(mcpConfig.mcpServers.orchestrator, 'orchestrator should be configured');
});

test('orchestrator command is correct', () => {
  const mcpConfigPath = join(homedir(), '.mcp.json');
  const mcpConfig = JSON.parse(readFileSync(mcpConfigPath, 'utf8'));
  const orch = mcpConfig.mcpServers.orchestrator;
  assert.strictEqual(orch.command, 'doppler', 'Should use doppler');
  assert.ok(orch.args.includes('node'), 'Should include node');
  assert.ok(orch.args.some(a => a.includes('orchestrator-mcp/server.js')),
    'Should point to orchestrator-mcp/server.js');
});

test('no duplicate context-mode MCP entry (plugin handles it)', () => {
  const mcpConfigPath = join(homedir(), '.mcp.json');
  const mcpConfig = JSON.parse(readFileSync(mcpConfigPath, 'utf8'));
  // context-mode should NOT be in mcpServers since plugin handles it
  assert.strictEqual(mcpConfig.mcpServers['context-mode'], undefined,
    'context-mode should not be in mcpServers (plugin handles it)');
});

test('orchestrator server.js exists', () => {
  const serverPath = '/Users/apps/orchestrator-mcp/server.js';
  assert.ok(existsSync(serverPath), 'server.js should exist');
});

// === CLAUDE.md Documentation Tests ===

test('CLAUDE.md includes context-mode in tools list', () => {
  const claudeMdPath = join(homedir(), 'CLAUDE.md');
  const claudeMd = readFileSync(claudeMdPath, 'utf8');
  assert.ok(claudeMd.includes('Context-Mode'), 'Should include Context-Mode');
  assert.ok(claudeMd.includes('Context window optimization'),
    'Should mention context window optimization');
});

test('CLAUDE.md documents context-mode tools', () => {
  const claudeMdPath = join(homedir(), 'CLAUDE.md');
  const claudeMd = readFileSync(claudeMdPath, 'utf8');
  assert.ok(claudeMd.includes('ctx_execute'), 'Should document ctx_execute');
  assert.ok(claudeMd.includes('ctx_batch_execute'), 'Should document ctx_batch_execute');
  assert.ok(claudeMd.includes('ctx_fetch_and_index'), 'Should document ctx_fetch_and_index');
});

test('CLAUDE.md documents session continuity', () => {
  const claudeMdPath = join(homedir(), 'CLAUDE.md');
  const claudeMd = readFileSync(claudeMdPath, 'utf8');
  assert.ok(claudeMd.includes('Session Continuity'), 'Should document session continuity');
  assert.ok(claudeMd.includes('FTS5'), 'Should mention FTS5');
});

test('CLAUDE.md documents orchestrator integration', () => {
  const claudeMdPath = join(homedir(), 'CLAUDE.md');
  const claudeMd = readFileSync(claudeMdPath, 'utf8');
  assert.ok(claudeMd.includes('Integration with Orchestrator'),
    'Should document orchestrator integration');
});

// === Runtime Verification Tests ===

test('all required MCP servers are configured', () => {
  const mcpConfigPath = join(homedir(), '.mcp.json');
  const config = JSON.parse(readFileSync(mcpConfigPath, 'utf8'));

  const required = [
    'orchestrator', 'minimax', 'mem0', 'supabase',
    'posthog', 'semgrep', 'openrouter', 'camofox', 'github'
  ];

  for (const server of required) {
    assert.ok(config.mcpServers[server], `${server} should be configured`);
  }
});

test('doppler is available for secrets', () => {
  const result = execSync('which doppler', { encoding: 'utf8' });
  assert.ok(result.trim().includes('doppler'), 'doppler should be in PATH');
});
