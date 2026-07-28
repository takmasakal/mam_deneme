const assert = require('assert');
const { createAdminSystemHealthModule } = require('../public/admin-system-health');

function element() {
  return { textContent: '', innerHTML: '' };
}

async function run() {
  const calls = [];
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const responses = {
    '/api/admin/workflow-tracking': { totals: { total_active: 7, total_all: 9 } },
    '/api/admin/ffmpeg-health': { ffmpegOk: true, ffprobeOk: true },
    '/api/admin/system-health': {
      services: {
        app: { ok: true },
        postgres: { ok: true },
        elasticsearch: { ok: true },
        keycloak: { ok: true },
        oauth2Proxy: { ok: true }
      },
      jobs: {},
      disk: {},
      integrity: {},
      recentJobs: {}
    },
    '/api/admin/runtime-diagnostics?limit=100': { activeUsers: [], errors: [] }
  };
  const elements = {
    ffmpegHealth: element(),
    systemHealthRows: element(),
    systemJobStatus: element(),
    overviewActiveAssets: element(),
    overviewTotalAssets: element(),
    overviewSystemHealth: element(),
    overviewSystemHealthSub: element(),
    overviewOpenErrors: element(),
    overviewOpenErrorsSub: element()
  };
  let diagnosticsRenders = 0;
  const module = createAdminSystemHealthModule({
    api: async (path) => {
      calls.push(path);
      await gate;
      return responses[path];
    },
    t: (key) => key,
    escapeHtml: (value) => String(value ?? ''),
    formatDateTime: () => '-',
    renderRuntimeDiagnostics: () => {
      diagnosticsRenders += 1;
    },
    elements
  });

  const first = module.refresh();
  const concurrent = module.refresh();
  release();
  const [firstValue, concurrentValue] = await Promise.all([first, concurrent]);
  assert.strictEqual(firstValue, concurrentValue, 'concurrent refreshes share one request');
  assert.strictEqual(calls.length, 4, 'each health endpoint is called once');
  assert.strictEqual(elements.overviewActiveAssets.textContent, '7');
  assert.strictEqual(elements.overviewSystemHealth.textContent, 'OK');
  assert(elements.systemHealthRows.innerHTML.includes('health_services'));
  assert.strictEqual(diagnosticsRenders, 1);

  await module.refresh({ force: false });
  assert.strictEqual(calls.length, 4, 'cached language rerender does not call APIs');
  assert.strictEqual(diagnosticsRenders, 2);

  module.clear();
  await module.refresh();
  assert.strictEqual(calls.length, 8, 'clear causes all endpoints to reload');

  console.log('admin system health tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
