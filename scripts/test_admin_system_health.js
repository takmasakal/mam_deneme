const assert = require('assert');
const { createAdminSystemHealthModule } = require('../public/admin-system-health');

function element() {
  const listeners = {};
  return {
    textContent: '',
    innerHTML: '',
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
    dispatch(type, event) {
      return listeners[type]?.(event);
    }
  };
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
      recentJobs: {},
      mediaJobs: [
        {
          jobId: 'job-1',
          jobType: 'subtitle',
          assetTitle: 'Sample video',
          status: 'running',
          progress: 52,
          progressPhase: 'transcribing',
          updatedAt: new Date().toISOString(),
          cancelable: true
        },
        {
          jobId: 'job-2',
          jobType: 'video_ocr',
          assetTitle: 'Older OCR',
          status: 'failed',
          progress: 60,
          updatedAt: new Date(Date.now() - (2 * 24 * 60 * 60 * 1000)).toISOString()
        },
        {
          jobId: 'job-3',
          jobType: 'subtitle',
          assetTitle: 'Old subtitle',
          status: 'completed',
          progress: 100,
          updatedAt: new Date(Date.now() - (15 * 24 * 60 * 60 * 1000)).toISOString()
        }
      ]
    },
    '/api/admin/runtime-diagnostics?limit=100': { activeUsers: [], errors: [] }
  };
  responses['/api/admin/system-health?refresh=1'] = responses['/api/admin/system-health'];
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
  assert(elements.systemJobStatus.innerHTML.includes('media-jobs-table'));
  assert(elements.systemJobStatus.innerHTML.includes('data-filter-key="jobType"'));
  assert(/<th><div class="media-job-column-filter"><details class="media-job-filter-menu">/.test(elements.systemJobStatus.innerHTML));
  assert(elements.systemJobStatus.innerHTML.includes('<summary aria-label="health_job_type">health_job_type_short</summary>'));
  assert(elements.systemJobStatus.innerHTML.includes('<summary aria-label="health_job_status">health_job_status</summary>'));
  assert(!elements.systemJobStatus.innerHTML.includes('<span>health_job_type</span>'));
  assert(!elements.systemJobStatus.innerHTML.includes('<span>health_job_status</span>'));
  assert(elements.systemJobStatus.innerHTML.includes('mediaJobsRefreshBtn'));
  assert(elements.systemJobStatus.innerHTML.includes('52%'));
  assert(elements.systemJobStatus.innerHTML.includes('mediaJobCancelBtn'));
  assert.strictEqual(diagnosticsRenders, 1);

  const filterChange = (key, value) => elements.systemJobStatus.dispatch('change', {
    target: {
      dataset: { mediaJobFilter: key },
      value,
      closest: () => ({ dataset: { mediaJobFilter: key }, value })
    }
  });
  const filterOptionClick = (key, value) => elements.systemJobStatus.dispatch('click', {
    target: {
      dataset: { filterKey: key, filterValue: value },
      closest: (selector) => selector === '.mediaJobFilterOption'
        ? { dataset: { filterKey: key, filterValue: value }, closest: () => null }
        : null
    }
  });
  filterOptionClick('jobType', 'video_ocr');
  assert(elements.systemJobStatus.innerHTML.includes('Older OCR'));
  assert(!elements.systemJobStatus.innerHTML.includes('Sample video'));
  filterOptionClick('jobType', 'all');
  filterOptionClick('status', 'completed');
  assert(elements.systemJobStatus.innerHTML.includes('Old subtitle'));
  assert(!elements.systemJobStatus.innerHTML.includes('Older OCR'));
  filterOptionClick('status', 'cancelled');
  assert(elements.systemJobStatus.innerHTML.includes('media-jobs-table'));
  assert(elements.systemJobStatus.innerHTML.includes('media-jobs-empty-row'));
  filterOptionClick('status', 'all');
  filterChange('days', '1');
  assert(elements.systemJobStatus.innerHTML.includes('Sample video'));
  assert(!elements.systemJobStatus.innerHTML.includes('Older OCR'));

  await module.refresh({ force: false });
  assert.strictEqual(calls.length, 4, 'cached language rerender does not call APIs');
  assert.strictEqual(diagnosticsRenders, 2);

  module.clear();
  await module.refresh();
  assert.strictEqual(calls.length, 8, 'clear causes all endpoints to reload');

  await elements.systemJobStatus.dispatch('click', {
    target: {
      disabled: false,
      closest: (selector) => selector === '.mediaJobsRefreshBtn' ? { disabled: false } : null
    }
  });
  assert.strictEqual(calls.length, 12, 'refresh button reloads all health endpoints');
  assert(calls.includes('/api/admin/system-health?refresh=1'), 'refresh button bypasses server health cache');

  console.log('admin system health tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
