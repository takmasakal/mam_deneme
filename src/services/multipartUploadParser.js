const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const Busboy = require('busboy');

function parseMultipartUpload(req, _res, next) {
  const contentType = String(req.headers['content-type'] || '');
  if (!/^multipart\/form-data\b/i.test(contentType)) return next();

  let parser;
  try {
    parser = Busboy({ headers: req.headers, limits: { files: 1, fields: 100 } });
  } catch (error) {
    return next(error);
  }

  const fields = {};
  let upload = null;
  let fileWrite = Promise.resolve();

  parser.on('field', (name, value) => {
    fields[name] = value;
  });

  parser.on('file', (name, file, info) => {
    if (name !== 'mediaFile' || upload) {
      file.resume();
      return;
    }

    const tempPath = path.join(os.tmpdir(), `mam-upload-${crypto.randomUUID()}`);
    const output = fs.createWriteStream(tempPath, { flags: 'wx' });
    upload = {
      path: tempPath,
      fileName: String(info?.filename || '').trim(),
      mimeType: String(info?.mimeType || '').trim()
    };
    fileWrite = new Promise((resolve, reject) => {
      const fail = (error) => {
        try { output.destroy(); } catch (_error) {}
        try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_error) {}
        reject(error);
      };
      file.on('error', fail);
      output.on('error', fail);
      output.on('finish', resolve);
    });
    file.pipe(output);
  });

  parser.on('error', next);
  parser.on('close', async () => {
    try {
      await fileWrite;
      if (!upload) {
        const error = new Error('mediaFile is required');
        error.status = 400;
        return next(error);
      }
      if (typeof fields.dcMetadata === 'string') {
        try { fields.dcMetadata = JSON.parse(fields.dcMetadata); } catch (_error) {}
      }
      req.body = fields;
      req.multipartUpload = upload;
      return next();
    } catch (error) {
      return next(error);
    }
  });

  req.pipe(parser);
}

module.exports = { parseMultipartUpload };
