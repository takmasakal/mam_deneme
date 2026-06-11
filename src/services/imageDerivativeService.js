const fs = require('fs');

function createImageDerivativeService(deps) {
  const {
    runCommandCapture,
    buildArtifactPath,
    nanoid,
    getFileExtension
  } = deps;

  function isHeicCandidate({ mimeType = '', fileName = '' } = {}) {
    const mime = String(mimeType || '').trim().toLowerCase();
    const ext = String(getFileExtension(fileName) || '').trim().toLowerCase();
    return (
      mime === 'image/heic' ||
      mime === 'image/heif' ||
      ext === 'heic' ||
      ext === 'heif'
    );
  }

  async function generateHeicPreview(inputPath, outputPath) {
    const heifResult = await runCommandCapture('heif-convert', [inputPath, outputPath]);
    if (heifResult.ok && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
      return;
    }

    const ffmpegResult = await runCommandCapture('ffmpeg', [
      '-y',
      '-i',
      inputPath,
      '-frames:v',
      '1',
      '-q:v',
      '2',
      outputPath
    ]);
    if (!ffmpegResult.ok || !fs.existsSync(outputPath) || fs.statSync(outputPath).size <= 0) {
      throw new Error(
        compactCommandOutput([
          heifResult.stderr || heifResult.stdout || 'heif-convert failed',
          ffmpegResult.stderr || ffmpegResult.stdout || 'ffmpeg HEIC fallback failed'
        ].join('\n'))
      );
    }
  }

  async function generateImageThumbnail(inputPath, outputPath) {
    const result = await runCommandCapture('ffmpeg', [
      '-y',
      '-i',
      inputPath,
      '-frames:v',
      '1',
      '-vf',
      'scale=480:-1',
      '-q:v',
      '4',
      outputPath
    ]);
    if (!result.ok || !fs.existsSync(outputPath) || fs.statSync(outputPath).size <= 0) {
      throw new Error(
        compactCommandOutput(result.stderr || result.stdout || 'Image thumbnail generation failed')
      );
    }
  }

  async function ensureImageDerivativesForUpload({
    mimeType = '',
    fileName = '',
    inputPath,
    createdAt = new Date()
  } = {}) {
    if (!isHeicCandidate({ mimeType, fileName })) {
      return { proxyUrl: '', thumbnailUrl: '' };
    }

    const previewStoredName = `${Date.now()}-${nanoid()}-image-preview.jpg`;
    const previewOut = buildArtifactPath('proxies', previewStoredName, createdAt);
    await generateHeicPreview(inputPath, previewOut.absolutePath);

    const thumbStoredName = `${Date.now()}-${nanoid()}-image-thumb.jpg`;
    const thumbOut = buildArtifactPath('thumbnails', thumbStoredName, createdAt);
    try {
      await generateImageThumbnail(previewOut.absolutePath, thumbOut.absolutePath);
    } catch (_error) {
      return {
        proxyUrl: previewOut.publicUrl,
        thumbnailUrl: previewOut.publicUrl
      };
    }

    return {
      proxyUrl: previewOut.publicUrl,
      thumbnailUrl: thumbOut.publicUrl
    };
  }

  return {
    isHeicCandidate,
    generateHeicPreview,
    generateImageThumbnail,
    ensureImageDerivativesForUpload
  };
}

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

module.exports = {
  createImageDerivativeService
};
