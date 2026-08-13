const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  backupDateStamp,
  compactCommandOutput,
  createBackupService,
  extractResticSnapshotId
} = require('../src/services/backupService');

async function run() {
  assert.strictEqual(
    backupDateStamp(new Date('2026-07-03T17:21:05.123Z'), 'UTC'),
    '2026-07-03T17-21-05-123'
  );
  assert.strictEqual(extractResticSnapshotId('snapshot 1234abcd saved'), '1234abcd');
  assert(!compactCommandOutput('ffmpeg version\nconfiguration: x\nreal error', 200).includes('\n'));

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mam-backup-service-'));
  const uploadsDir = path.join(tmp, 'uploads');
  const backupDir = path.join(tmp, 'backups');
  const resticRepo = path.join(tmp, 'restic-repo');
  fs.mkdirSync(uploadsDir, { recursive: true });
  const calls = [];
  const runCommandCapture = async (cmd, args) => {
    calls.push({ cmd, args });
    if (cmd === 'pg_dump') {
      fs.writeFileSync(args[args.indexOf('-f') + 1], 'dump');
      return { ok: true, stdout: '', stderr: '' };
    }
    if (cmd === 'tar') {
      fs.writeFileSync(args[1], 'archive');
      return { ok: true, stdout: '', stderr: '' };
    }
    if (cmd === 'restic' && args.includes('init')) {
      fs.mkdirSync(resticRepo, { recursive: true });
      fs.writeFileSync(path.join(resticRepo, 'config'), '{}');
      return { ok: true, stdout: '', stderr: '' };
    }
    if (cmd === 'restic' && args.includes('backup')) {
      return { ok: true, stdout: 'snapshot abcdef123456 saved', stderr: '' };
    }
    if (cmd === 'restic' && args.includes('forget')) {
      return { ok: true, stdout: '', stderr: '' };
    }
    if (cmd === 'restic' && args.includes('snapshots')) {
      return { ok: true, stdout: '[]', stderr: '' };
    }
    return { ok: true, stdout: '', stderr: '' };
  };
  const normalizeBackupSettings = (value = {}) => ({
    enabled: Boolean(value.enabled),
    directory: value.directory || backupDir,
    dailyHour: Number.isFinite(Number(value.dailyHour)) ? Number(value.dailyHour) : 3,
    includeMamDb: Boolean(value.includeMamDb),
    includeKeycloakDb: Boolean(value.includeKeycloakDb),
    includeUploadsArchive: Boolean(value.includeUploadsArchive),
    includeUploadsRestic: Boolean(value.includeUploadsRestic),
    resticRepository: value.resticRepository || resticRepo,
    resticKeepDaily: Number(value.resticKeepDaily || 14),
    resticKeepWeekly: Number(value.resticKeepWeekly || 8),
    resticKeepMonthly: Number(value.resticKeepMonthly || 12),
    retentionDays: Number(value.retentionDays || 30)
  });
  const service = createBackupService({
    uploadsDir,
    defaultBackupDir: backupDir,
    defaultResticRepository: resticRepo,
    backupTimeZone: 'UTC',
    runCommandCapture,
    normalizeBackupSettings,
    defaultBackupSettings: normalizeBackupSettings(),
    readEnvOrFile: (name) => (name === 'RESTIC_PASSWORD' ? 'secret' : ''),
    logger: { log() {}, error() {} }
  });

  const result = await service.runSystemBackup({
    directory: backupDir,
    includeMamDb: true,
    includeUploadsArchive: true,
    includeUploadsRestic: true,
    resticRepository: resticRepo
  }, 'tester');
  assert.strictEqual(result.files.length, 3);
  assert(result.files.some((file) => file.type === 'mam_db'));
  assert(result.files.some((file) => file.type === 'uploads_archive'));
  assert(result.files.some((file) => file.type === 'uploads_restic' && file.snapshotId === 'abcdef123456'));

  const listed = await service.listBackupFiles({ directory: backupDir });
  assert.strictEqual(listed.files.length, 2);
  assert(calls.some((call) => call.cmd === 'pg_dump' && call.args.includes('-Fc')));
  assert(calls.some((call) => call.cmd === 'tar' && call.args.includes('--exclude') && call.args.includes('_backups')));
  assert(calls.some((call) => call.cmd === 'restic' && call.args.includes('backup')));
  assert(calls.some((call) => call.cmd === 'restic' && call.args.includes('forget') && call.args.includes('--prune')));

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('backupService tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
