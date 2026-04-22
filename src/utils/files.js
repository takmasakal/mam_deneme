const path = require('path');

function sanitizeFileName(fileName) {
  const cleaned = String(fileName || 'asset.bin').trim().replace(/[^a-zA-Z0-9._-]/g, '_');
  return cleaned || 'asset.bin';
}

function getFileExtension(fileName) {
  return path.extname(String(fileName || '')).replace('.', '').toLowerCase();
}

function inferMimeTypeFromFileName(fileName) {
  const ext = getFileExtension(fileName);
  if (!ext) return '';
  const byExt = {
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    m4v: 'video/x-m4v',
    mkv: 'video/x-matroska',
    avi: 'video/x-msvideo',
    webm: 'video/webm',
    mpg: 'video/mpeg',
    mpeg: 'video/mpeg',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    flac: 'audio/flac',
    ogg: 'audio/ogg',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    tif: 'image/tiff',
    tiff: 'image/tiff',
    svg: 'image/svg+xml',
    bmp: 'image/bmp',
    pdf: 'application/pdf',
    txt: 'text/plain',
    md: 'text/markdown',
    csv: 'text/csv',
    json: 'application/json',
    xml: 'application/xml',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  };
  return byExt[ext] || '';
}

module.exports = {
  sanitizeFileName,
  getFileExtension,
  inferMimeTypeFromFileName
};
