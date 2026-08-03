const proxyJobs = new Map();
const subtitleJobs = new Map();
const videoOcrJobs = new Map();
const mediaJobProcesses = new Map();
const cancelledMediaJobs = new Set();

function trackMediaJobProcess(jobId, child) {
  const key = String(jobId || '').trim();
  if (!key || !child) return () => {};
  const processes = mediaJobProcesses.get(key) || new Set();
  processes.add(child);
  mediaJobProcesses.set(key, processes);
  return () => {
    const current = mediaJobProcesses.get(key);
    if (!current) return;
    current.delete(child);
    if (!current.size) mediaJobProcesses.delete(key);
  };
}

function isMediaJobCancelled(jobId) {
  return cancelledMediaJobs.has(String(jobId || '').trim());
}

function clearMediaJobRuntime(jobId) {
  const key = String(jobId || '').trim();
  mediaJobProcesses.delete(key);
  cancelledMediaJobs.delete(key);
}

function cancelMediaJobRuntime(jobId) {
  const key = String(jobId || '').trim();
  if (!key) return false;
  cancelledMediaJobs.add(key);
  const processes = Array.from(mediaJobProcesses.get(key) || []);
  processes.forEach((child) => {
    if (!child || child.killed || child.exitCode != null) return;
    try { child.kill('SIGTERM'); } catch (_error) {}
    const timer = setTimeout(() => {
      if (child.killed || child.exitCode != null) return;
      try { child.kill('SIGKILL'); } catch (_error) {}
    }, 3000);
    timer.unref?.();
  });
  const cleanupTimer = setTimeout(() => cancelledMediaJobs.delete(key), 60 * 60 * 1000);
  cleanupTimer.unref?.();
  return processes.length > 0;
}

function hasActiveMediaJobRuntime(jobId) {
  return (mediaJobProcesses.get(String(jobId || '').trim())?.size || 0) > 0;
}

module.exports = {
  proxyJobs,
  subtitleJobs,
  videoOcrJobs,
  trackMediaJobProcess,
  cancelMediaJobRuntime,
  clearMediaJobRuntime,
  isMediaJobCancelled,
  hasActiveMediaJobRuntime
};
