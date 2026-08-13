const fs = require('fs');
const path = require('path');

function createMediaArtifactService(deps = {}) {
  const uploadsDir = deps.uploadsDir;
  const proxiesDir = deps.proxiesDir || path.join(uploadsDir, 'proxies');
  const thumbnailsDir = deps.thumbnailsDir || path.join(uploadsDir, 'thumbnails');
  const subtitlesDir = deps.subtitlesDir || path.join(uploadsDir, 'subtitles');
  const ocrDir = deps.ocrDir || path.join(uploadsDir, 'ocr');
  const ocrFramesDir = deps.ocrFramesDir || path.join(ocrDir, '_frames');
  const sanitizeFileName = typeof deps.sanitizeFileName === 'function'
    ? deps.sanitizeFileName
    : (value) => String(value || '').replace(/[\\/]+/g, '-').trim();
  const nanoid = typeof deps.nanoid === 'function' ? deps.nanoid : (() => `${Date.now()}`);
  const now = typeof deps.now === 'function' ? deps.now : (() => Date.now());

  function getUploadDateDir(value = new Date()) {
    const d = value instanceof Date ? value : new Date(value);
    const safeDate = Number.isFinite(d.getTime()) ? d : new Date();
    const year = String(safeDate.getUTCFullYear());
    const month = String(safeDate.getUTCMonth() + 1);
    const day = String(safeDate.getUTCDate());
    return path.join(year, month, day);
  }

  function getDatePart(value) {
    const d = value ? new Date(value) : new Date();
    return getUploadDateDir(Number.isFinite(d.getTime()) ? d : new Date());
  }

  function artifactRoot(kind) {
    if (kind === 'proxies') return proxiesDir;
    if (kind === 'thumbnails') return thumbnailsDir;
    if (kind === 'subtitles') return subtitlesDir;
    if (kind === 'ocr') return ocrDir;
    throw new Error(`Unknown artifact kind: ${kind}`);
  }

  function artifactFolder(kind) {
    if (kind === 'proxies') return 'previews';
    if (kind === 'thumbnails') return 'thumbnails';
    if (kind === 'subtitles') return 'subtitles';
    if (kind === 'ocr') return 'ocr';
    if (kind === 'attachments') return 'attachments';
    throw new Error(`Unknown artifact kind: ${kind}`);
  }

  function buildArtifactPath(kind, storedName, dateValue) {
    const datePart = getDatePart(dateValue);
    const safeName = sanitizeFileName(storedName);
    const folder = artifactFolder(kind);
    const dir = path.join(uploadsDir, datePart, folder);
    fs.mkdirSync(dir, { recursive: true });
    const absolutePath = path.join(dir, safeName);
    const publicUrl = `/uploads/${datePart.replace(/\\/g, '/')}/${folder}/${safeName}`;
    return { absolutePath, publicUrl, datePart };
  }

  function createOcrFrameWorkDir(dateValue) {
    const datePart = getDatePart(dateValue);
    const dir = path.join(ocrFramesDir, datePart, `${now()}-${nanoid()}-frames`);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  function publicUploadUrlToAbsolutePath(publicUrl) {
    const url = String(publicUrl || '');
    if (!url.startsWith('/uploads/')) return '';
    const rel = url.replace('/uploads/', '');
    return path.join(uploadsDir, rel);
  }

  function isUploadArtifactPath(filePath, folderName) {
    const safePath = String(filePath || '').trim();
    const safeFolder = String(folderName || '').trim();
    if (!safePath || !safeFolder) return false;
    const resolvedPath = path.resolve(safePath);
    const uploadsRoot = path.resolve(uploadsDir);
    if (resolvedPath !== uploadsRoot && !resolvedPath.startsWith(`${uploadsRoot}${path.sep}`)) return false;
    return resolvedPath.split(path.sep).includes(safeFolder);
  }

  function resolveStoredUrl(value, defaultSubdir) {
    const raw = String(value || '').trim();
    if (!raw) return '';

    const candidates = [];
    if (raw.startsWith('/uploads/')) {
      candidates.push(raw);
    } else if (raw.startsWith('uploads/')) {
      candidates.push(`/${raw}`);
    } else if (path.isAbsolute(raw)) {
      const rel = path.relative(uploadsDir, raw);
      if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
        candidates.push(`/uploads/${rel.replace(/\\/g, '/')}`);
      }
    } else {
      if (defaultSubdir) candidates.push(`/uploads/${defaultSubdir}/${raw}`);
      candidates.push(`/uploads/${raw}`);
    }

    for (const candidate of candidates) {
      const absolute = publicUploadUrlToAbsolutePath(candidate);
      if (!absolute) continue;
      try {
        if (fs.existsSync(absolute) && fs.statSync(absolute).size > 0) {
          return candidate;
        }
      } catch (_error) {}
    }
    return '';
  }

  return {
    artifactRoot,
    artifactFolder,
    buildArtifactPath,
    createOcrFrameWorkDir,
    getUploadDateDir,
    publicUploadUrlToAbsolutePath,
    isUploadArtifactPath,
    resolveStoredUrl
  };
}

module.exports = {
  createMediaArtifactService
};
