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

  function isImageCandidate({ mimeType = '', fileName = '' } = {}) {
    const mime = String(mimeType || '').trim().toLowerCase();
    const ext = String(getFileExtension(fileName) || '').trim().toLowerCase();
    return mime.startsWith('image/') || [
      'jpg', 'jpeg', 'png', 'webp', 'gif', 'tif', 'tiff', 'bmp', 'heic', 'heif'
    ].includes(ext);
  }

  const previewScaleFilter = 'scale=1280:1280:force_original_aspect_ratio=decrease';
  const thumbnailScaleFilter = 'scale=480:480:force_original_aspect_ratio=decrease';

  async function generateHeicPreview(inputPath, outputPath) {
    const intermediatePath = `${outputPath}.heif-convert.jpg`;
    const heifResult = await runCommandCapture('heif-convert', [inputPath, intermediatePath]);
    const sourcePath = heifResult.ok && fs.existsSync(intermediatePath) && fs.statSync(intermediatePath).size > 0
      ? intermediatePath
      : inputPath;
    const ffmpegResult = await runCommandCapture('ffmpeg', [
      '-y',
      '-i',
      sourcePath,
      '-frames:v',
      '1',
      '-vf',
      previewScaleFilter,
      '-q:v',
      '5',
      outputPath
    ]);
    try {
      if (fs.existsSync(intermediatePath)) fs.unlinkSync(intermediatePath);
    } catch (_error) {
      // Keep the generated preview even if temporary-file cleanup fails.
    }
    if (!ffmpegResult.ok || !fs.existsSync(outputPath) || fs.statSync(outputPath).size <= 0) {
      throw new Error(
        compactCommandOutput([
          heifResult.stderr || heifResult.stdout || 'heif-convert failed',
          ffmpegResult.stderr || ffmpegResult.stdout || 'ffmpeg HEIC fallback failed'
        ].join('\n'))
      );
    }
  }

  async function generateImagePreview(inputPath, outputPath) {
    const result = await runCommandCapture('ffmpeg', [
      '-y',
      '-i',
      inputPath,
      '-frames:v',
      '1',
      '-vf',
      previewScaleFilter,
      '-q:v',
      '5',
      outputPath
    ]);
    if (!result.ok || !fs.existsSync(outputPath) || fs.statSync(outputPath).size <= 0) {
      throw new Error(compactCommandOutput(result.stderr || result.stdout || 'Image preview generation failed'));
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
      thumbnailScaleFilter,
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
    const previewStoredName = `${Date.now()}-${nanoid()}-image-preview.jpg`;
    const previewOut = buildArtifactPath('proxies', previewStoredName, createdAt);
    if (isHeicCandidate({ mimeType, fileName })) {
      await generateHeicPreview(inputPath, previewOut.absolutePath);
    } else {
      await generateImagePreview(inputPath, previewOut.absolutePath);
    }

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
    isImageCandidate,
    generateHeicPreview,
    generateImagePreview,
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
