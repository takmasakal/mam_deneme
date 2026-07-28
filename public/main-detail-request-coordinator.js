(function attachMainDetailRequestCoordinator(global) {
  function createMainDetailRequestCoordinator(options = {}) {
    const AbortControllerImpl = options.AbortControllerImpl || global.AbortController;
    let sequence = 0;
    let activeController = null;

    function abortActive() {
      if (!activeController) return;
      try {
        activeController.abort();
      } catch (_error) {}
      activeController = null;
    }

    function begin(key = '') {
      abortActive();
      const requestSequence = ++sequence;
      const controller = AbortControllerImpl ? new AbortControllerImpl() : null;
      activeController = controller;
      return {
        key: String(key || ''),
        sequence: requestSequence,
        signal: controller?.signal,
        isCurrent: () => requestSequence === sequence,
        isCancelled: () => requestSequence !== sequence || Boolean(controller?.signal?.aborted)
      };
    }

    function complete(request) {
      if (!request || request.sequence !== sequence) return false;
      activeController = null;
      return true;
    }

    function invalidate() {
      sequence += 1;
      abortActive();
    }

    function isAbortError(error) {
      return Boolean(
        error?.name === 'AbortError'
        || error?.code === 20
        || /aborted|aborterror/i.test(String(error?.message || ''))
      );
    }

    return {
      begin,
      complete,
      invalidate,
      isAbortError,
      currentSequence: () => sequence
    };
  }

  global.createMainDetailRequestCoordinator = createMainDetailRequestCoordinator;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createMainDetailRequestCoordinator };
  }
})(typeof window !== 'undefined' ? window : globalThis);
