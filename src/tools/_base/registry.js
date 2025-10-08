import { DEFAULT_TOOL_MANIFEST, flattenToolManifest } from './manifest.js';

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

export function createDefaultTools(store, manifest = DEFAULT_TOOL_MANIFEST) {
  return flattenToolManifest(manifest).map((entry) => instantiateTool(entry, store));
}

export function registerDefaultTools(engine, store, manifest = DEFAULT_TOOL_MANIFEST) {
  const tools = createDefaultTools(store, manifest);
  tools.forEach((tool) => engine.register(tool));
}
