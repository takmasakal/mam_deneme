(function attachMainAssetGridEventsModule(global) {
  function createMainAssetGridEvents(deps = {}) {
    const {
      assetGrid,
      onPageDirection,
      onPageInput,
      onPageSize,
      onDidYouMean,
      onHitPage,
      onError
    } = deps;
    let attached = false;

    function run(handler, target) {
      if (typeof handler !== 'function') return;
      try {
        Promise.resolve(handler(target)).catch((error) => onError?.(error));
      } catch (error) {
        onError?.(error);
      }
    }

    function consume(event) {
      event.preventDefault();
      event.stopPropagation();
    }

    function resizePageInput(input) {
      if (!input) return;
      input.style.width = `${Math.max(6, String(input.value || '').length + 3)}ch`;
    }

    function handleClick(event) {
      const pageButton = event.target?.closest?.('.asset-list-page-btn');
      if (pageButton) {
        consume(event);
        run(onPageDirection, pageButton);
        return;
      }

      const suggestionButton = event.target?.closest?.('[data-search-did-you-mean]');
      if (suggestionButton) {
        consume(event);
        run(onDidYouMean, suggestionButton);
        return;
      }

      const hitPageButton = event.target?.closest?.('.asset-hit-page-btn');
      if (hitPageButton) {
        consume(event);
        run(onHitPage, hitPageButton);
      }
    }

    function handleInput(event) {
      const input = event.target?.closest?.('.asset-list-page-input');
      if (input) resizePageInput(input);
    }

    function handleKeydown(event) {
      if (event.key !== 'Enter') return;
      const input = event.target?.closest?.('.asset-list-page-input');
      if (!input) return;
      consume(event);
      resizePageInput(input);
      run(onPageInput, input);
    }

    function handleChange(event) {
      const select = event.target?.closest?.('.asset-list-page-size-select');
      if (!select) return;
      run(onPageSize, select);
    }

    function attach() {
      if (attached) return;
      assetGrid.addEventListener('click', handleClick);
      assetGrid.addEventListener('input', handleInput);
      assetGrid.addEventListener('keydown', handleKeydown);
      assetGrid.addEventListener('change', handleChange);
      attached = true;
    }

    function detach() {
      if (!attached) return;
      assetGrid.removeEventListener('click', handleClick);
      assetGrid.removeEventListener('input', handleInput);
      assetGrid.removeEventListener('keydown', handleKeydown);
      assetGrid.removeEventListener('change', handleChange);
      attached = false;
    }

    return { attach, detach, resizePageInput };
  }

  global.createMainAssetGridEvents = createMainAssetGridEvents;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createMainAssetGridEvents };
  }
})(typeof window !== 'undefined' ? window : globalThis);
