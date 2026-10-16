const express = require('express');
const { Pool } = require('pg');
const { createAiWorkerExecutor } = require('../services/aiWorkerExecutor');
const { createModelCatalogService, parseModelCatalogJson } = require('../services/modelCatalogService');
const { createProcessingStorageService } = require('../services/processingStorageService');
const { createMemoryProcessingJobStore, createPostgresProcessingJobStore } = require('../services/processingJobStore');
const { createProcessingWorkerService } = require('../services/processingWorkerService');
const { PROCESSING_TASKS } = require('../services/processingJobContract');
const { createProcessingWorkerRouter } = require('../routes/processingWorker');

async function start() {
  const token = String(process.env.PROCESSING_WORKER_TOKEN || process.env.AI_OPERATIONS_TOKEN || '').trim();
  if (!token) throw new Error('PROCESSING_WORKER_TOKEN is required');
  const primary = String(process.env.PROCESSING_STORAGE_PRIMARY_ROOT || '').trim();
  const scratch = String(process.env.PROCESSING_STORAGE_SCRATCH_ROOT || '').trim();
  if (!primary || !scratch) throw new Error('Primary and scratch processing storage roots are required');
  const storage = createProcessingStorageService({ defaultStorage: 'primary', roots: { primary, scratch } });
  const catalog = createModelCatalogService({ entries: parseModelCatalogJson(process.env.AI_MODEL_CATALOG_JSON) });
  const executor = createAiWorkerExecutor({ storage, catalog, ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434', ollamaKeepAlive: process.env.OLLAMA_METADATA_KEEP_ALIVE || '10m', env: { MAM_OFFLINE_MODE: 'true', HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1', MAM_MODEL_CACHE_DIR: process.env.MAM_MODEL_CACHE_DIR, WHISPER_MODEL_CACHE: process.env.WHISPER_MODEL_CACHE } });
  const usePostgres = String(process.env.PROCESSING_WORKER_STORE || 'postgres').toLowerCase() !== 'memory';
  const pool = usePostgres ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;
  const store = usePostgres ? createPostgresProcessingJobStore({ pool, table: 'ai_processing_worker_jobs' }) : createMemoryProcessingJobStore();
  const tasks = [PROCESSING_TASKS.SUBTITLE_GENERATE, PROCESSING_TASKS.SUBTITLE_TRANSLATE, PROCESSING_TASKS.VIDEO_OCR, PROCESSING_TASKS.PHOTO_OCR, PROCESSING_TASKS.METADATA_ENRICH, PROCESSING_TASKS.DOCUMENT_SUMMARIZE];
  const worker = createProcessingWorkerService({ domain: 'ai', serviceName: 'ai-operations-worker', tasks, models: catalog.list(), store, executor, concurrency: process.env.AI_OPERATIONS_CONCURRENCY, onEvent: (event) => console.log(JSON.stringify({ timestamp: new Date().toISOString(), ...event })) });
  await worker.initialize();
  worker.drain().catch(console.error);
  const app = express();
  app.use(express.json({ limit: process.env.PROCESSING_JOB_BODY_LIMIT || '2mb' }));
  app.use(createProcessingWorkerRouter({ express, worker, token }));
  const port = Math.max(1, Number(process.env.PORT || process.env.AI_OPERATIONS_PORT) || 8081);
  const server = app.listen(port, () => console.log(`AI Operations worker listening on ${port}`));
  const shutdown = async () => { server.close(); await worker.shutdown(); if (pool) await pool.end(); };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  return { app, server, worker };
}

if (require.main === module) start().catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { start };
