const assert = require('assert');
const { EventEmitter } = require('events');
const {
  trackMediaJobProcess,
  cancelMediaJobRuntime,
  clearMediaJobRuntime,
  isMediaJobCancelled,
  hasActiveMediaJobRuntime
} = require('../src/services/mediaJobs');

(async () => {
  const child = new EventEmitter();
  child.killed = false;
  child.exitCode = null;
  child.killSignals = [];
  child.kill = function kill(signal) {
    this.killSignals.push(signal);
    this.killed = true;
    return true;
  };

  const untrack = trackMediaJobProcess('job-test', child);
  assert.strictEqual(hasActiveMediaJobRuntime('job-test'), true);
  assert.strictEqual(cancelMediaJobRuntime('job-test'), true);
  assert.strictEqual(isMediaJobCancelled('job-test'), true);
  assert.deepStrictEqual(child.killSignals, ['SIGTERM']);
  untrack();
  assert.strictEqual(hasActiveMediaJobRuntime('job-test'), false);
  clearMediaJobRuntime('job-test');
  assert.strictEqual(isMediaJobCancelled('job-test'), false);

  console.log('mediaJobs tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
