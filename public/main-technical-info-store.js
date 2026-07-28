(function attachMainTechnicalInfoStore(global) {
  function createMainTechnicalInfoStore(fetchTechnicalInfo, options = {}) {
    if (typeof fetchTechnicalInfo !== 'function') {
      throw new TypeError('fetchTechnicalInfo must be a function');
    }

    const maxEntries = Math.max(1, Number(options.maxEntries) || 50);
    const cache = new Map();
    const pending = new Map();
    const generations = new Map();
    let clearGeneration = 0;

    function assetIdOf(assetOrId) {
      if (assetOrId && typeof assetOrId === 'object') {
        return String(assetOrId.id || '').trim();
      }
      return String(assetOrId || '').trim();
    }

    function cacheKey(asset) {
      const id = assetIdOf(asset);
      if (!id) return '';
      return [
        id,
        String(asset?.updatedAt || asset?.updated_at || '').trim(),
        String(asset?.mediaUrl || asset?.media_url || '').trim(),
        String(asset?.proxyUrl || asset?.proxy_url || '').trim(),
        String(asset?.proxyStatus || asset?.proxy_status || '').trim()
      ].join('\u001f');
    }

    function touch(key, value) {
      cache.delete(key);
      cache.set(key, value);
      while (cache.size > maxEntries) {
        cache.delete(cache.keys().next().value);
      }
    }

    async function get(asset, getOptions = {}) {
      const key = cacheKey(asset);
      if (!key) throw new TypeError('asset.id is required');
      const assetId = assetIdOf(asset);
      const force = Boolean(getOptions.force);
      if (force) invalidate(assetId);

      if (!force && cache.has(key)) {
        const value = cache.get(key);
        touch(key, value);
        return value;
      }
      if (!force && pending.has(key)) return pending.get(key);
      const requestGeneration = generations.get(assetId) || 0;
      const requestClearGeneration = clearGeneration;

      const request = Promise.resolve()
        .then(() => fetchTechnicalInfo(asset))
        .then((payload) => {
          if (
            requestClearGeneration === clearGeneration
            && requestGeneration === (generations.get(assetId) || 0)
          ) {
            touch(key, payload);
          }
          return payload;
        });

      pending.set(key, request);
      try {
        return await request;
      } finally {
        if (pending.get(key) === request) pending.delete(key);
      }
    }

    function peek(asset) {
      const key = cacheKey(asset);
      if (!key || !cache.has(key)) return null;
      const value = cache.get(key);
      touch(key, value);
      return value;
    }

    function invalidate(assetOrId) {
      const id = assetIdOf(assetOrId);
      if (!id) return;
      generations.set(id, (generations.get(id) || 0) + 1);
      const prefix = `${id}\u001f`;
      Array.from(cache.keys()).forEach((key) => {
        if (key.startsWith(prefix)) cache.delete(key);
      });
      Array.from(pending.keys()).forEach((key) => {
        if (key.startsWith(prefix)) pending.delete(key);
      });
    }

    function clear() {
      clearGeneration += 1;
      cache.clear();
      pending.clear();
      generations.clear();
    }

    function size() {
      return cache.size;
    }

    return { get, peek, invalidate, clear, size, cacheKey };
  }

  global.createMainTechnicalInfoStore = createMainTechnicalInfoStore;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createMainTechnicalInfoStore };
  }
})(typeof window !== 'undefined' ? window : globalThis);
