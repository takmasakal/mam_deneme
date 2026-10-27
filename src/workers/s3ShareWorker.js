const { pool, initDb } = require('../db');
const { createProcessingStorageService } = require('../services/processingStorageService');
const { createS3ShareSettingsService } = require('../services/s3ShareSettingsService');
const { createAssetShareService } = require('../services/assetShareService');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function start() {
  if (!String(process.env.DATABASE_URL || '').trim()) throw new Error('DATABASE_URL is required');
  const primary = String(process.env.PROCESSING_STORAGE_PRIMARY_ROOT || '').trim();
  if (!primary) throw new Error('PROCESSING_STORAGE_PRIMARY_ROOT is required');
  await initDb();
  const processingStorage = createProcessingStorageService({ defaultStorage: 'primary', roots: { primary } });
  const settingsService = createS3ShareSettingsService({ pool });
  const shares = createAssetShareService({ pool, settingsService, processingStorage });
  let stopped = false;
  const shutdown = async () => { stopped = true; await pool.end(); };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);

  console.log(JSON.stringify({ event: 's3_share_worker_started', pollMs: Number(process.env.S3_SHARE_WORKER_POLL_MS) || 2000 }));
  while (!stopped) {
    try {
      const expired = await shares.enqueueExpiredShares();
      const job = await shares.claimNextJob();
      if (job) {
        try {
          await shares.processJob(job);
          console.log(JSON.stringify({ event: 's3_share_job_completed', jobId: job.job_id, action: job.action }));
        } catch (error) {
          await shares.markJobFailed(job, error);
          console.error(JSON.stringify({ event: 's3_share_job_failed', jobId: job.job_id, action: job.action, error: String(error?.message || error) }));
        }
        continue;
      }
      if (expired) console.log(JSON.stringify({ event: 's3_shares_expiring', count: expired }));
    } catch (error) {
      console.error(JSON.stringify({ event: 's3_share_worker_poll_failed', error: String(error?.message || error) }));
    }
    await sleep(Math.max(500, Number(process.env.S3_SHARE_WORKER_POLL_MS) || 2000));
  }
}

if (require.main === module) start().catch((error) => { console.error(error); process.exitCode = 1; });

module.exports = { start };
