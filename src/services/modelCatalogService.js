const fs = require('fs');

function normalizeEntry(value = {}) {
  const id = String(value.id || value.model || '').trim();
  const task = String(value.task || '').trim().toLowerCase();
  const provider = String(value.provider || 'local').trim().toLowerCase();
  const path = String(value.path || value.modelDir || '').trim();
  if (!id || !task) throw new Error('Model catalog entry requires id and task');
  return Object.freeze({ id, task, provider, path, variant: String(value.variant || '').trim(), enabled: value.enabled !== false, installed: path ? fs.existsSync(path) : provider === 'ollama' });
}

function createModelCatalogService(options = {}) {
  const entries = Object.freeze((options.entries || []).map(normalizeEntry));
  return Object.freeze({
    list: (task = '') => entries.filter((entry) => entry.enabled && (!task || entry.task === String(task).trim().toLowerCase())).map((entry) => ({ ...entry })),
    requireInstalled: (task, modelId) => {
      const entry = entries.find((item) => item.enabled && item.task === String(task).trim().toLowerCase() && item.id === String(modelId || '').trim());
      if (!entry) throw new Error(`Model is not allowed for ${task}: ${modelId}`);
      if (!entry.installed) throw new Error(`Offline model is not installed: ${entry.id}`);
      return entry;
    }
  });
}

function parseModelCatalogJson(raw) {
  if (!String(raw || '').trim()) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('AI_MODEL_CATALOG_JSON must be an array');
  return parsed;
}

module.exports = { createModelCatalogService, normalizeEntry, parseModelCatalogJson };
