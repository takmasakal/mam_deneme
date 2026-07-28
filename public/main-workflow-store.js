(function attachMainWorkflowStore(global) {
  function createMainWorkflowStore(fetchWorkflow) {
    if (typeof fetchWorkflow !== 'function') {
      throw new TypeError('fetchWorkflow must be a function');
    }

    let cachedWorkflow = null;
    let pendingRequest = null;

    async function get(options = {}) {
      const force = Boolean(options?.force);
      if (!force && cachedWorkflow) return cachedWorkflow;
      if (!force && pendingRequest) return pendingRequest;

      const request = Promise.resolve()
        .then(() => fetchWorkflow())
        .then((workflow) => {
          cachedWorkflow = Object.freeze(
            (Array.isArray(workflow) ? workflow : [])
              .map((status) => String(status || '').trim())
              .filter(Boolean)
          );
          return cachedWorkflow;
        });

      pendingRequest = request;
      try {
        return await request;
      } finally {
        if (pendingRequest === request) pendingRequest = null;
      }
    }

    function peek() {
      return cachedWorkflow;
    }

    function clear() {
      cachedWorkflow = null;
      pendingRequest = null;
    }

    return { get, peek, clear };
  }

  global.createMainWorkflowStore = createMainWorkflowStore;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createMainWorkflowStore };
  }
})(typeof window !== 'undefined' ? window : globalThis);
