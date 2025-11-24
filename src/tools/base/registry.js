/*
 * ツール仕様
 * 概要: ツール管理や描画エンジンの共通基盤。
 * 入力: ツール実装から呼び出される内部API。
 * 出力: ツール生成やレンダリングに必要なデータ。
 * 操作: ツール登録・遅延処理・タイル描画などを内部で処理。
 */
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
  tool.id = entry.id;
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
