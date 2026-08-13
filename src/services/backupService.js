const fs = require('fs');
const path = require('path');

function compactCommandOutput(value, maxLength = 1200) {
  const text = String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' | ');
  if (!text) return 'Command failed';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function backupDateParts(value = new Date(), timeZone = 'Europe/Istanbul') {
  const date = value instanceof Date ? value : new Date(value);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: String(timeZone || 'Europe/Istanbul'),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(safeDate);
  const getPart = (type) => String(parts.find((part) => part.type === type)?.value || '');
  return {
    year: getPart('year'),
    month: getPart('month'),
    day: getPart('day'),
    hour: Number(getPart('hour')),
    minute: getPart('minute'),
    second: getPart('second'),
    millisecond: String(safeDate.getMilliseconds()).padStart(3, '0')
  };
}

function backupDateStamp(value = new Date(), timeZone = 'Europe/Istanbul') {
  const parts = backupDateParts(value, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}T${String(parts.hour).padStart(2, '0')}-${parts.minute}-${parts.second}-${parts.millisecond}`;
}

function extractResticSnapshotId(output) {
  const match = String(output || '').match(/snapshot\s+([0-9a-f]{8,})\s+saved/i);
  return match ? match[1] : '';
}

function createBackupService(options = {}) {
  const fileSystem = options.fs || fs;
  const pathLib = options.path || path;
  const uploadsDir = options.uploadsDir;
  const defaultBackupDir = options.defaultBackupDir;
  const defaultResticRepository = options.defaultResticRepository;
  const backupTimeZone = String(options.backupTimeZone || 'Europe/Istanbul').trim() || 'Europe/Istanbul';
  const runCommandCapture = options.runCommandCapture;
  const normalizeBackupSettings = options.normalizeBackupSettings;
  const getAdminSettings = options.getAdminSettings;
  const defaultBackupSettings = options.defaultBackupSettings || {};
  const readEnvOrFile = typeof options.readEnvOrFile === 'function' ? options.readEnvOrFile : () => '';
  const compactOutput = typeof options.compactCommandOutput === 'function' ? options.compactCommandOutput : compactCommandOutput;
  const clampNumber = typeof options.clampNumber === 'function'
    ? options.clampNumber
    : (value, min, max, fallback) => {
        const n = Number(value);
        if (!Number.isFinite(n)) return fallback;
        return Math.max(min, Math.min(max, Math.floor(n)));
      };
  const logger = options.logger || console;
  let backupInProgress = false;
  let lastBackupRunDate = '';

  if (typeof runCommandCapture !== 'function') {
    throw new Error('createBackupService requires runCommandCapture');
  }
  if (typeof normalizeBackupSettings !== 'function') {
    throw new Error('createBackupService requires normalizeBackupSettings');
  }

  function getDbConnectionConfig(prefix = 'MAM') {
    if (prefix === 'KEYCLOAK') {
      return {
        host: process.env.KEYCLOAK_DB_URL_HOST || process.env.KEYCLOAK_DB_HOST || 'keycloak-postgres',
        port: process.env.KEYCLOAK_DB_PORT || '5432',
        user: process.env.KEYCLOAK_DB_USERNAME || process.env.KEYCLOAK_DB_USER || 'keycloak',
        database: process.env.KEYCLOAK_DB_URL_DATABASE || process.env.KEYCLOAK_DB_NAME || 'keycloak',
        password: readEnvOrFile('KEYCLOAK_DB_PASSWORD')
      };
    }
    return {
      host: process.env.MAM_DB_HOST || 'postgres',
      port: process.env.MAM_DB_PORT || '5432',
      user: process.env.MAM_DB_USER || process.env.POSTGRES_USER || 'postgres',
      database: process.env.MAM_DB_NAME || process.env.POSTGRES_DB || 'mam_mvp',
      password: readEnvOrFile('MAM_DB_PASSWORD') || readEnvOrFile('POSTGRES_PASSWORD')
    };
  }

  async function runPgDumpBackup(targetPath, dbConfig) {
    const args = [
      '-h', String(dbConfig.host || 'postgres'),
      '-p', String(dbConfig.port || '5432'),
      '-U', String(dbConfig.user || 'postgres'),
      '-d', String(dbConfig.database || 'mam_mvp'),
      '-Fc',
      '-f', targetPath
    ];
    const result = await runCommandCapture('pg_dump', args, {
      env: {
        PGPASSWORD: String(dbConfig.password || '')
      }
    });
    if (!result.ok) {
      throw new Error(compactOutput(result.stderr || result.stdout || 'pg_dump failed'));
    }
    return targetPath;
  }

  async function runTarArchiveBackup(targetPath, sourcePath) {
    const parentDir = pathLib.dirname(sourcePath);
    const baseName = pathLib.basename(sourcePath);
    const result = await runCommandCapture('tar', ['-czf', targetPath, '--exclude', '_backups', '-C', parentDir, baseName]);
    if (!result.ok) {
      throw new Error(compactOutput(result.stderr || result.stdout || 'uploads archive failed'));
    }
    return targetPath;
  }

  function getResticEnv() {
    const env = {};
    if (process.env.RESTIC_PASSWORD_FILE) {
      env.RESTIC_PASSWORD_FILE = process.env.RESTIC_PASSWORD_FILE;
      return env;
    }
    const password = readEnvOrFile('RESTIC_PASSWORD');
    if (password) {
      env.RESTIC_PASSWORD = password;
      return env;
    }
    throw new Error('Restic password is not configured. Set RESTIC_PASSWORD_FILE or RESTIC_PASSWORD.');
  }

  async function ensureResticRepository(repository, env) {
    const repo = pathLib.resolve(String(repository || defaultResticRepository));
    await fileSystem.promises.mkdir(pathLib.dirname(repo), { recursive: true });
    const configPath = pathLib.join(repo, 'config');
    const hasConfig = await fileSystem.promises.access(configPath).then(() => true).catch(() => false);
    if (hasConfig) {
      const snapshots = await runCommandCapture('restic', ['-r', repo, 'snapshots', '--json'], { env });
      if (!snapshots.ok) {
        throw new Error(compactOutput(snapshots.stderr || snapshots.stdout || 'restic snapshots failed'));
      }
      return repo;
    }
    const init = await runCommandCapture('restic', ['-r', repo, 'init'], { env });
    if (!init.ok) {
      throw new Error(compactOutput(init.stderr || init.stdout || 'restic init failed'));
    }
    return repo;
  }

  async function runResticUploadsBackup(repository, backup) {
    const env = getResticEnv();
    const repo = await ensureResticRepository(repository, env);
    const backupResult = await runCommandCapture('restic', [
      '-r', repo,
      'backup', uploadsDir,
      '--exclude', pathLib.join(uploadsDir, '_backups'),
      '--exclude', pathLib.join(uploadsDir, '_audit_exports')
    ], { env });
    if (!backupResult.ok) {
      throw new Error(compactOutput(backupResult.stderr || backupResult.stdout || 'restic backup failed'));
    }
    const forget = await runCommandCapture('restic', [
      '-r', repo,
      'forget',
      '--keep-daily', String(backup.resticKeepDaily),
      '--keep-weekly', String(backup.resticKeepWeekly),
      '--keep-monthly', String(backup.resticKeepMonthly),
      '--prune'
    ], { env });
    if (!forget.ok) {
      throw new Error(compactOutput(forget.stderr || forget.stdout || 'restic forget failed'));
    }
    return {
      repository: repo,
      snapshotId: extractResticSnapshotId(backupResult.stdout || backupResult.stderr),
      output: compactOutput(backupResult.stdout || backupResult.stderr)
    };
  }

  async function cleanupExpiredBackupFiles(directory, retentionDays) {
    const fallbackRetention = defaultBackupSettings.retentionDays || 30;
    const days = clampNumber(retentionDays, 1, 3650, fallbackRetention);
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    let deleted = 0;
    try {
      const entries = await fileSystem.promises.readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!/^mam-backup-/.test(entry.name)) continue;
        const filePath = pathLib.join(directory, entry.name);
        const stat = await fileSystem.promises.stat(filePath).catch(() => null);
        if (stat && stat.mtimeMs < cutoff) {
          await fileSystem.promises.unlink(filePath).catch(() => {});
          deleted += 1;
        }
      }
    } catch (_error) {
      // Missing backup directory is not a cleanup failure.
    }
    return deleted;
  }

  async function listBackupFiles(settings = defaultBackupSettings) {
    const backup = normalizeBackupSettings(settings);
    const directory = pathLib.resolve(backup.directory || defaultBackupDir);
    try {
      const entries = await fileSystem.promises.readdir(directory, { withFileTypes: true });
      const files = [];
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!/^mam-backup-/.test(entry.name)) continue;
        const filePath = pathLib.join(directory, entry.name);
        const stat = await fileSystem.promises.stat(filePath).catch(() => null);
        files.push({
          fileName: entry.name,
          path: filePath,
          size: stat ? Number(stat.size || 0) : 0,
          updatedAt: stat ? stat.mtime.toISOString() : ''
        });
      }
      files.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
      return { directory, files };
    } catch (_error) {
      return { directory, files: [] };
    }
  }

  async function runSystemBackup(settings = defaultBackupSettings, requestedBy = '') {
    if (backupInProgress) {
      const error = new Error('Backup is already running');
      error.code = 'backup_in_progress';
      throw error;
    }
    const backup = normalizeBackupSettings(settings);
    const directory = pathLib.resolve(backup.directory || defaultBackupDir);
    backupInProgress = true;
    const startedAt = new Date();
    const stamp = backupDateStamp(startedAt, backupTimeZone);
    const result = {
      startedAt: startedAt.toISOString(),
      finishedAt: '',
      directory,
      requestedBy: String(requestedBy || '').trim(),
      files: [],
      errors: []
    };
    try {
      await fileSystem.promises.mkdir(directory, { recursive: true });
      if (backup.includeMamDb) {
        const filePath = pathLib.join(directory, `mam-backup-${stamp}-mam-db.dump`);
        await runPgDumpBackup(filePath, getDbConnectionConfig('MAM'));
        const stat = await fileSystem.promises.stat(filePath).catch(() => null);
        result.files.push({ type: 'mam_db', path: filePath, size: stat ? Number(stat.size || 0) : 0 });
      }
      if (backup.includeKeycloakDb) {
        const filePath = pathLib.join(directory, `mam-backup-${stamp}-keycloak-db.dump`);
        await runPgDumpBackup(filePath, getDbConnectionConfig('KEYCLOAK'));
        const stat = await fileSystem.promises.stat(filePath).catch(() => null);
        result.files.push({ type: 'keycloak_db', path: filePath, size: stat ? Number(stat.size || 0) : 0 });
      }
      if (backup.includeUploadsArchive) {
        const filePath = pathLib.join(directory, `mam-backup-${stamp}-uploads.tar.gz`);
        await runTarArchiveBackup(filePath, uploadsDir);
        const stat = await fileSystem.promises.stat(filePath).catch(() => null);
        result.files.push({ type: 'uploads_archive', path: filePath, size: stat ? Number(stat.size || 0) : 0 });
      }
      if (backup.includeUploadsRestic) {
        const restic = await runResticUploadsBackup(backup.resticRepository, backup);
        result.files.push({ type: 'uploads_restic', path: restic.repository, size: 0, snapshotId: restic.snapshotId, output: restic.output });
      }
      await cleanupExpiredBackupFiles(directory, backup.retentionDays);
      result.finishedAt = new Date().toISOString();
      return result;
    } finally {
      backupInProgress = false;
    }
  }

  function scheduleSystemBackups() {
    const runIfDue = async () => {
      const settings = typeof getAdminSettings === 'function'
        ? await getAdminSettings().catch(() => ({ backup: defaultBackupSettings }))
        : { backup: defaultBackupSettings };
      const backup = normalizeBackupSettings(settings.backup);
      if (!backup.enabled) return;
      const now = backupDateParts(new Date(), backupTimeZone);
      const today = `${now.year}-${now.month}-${now.day}`;
      if (lastBackupRunDate === today) return;
      if (now.hour !== backup.dailyHour) return;
      lastBackupRunDate = today;
      try {
        const result = await runSystemBackup(backup, 'scheduler');
        logger.log(`System backup completed: ${result.files.map((file) => file.path).join(', ')}`);
      } catch (error) {
        lastBackupRunDate = '';
        logger.error(`System backup failed: ${error?.message || error}`);
      }
    };
    setInterval(() => {
      runIfDue().catch(() => {});
    }, 10 * 60 * 1000);
  }

  return {
    backupDateParts: (value = new Date()) => backupDateParts(value, backupTimeZone),
    backupDateStamp: (value = new Date()) => backupDateStamp(value, backupTimeZone),
    cleanupExpiredBackupFiles,
    ensureResticRepository,
    extractResticSnapshotId,
    getDbConnectionConfig,
    getResticEnv,
    listBackupFiles,
    runPgDumpBackup,
    runResticUploadsBackup,
    runSystemBackup,
    runTarArchiveBackup,
    scheduleSystemBackups
  };
}

module.exports = {
  backupDateParts,
  backupDateStamp,
  compactCommandOutput,
  createBackupService,
  extractResticSnapshotId
};
