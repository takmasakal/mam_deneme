const assert = require('assert');
const { createMainBootstrapModule } = require('../public/main-bootstrap');

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function run() {
  const events = [];
  const i18n = deferred();
  const settings = deferred();
  const workflow = deferred();
  const assets = deferred();

  const bootstrap = createMainBootstrapModule({
    loadI18nFile: async () => {
      events.push('i18n:start');
      await i18n.promise;
      events.push('i18n:end');
    },
    loadUiSettings: async () => {
      events.push('settings:start');
      await settings.promise;
      events.push('settings:end');
    },
    prepareShell: () => events.push('shell'),
    loadCurrentUser: async () => events.push('user'),
    loadWorkflow: async () => {
      events.push('workflow:start');
      await workflow.promise;
      events.push('workflow:end');
      return ['Ingested'];
    },
    loadAssets: async () => {
      events.push('assets:start');
      await assets.promise;
      events.push('assets:end');
    },
    openInitialView: async (value) => {
      events.push('initial-view');
      assert.deepStrictEqual(value, ['Ingested']);
    }
  });

  const running = bootstrap.run();
  await Promise.resolve();
  assert.deepStrictEqual(events, ['i18n:start', 'settings:start']);

  i18n.resolve();
  await Promise.resolve();
  assert.strictEqual(events.includes('shell'), false);

  settings.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepStrictEqual(events.slice(0, 6), [
    'i18n:start',
    'settings:start',
    'i18n:end',
    'settings:end',
    'shell',
    'user'
  ]);
  assert.strictEqual(events.includes('workflow:start'), true);
  assert.strictEqual(events.includes('assets:start'), true);
  assert.strictEqual(events.includes('initial-view'), false);

  workflow.resolve();
  await Promise.resolve();
  assert.strictEqual(events.includes('initial-view'), false);

  assets.resolve();
  await running;
  assert.strictEqual(events.at(-1), 'initial-view');
}

run()
  .then(() => console.log('mainBootstrap tests passed'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
