const express = require('express');
const { Pool } = require('pg');
const { createMediaToolService } = require('../services/mediaToolService');
const { createMediaWorkerExecutor } = require('../services/mediaWorkerExecutor');
const { createProcessingStorageService } = require('../services/processingStorageService');
const { createMemoryProcessingJobStore, createPostgresProcessingJobStore } = require('../services/processingJobStore');
const { createProcessingWorkerService } = require('../services/processingWorkerService');
const { PROCESSING_TASKS } = require('../services/processingJobContract');
const { createProcessingWorkerRouter } = require('../routes/processingWorker');

async function start() {
  const token = String(process.env.PROCESSING_WORKER_TOKEN || process.env.MEDIA_OPERATIONS_TOKEN || '').trim();
  if (!token) throw new Error('PROCESSING_WORKER_TOKEN is required');
  const primary = String(process.env.PROCESSING_STORAGE_PRIMARY_ROOT || '').trim();
  const scratch = String(process.env.PROCESSING_STORAGE_SCRATCH_ROOT || '').trim();
  if (!primary || !scratch) throw new Error('Primary and scratch processing storage roots are required');
  const storage = createProcessingStorageService({ defaultStorage: 'primary', roots: { primary, scratch } });
  const mediaTools = createMediaToolService({ proxyMetadataComment: String(process.env.PROXY_METADATA_COMMENT || 'Media Operations tarafından üretilen proxy') });
  const executor = createMediaWorkerExecutor({ storage, mediaTools });
  const usePostgres = String(process.env.PROCESSING_WORKER_STORE || 'postgres').toLowerCase() !== 'memory';
  const pool = usePostgres ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;
  const store = usePostgres ? createPostgresProcessingJobStore({ pool }) : createMemoryProcessingJobStore();
  const tasks = [PROCESSING_TASKS.VIDEO_PROXY, PROCESSING_TASKS.VIDEO_THUMBNAIL, PROCESSING_TASKS.VIDEO_PROBE, PROCESSING_TASKS.AUDIO_EXTRACT, PROCESSING_TASKS.MEDIA_TRANSCODE, PROCESSING_TASKS.VIDEO_OCR_FRAMES, PROCESSING_TASKS.IMAGE_THUMBNAIL, PROCESSING_TASKS.IMAGE_PREVIEW, PROCESSING_TASKS.DOCUMENT_THUMBNAIL, PROCESSING_TASKS.DOCUMENT_PREVIEW];
  const worker = createProcessingWorkerService({ domain: 'media', serviceName: 'media-operations-worker', tasks, store, executor, concurrency: process.env.MEDIA_OPERATIONS_CONCURRENCY, onEvent: (event) => console.log(JSON.stringify({ timestamp: new Date().toISOString(), ...event })) });
  await worker.initialize();
  worker.drain().catch((error) => console.error('Initial worker drain failed', error));
  const app = express();
  app.use(express.json({ limit: process.env.PROCESSING_JOB_BODY_LIMIT || '2mb' }));
  app.use(createProcessingWorkerRouter({ express, worker, token }));
  const port = Math.max(1, Number(process.env.PORT || process.env.MEDIA_OPERATIONS_PORT) || 8080);
  const server = app.listen(port, () => console.log(`Media Operations worker listening on ${port}`));
  const shutdown = async () => { server.close(); await worker.shutdown(); if (pool) await pool.end(); };
  process.once('SIGTERM', shutdown); process.once('SIGINT', shutdown);
  return { app, server, worker };
}

if (require.main === module) start().catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { start };
