/**
 * @typedef {import('../../types/tool.js').Tool} Tool
 * @typedef {import('../../types/tool.js').ToolManifest} ToolManifest
 * @typedef {import('../../types/tool.js').ToolManifestEntry} ToolManifestEntry
 * @typedef {import('../../core/store.js').Store} Store
 * @typedef {import('../../core/engine.js').Engine} Engine
 */

import { DEFAULT_TOOL_MANIFEST, flattenToolManifest } from './manifest.js';

/**
 * @param {ToolManifestEntry} entry
 * @param {Store} store
 * @returns {Tool}
 */
function instantiateTool(entry, store) {
  const tool = entry.factory(store);
  if (!tool || typeof tool !== 'object') {
    throw new TypeError(`Tool factory for "${entry.id}" did not return a tool object`);
  }
  if (!tool.id) {
    tool.id = entry.id;
  }
  return tool;
}

/**
 * @param {Store} store
 * @param {ToolManifest} [manifest=DEFAULT_TOOL_MANIFEST]
 * @returns {Tool[]}
 */
export function createDefaultTools(store, manifest = DEFAULT_TOOL_MANIFEST) {
  return flattenToolManifest(manifest).map((entry) => instantiateTool(entry, store));
}

/**
 * @param {Engine} engine
 * @param {Store} store
 * @param {ToolManifest} [manifest=DEFAULT_TOOL_MANIFEST]
 * @returns {void}
 */
export function registerDefaultTools(engine, store, manifest = DEFAULT_TOOL_MANIFEST) {
  const tools = createDefaultTools(store, manifest);
  tools.forEach((tool) => engine.register(tool));
}
