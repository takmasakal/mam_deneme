function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function createMemoryProcessingJobStore() {
  const rows = new Map();
  return Object.freeze({
    initialize: async () => {},
    enqueue: async (record) => {
      if (!rows.has(record.jobId)) rows.set(record.jobId, clone(record));
      return clone(rows.get(record.jobId));
    },
    get: async (jobId) => clone(rows.get(String(jobId || '')) || null),
    update: async (jobId, changes) => {
      const current = rows.get(String(jobId || ''));
      if (!current) return null;
      const next = { ...current, ...clone(changes), updatedAt: new Date().toISOString() };
      if (changes.clearLease) {
        next.workerId = '';
        next.leaseExpiresAt = '';
      }
      rows.set(current.jobId, next);
      return clone(next);
    },
    requestCancel: async (jobId) => {
      const current = rows.get(String(jobId || ''));
      if (!current) return null;
      current.cancelRequested = true;
      current.updatedAt = new Date().toISOString();
      return clone(current);
    },
    renewLease: async (jobId, { workerId, leaseMs }) => {
      const current = rows.get(String(jobId || ''));
      if (!current || current.status !== 'running' || current.workerId !== workerId) return null;
      current.leaseExpiresAt = new Date(Date.now() + leaseMs).toISOString();
      current.updatedAt = new Date().toISOString();
      return clone(current);
    },
    claimNext: async ({ workerId, leaseMs }) => {
      const now = Date.now();
      const candidate = [...rows.values()].find((row) =>
        !row.cancelRequested &&
        Number(row.attemptCount || 0) < Number(row.maxAttempts || 1) &&
        (row.status === 'queued' || (row.status === 'running' && Date.parse(row.leaseExpiresAt || '') <= now))
      );
      if (!candidate) return null;
      Object.assign(candidate, {
        status: 'running', phase: 'processing', workerId,
        attemptCount: Number(candidate.attemptCount || 0) + 1,
        leaseExpiresAt: new Date(now + leaseMs).toISOString(),
        startedAt: candidate.startedAt || new Date(now).toISOString(),
        updatedAt: new Date(now).toISOString()
      });
      return clone(candidate);
    }
  });
}

function mapRow(row) {
  if (!row) return null;
  return {
    jobId: row.job_id, job: row.job_payload, status: row.status,
    progress: Number(row.progress || 0), phase: row.phase || '', output: row.output_payload,
    result: row.result_payload, error: row.error_payload,
    attemptCount: Number(row.attempt_count || 0), maxAttempts: Number(row.max_attempts || 1),
    workerId: row.lease_owner || '', leaseExpiresAt: row.lease_expires_at || '',
    cancelRequested: Boolean(row.cancel_requested), createdAt: row.created_at || '',
    updatedAt: row.updated_at || '', startedAt: row.started_at || '', finishedAt: row.finished_at || ''
  };
}

function createPostgresProcessingJobStore(options = {}) {
  const pool = options.pool;
  if (!pool || typeof pool.query !== 'function') throw new Error('PostgreSQL processing job store requires pool');
  const table = String(options.table || 'processing_worker_jobs');
  if (!/^[a-z_][a-z0-9_]*$/i.test(table)) throw new Error('Invalid processing job table name');
  return Object.freeze({
    initialize: async () => {
      await pool.query(`CREATE TABLE IF NOT EXISTS ${table} (
        job_id text PRIMARY KEY, domain text NOT NULL, task text NOT NULL,
        application text NOT NULL, asset_id text NOT NULL, job_payload jsonb NOT NULL,
        status text NOT NULL DEFAULT 'queued', progress integer NOT NULL DEFAULT 0,
        phase text NOT NULL DEFAULT 'queued', output_payload jsonb, result_payload jsonb,
        error_payload jsonb, attempt_count integer NOT NULL DEFAULT 0,
        max_attempts integer NOT NULL DEFAULT 3, lease_owner text,
        lease_expires_at timestamptz, cancel_requested boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
        started_at timestamptz, finished_at timestamptz
      )`);
      await pool.query(`CREATE INDEX IF NOT EXISTS ${table}_claim_idx ON ${table} (status, lease_expires_at, created_at)`);
    },
    enqueue: async (record) => mapRow((await pool.query(
      `INSERT INTO ${table} (job_id, domain, task, application, asset_id, job_payload, status, progress, phase, output_payload, max_attempts)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10::jsonb,$11)
       ON CONFLICT (job_id) DO UPDATE SET job_id=EXCLUDED.job_id RETURNING *`,
      [record.jobId, record.job.domain, record.job.task, record.job.application, record.job.assetId, JSON.stringify(record.job), record.status, record.progress, record.phase, JSON.stringify(record.output), record.maxAttempts]
    )).rows[0]),
    get: async (jobId) => mapRow((await pool.query(`SELECT * FROM ${table} WHERE job_id=$1`, [jobId])).rows[0]),
    update: async (jobId, changes) => mapRow((await pool.query(
      `UPDATE ${table} SET status=COALESCE($2,status), progress=COALESCE($3,progress), phase=COALESCE($4,phase),
       output_payload=COALESCE($5::jsonb,output_payload), result_payload=COALESCE($6::jsonb,result_payload),
       error_payload=COALESCE($7::jsonb,error_payload), lease_expires_at=CASE WHEN $8::boolean THEN NULL ELSE lease_expires_at END,
       finished_at=COALESCE($9::timestamptz,finished_at), updated_at=now() WHERE job_id=$1 RETURNING *`,
      [jobId, changes.status || null, Number.isFinite(changes.progress) ? changes.progress : null, changes.phase || null,
        changes.output === undefined ? null : JSON.stringify(changes.output), changes.result === undefined ? null : JSON.stringify(changes.result),
        changes.error === undefined ? null : JSON.stringify(changes.error), Boolean(changes.clearLease), changes.finishedAt || null]
    )).rows[0]),
    requestCancel: async (jobId) => mapRow((await pool.query(`UPDATE ${table} SET cancel_requested=true, updated_at=now() WHERE job_id=$1 RETURNING *`, [jobId])).rows[0]),
    renewLease: async (jobId, { workerId, leaseMs }) => mapRow((await pool.query(
      `UPDATE ${table} SET lease_expires_at=now()+($3::bigint * interval '1 millisecond'), updated_at=now()
       WHERE job_id=$1 AND status='running' AND lease_owner=$2 RETURNING *`, [jobId, workerId, leaseMs]
    )).rows[0]),
    claimNext: async ({ workerId, leaseMs }) => mapRow((await pool.query(
      `WITH candidate AS (
         SELECT job_id FROM ${table}
         WHERE cancel_requested=false AND attempt_count < max_attempts
           AND (status='queued' OR (status='running' AND lease_expires_at < now()))
         ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
       ) UPDATE ${table} j SET status='running', phase='processing', lease_owner=$1,
         lease_expires_at=now()+($2::bigint * interval '1 millisecond'), attempt_count=j.attempt_count+1,
         started_at=COALESCE(j.started_at,now()), updated_at=now()
       FROM candidate WHERE j.job_id=candidate.job_id RETURNING j.*`, [workerId, leaseMs]
    )).rows[0])
  });
}

module.exports = { createMemoryProcessingJobStore, createPostgresProcessingJobStore, mapRow };
