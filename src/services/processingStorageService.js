const path = require('path');
const {
  normalizeStorageReference,
  resolveStorageReference,
  toStorageReference
} = require('./processingJobContract');

function normalizeStorageRoots(value = {}) {
  const roots = {};
  Object.entries(value && typeof value === 'object' ? value : {}).forEach(([key, rootValue]) => {
    const storage = String(key || '').trim().toLowerCase();
    const root = String(rootValue || '').trim();
    if (!storage || !root) return;
    // Validate the storage key with the same rules used by job references.
    normalizeStorageReference({ storage, relativePath: '_root_check_' });
    roots[storage] = path.resolve(root);
  });
  return Object.freeze(roots);
}

function createProcessingStorageService(options = {}) {
  const roots = normalizeStorageRoots(options.roots);
  const names = Object.keys(roots);
  if (!names.length) throw new Error('At least one processing storage root is required');
  const defaultStorage = String(options.defaultStorage || names[0]).trim().toLowerCase();
  if (!roots[defaultStorage]) throw new Error(`Unknown default processing storage: ${defaultStorage}`);

  return Object.freeze({
    defaultStorage,
    hasStorage: (storage) => Boolean(roots[String(storage || '').trim().toLowerCase()]),
    listStorages: () => [...names],
    getRoot: (storage = defaultStorage) => {
      const key = String(storage || defaultStorage).trim().toLowerCase();
      if (!roots[key]) throw new Error(`Unknown processing storage: ${key}`);
      return roots[key];
    },
    toReference: (absolutePath, storage = defaultStorage) => {
      const key = String(storage || defaultStorage).trim().toLowerCase();
      if (!roots[key]) throw new Error(`Unknown processing storage: ${key}`);
      return toStorageReference(absolutePath, roots[key], key);
    },
    resolve: (reference) => resolveStorageReference(reference, roots)
  });
}

module.exports = {
  createProcessingStorageService,
  normalizeStorageRoots
};
