(function attachMainBootstrapModule(global) {
  function createMainBootstrapModule(deps = {}) {
    const {
      loadI18nFile,
      loadUiSettings,
      prepareShell,
      loadCurrentUser,
      loadWorkflow,
      loadAssets,
      openInitialView
    } = deps;

    async function run() {
      await Promise.all([
        loadI18nFile(),
        loadUiSettings()
      ]);
      prepareShell();
      await loadCurrentUser();
      const [workflow] = await Promise.all([
        loadWorkflow(),
        loadAssets()
      ]);
      await openInitialView(workflow);
      return workflow;
    }

    return { run };
  }

  global.createMainBootstrapModule = createMainBootstrapModule;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createMainBootstrapModule };
  }
})(typeof window !== 'undefined' ? window : globalThis);
