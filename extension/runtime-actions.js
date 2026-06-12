import { requireConfirmed } from './safety-gates.js';

export function reloadExtension(payload = {}) {
  requireConfirmed(payload, 'reloadExtension');
  setTimeout(() => chrome.runtime.reload(), 100);
  return {
    reloading: true,
    message: 'Chrome MCP Bridge extension reload requested',
  };
}
