const crypto = require('crypto');

function tokenMatches(expected, supplied) {
  const a = Buffer.from(String(expected || ''));
  const b = Buffer.from(String(supplied || ''));
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createProcessingWorkerRouter(options = {}) {
  const express = options.express;
  const worker = options.worker;
  if (!express || typeof express.Router !== 'function') throw new Error('Express is required');
  if (!worker) throw new Error('Processing worker service is required');
  const token = String(options.token || '').trim();
  if (!token) throw new Error('Processing worker token is required');
  const router = express.Router();
  router.get('/health', (_req, res) => res.json(typeof worker.getHealth === 'function' ? worker.getHealth() : { ok: true, ...worker.getCapabilities() }));
  router.use((req, res, next) => {
    const supplied = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    if (!tokenMatches(token, supplied)) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid worker token' } });
    return next();
  });
  router.get('/v1/capabilities', (_req, res) => res.json(worker.getCapabilities()));
  router.post('/v1/jobs', async (req, res) => {
    try { return res.status(202).json(await worker.submit(req.body)); }
    catch (error) { return res.status(400).json({ error: { code: String(error.code || 'INVALID_JOB'), message: String(error.message || error) } }); }
  });
  router.get('/v1/jobs/:jobId', async (req, res) => {
    const state = await worker.get(req.params.jobId);
    return state ? res.json(state) : res.status(404).json({ error: { code: 'JOB_NOT_FOUND', message: 'Processing job not found' } });
  });
  router.delete('/v1/jobs/:jobId', async (req, res) => {
    const state = await worker.cancel(req.params.jobId);
    return state ? res.json(state) : res.status(404).json({ error: { code: 'JOB_NOT_FOUND', message: 'Processing job not found' } });
  });
  return router;
}

module.exports = { createProcessingWorkerRouter, tokenMatches };
