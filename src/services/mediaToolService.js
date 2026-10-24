const fs = require('fs');
const path = require('path');
const { spawn: defaultSpawn } = require('child_process');

function parseFfprobeFraction(value) {
  const raw = String(value || '').trim();
  if (!raw) return 0;
  if (!raw.includes('/')) {
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
  const [a, b] = raw.split('/');
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isFinite(na) || !Number.isFinite(nb) || nb === 0) return 0;
  return na / nb;
}

function buildProxyScaleFilter(width, height) {
  const sourceWidth = Number(width || 0);
  const sourceHeight = Number(height || 0);
  return sourceHeight > sourceWidth
    ? 'scale=-2:min(640\\,ih)'
    : 'scale=min(640\\,iw):-2';
}

function buildVideoProxyArgs(inputPath, outputPath, options = {}) {
  const includeAudio = options.includeAudio !== false;
  const hasAudio = Number(options.audioStreamCount || 0) > 0;
  const scaleFilter = options.scaleFilter || buildProxyScaleFilter(options.width, options.height);
  const metadataComment = String(options.metadataComment || '').replace(/[\r\n]+/g, ' ').trim();
  const args = [
    '-hide_banner',
    '-y',
    '-i',
    inputPath,
    '-map',
    '0:v:0',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '31',
    '-pix_fmt',
    'yuv420p',
    '-profile:v',
    'main',
    '-level',
    '4.0',
    '-vf',
    scaleFilter
  ];

  if (!includeAudio || !hasAudio) {
    args.push('-an');
  } else {
    args.push(
      '-map',
      '0:a:0',
      '-c:a',
      'aac',
      '-ac',
      '2',
      '-ar',
      '48000',
      '-b:a',
      '160k'
    );
  }

  if (metadataComment) args.push('-metadata', `comment=${metadataComment}`);
  args.push('-movflags', '+faststart', outputPath);
  return args;
}

function buildAudioExtractArgs(inputPath, outputPath, options = {}) {
  const audioStreamIndex = options.audioStreamIndex != null && options.audioStreamIndex !== '' && Number.isInteger(Number(options.audioStreamIndex))
    ? Number(options.audioStreamIndex)
    : null;
  const audioChannelIndex = options.audioChannelIndex != null && options.audioChannelIndex !== '' && Number.isInteger(Number(options.audioChannelIndex))
    ? Number(options.audioChannelIndex)
    : null;
  const args = ['-y', '-i', inputPath];
  args.push('-map', audioStreamIndex != null ? `0:${audioStreamIndex}` : '0:a:0', '-vn');
  if (audioChannelIndex != null && audioChannelIndex >= 1) {
    const ffChannelIndex = Math.max(0, audioChannelIndex - 1);
    args.push('-af', `pan=mono|c0=c${ffChannelIndex}`, '-ac', '1');
  }
  args.push('-c:a', 'pcm_s16le', outputPath);
  return args;
}

function buildMediaTranscodeArgs(inputPath, outputPath, options = {}) {
  const profile = String(options.profile || '').trim().toLowerCase();
  if (profile === 'video-h264') return ['-y', '-i', inputPath, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', outputPath];
  if (profile === 'audio-wav') return ['-y', '-i', inputPath, '-vn', '-c:a', 'pcm_s16le', outputPath];
  if (profile === 'image-jpeg') return ['-y', '-i', inputPath, '-frames:v', '1', '-vf', 'scale=min(2200\,iw):-2', '-q:v', '3', outputPath];
  throw new Error(`Unsupported media transcode profile: ${profile || '(empty)'}`);
}

function buildOcrFrameExtractArgs(inputPath, outputPattern, options = {}) {
  const intervalSec = Math.max(1, Math.min(30, Number(options.intervalSec) || 4));
  const start = Number(options.startSec);
  const end = Number(options.endSec);
  const hasRange = Number.isFinite(start) && start >= 0 && Number.isFinite(end) && end > start;
  const args = ['-hide_banner', '-loglevel', 'error', '-y'];
  if (hasRange) args.push('-ss', start.toFixed(3));
  args.push('-i', inputPath);
  if (hasRange) args.push('-t', (end - start).toFixed(3));
  args.push('-vf', `fps=1/${intervalSec},scale=min(2200\\,iw):-2`, '-q:v', '3', outputPattern);
  return args;
}

function buildImageDerivativeArgs(inputPath, outputPath, options = {}) {
  const maxSize = Math.max(64, Math.min(4096, Number(options.maxSize) || (options.kind === 'thumbnail' ? 480 : 1280)));
  const quality = Math.max(2, Math.min(31, Number(options.quality) || (options.kind === 'thumbnail' ? 4 : 5)));
  return ['-y', '-i', inputPath, '-frames:v', '1', '-vf', `scale=${maxSize}:${maxSize}:force_original_aspect_ratio=decrease`, '-q:v', String(quality), outputPath];
}

function summarizeFfmpegError(error) {
  const raw = String(error?.message || error || '').trim();
  if (!raw) return 'ffmpeg failed';
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^ffmpeg version\b/i.test(line))
    .filter((line) => !/^built with\b/i.test(line))
    .filter((line) => !/^configuration:/i.test(line))
    .filter((line) => !/^libav[a-z]+/i.test(line));
  if (!lines.length) return raw.slice(0, 240);
  return lines.slice(-4).join(' | ').slice(0, 240);
}

function createProxyConfirmationError(message, details = {}) {
  const error = new Error(String(message || 'Proxy generation requires confirmation.'));
  error.code = 'PROXY_AUDIO_FALLBACK_CONFIRMATION_REQUIRED';
  Object.assign(error, details);
  return error;
}

function createMediaToolService(options = {}) {
  const spawn = options.spawn || defaultSpawn;
  const fileSystem = options.fs || fs;
  const trackMediaJobProcess = typeof options.trackMediaJobProcess === 'function'
    ? options.trackMediaJobProcess
    : () => () => {};
  const isMediaJobCancelled = typeof options.isMediaJobCancelled === 'function'
    ? options.isMediaJobCancelled
    : () => false;
  const proxyMetadataComment = String(options.proxyMetadataComment || '').replace(/[\r\n]+/g, ' ').trim();

  function runCommandCapture(cmd, args, commandOptions = {}) {
    const env = commandOptions?.env ? { ...process.env, ...commandOptions.env } : process.env;
    const cwd = commandOptions?.cwd || undefined;
    if (isMediaJobCancelled(commandOptions?.jobId)) {
      return Promise.resolve({ ok: false, code: -1, stdout: '', stderr: 'Media job cancelled', cancelled: true });
    }
    return new Promise((resolve) => {
      const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], env, cwd });
      const untrack = trackMediaJobProcess(commandOptions?.jobId, p);
      let stdout = '';
      let stderr = '';
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        untrack();
        resolve(result);
      };
      p.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      p.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      p.on('error', (error) => {
        finish({ ok: false, code: -1, stdout, stderr: String(error.message || error), cancelled: isMediaJobCancelled(commandOptions?.jobId) });
      });
      p.on('close', (code) => {
        finish({ ok: code === 0, code: code ?? -1, stdout, stderr, cancelled: isMediaJobCancelled(commandOptions?.jobId) });
      });
    });
  }

  async function runFfmpeg(args, jobId = '') {
    const ffmpegArgs = args[0] === '-hide_banner' ? args : ['-hide_banner', ...args];
    const result = await runCommandCapture('ffmpeg', ffmpegArgs, { jobId });
    if (result.cancelled) {
      const error = new Error('Media job cancelled');
      error.code = 'MEDIA_JOB_CANCELLED';
      throw error;
    }
    if (!result.ok) throw new Error(result.stderr || `ffmpeg exited with code ${result.code}`);
  }

  async function getVideoDurationSeconds(inputPath) {
    const probe = await runCommandCapture('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      inputPath
    ]);
    const parsed = Number(String(probe.stdout || '').trim());
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }

  async function generateVideoThumbnail(inputPath, outputPath, thumbnailOptions = {}) {
    const requestedSeek = Number(thumbnailOptions.seekSeconds);
    if (Number.isFinite(requestedSeek) && requestedSeek >= 0) {
      const duration = await getVideoDurationSeconds(inputPath);
      const seek = Math.max(0, Math.min(requestedSeek, duration > 0 ? Math.max(0, duration - 0.04) : requestedSeek));
      try {
        await runFfmpeg(['-y', '-i', inputPath, '-ss', String(seek), '-frames:v', '1', '-vf', 'scale=480:-1', '-q:v', '4', outputPath], thumbnailOptions.jobId);
        if (fileSystem.existsSync(outputPath) && fileSystem.statSync(outputPath).size > 0) return;
      } catch (error) { if (error?.code === 'MEDIA_JOB_CANCELLED') throw error; }
      await runFfmpeg(['-y', '-ss', String(seek), '-i', inputPath, '-frames:v', '1', '-vf', 'scale=480:-1', '-q:v', '4', outputPath], thumbnailOptions.jobId);
      if (fileSystem.existsSync(outputPath) && fileSystem.statSync(outputPath).size > 0) return;
      throw new Error('Could not capture thumbnail at requested timecode');
    }
    try {
      await runFfmpeg(['-y', '-i', inputPath, '-vf', "select='gt(scene,0.3)',scale=480:-1", '-frames:v', '1', '-q:v', '4', outputPath], thumbnailOptions.jobId);
      if (fileSystem.existsSync(outputPath) && fileSystem.statSync(outputPath).size > 0) return;
    } catch (error) { if (error?.code === 'MEDIA_JOB_CANCELLED') throw error; }
    const duration = await getVideoDurationSeconds(inputPath);
    const seek = duration > 0 ? Math.max(1, Math.min(duration * 0.35, Math.max(1, duration - 1))) : 2;
    await runFfmpeg(['-y', '-ss', String(seek), '-i', inputPath, '-frames:v', '1', '-vf', 'scale=480:-1', '-q:v', '4', outputPath], thumbnailOptions.jobId);
  }

  async function getMediaAudioStreams(inputPath) {
    if (!inputPath || !fileSystem.existsSync(inputPath)) return [];
    const probe = await runCommandCapture('ffprobe', [
      '-v',
      'error',
      '-select_streams',
      'a',
      '-show_entries',
      'stream=index,channels',
      '-of',
      'json',
      inputPath
    ]);
    if (!probe.ok) return [];
    try {
      const parsed = JSON.parse(String(probe.stdout || '{}'));
      const streams = Array.isArray(parsed?.streams) ? parsed.streams : [];
      return streams
        .map((s) => ({
          index: Number.isFinite(Number(s?.index)) ? Number(s.index) : null,
          channels: Number.isFinite(Number(s?.channels)) ? Math.max(0, Math.floor(Number(s.channels))) : 0
        }))
        .filter((s) => Number.isFinite(s.index));
    } catch (_error) {
      return [];
    }
  }

  async function getMediaAudioStreamOptions(inputPath) {
    if (!inputPath || !fileSystem.existsSync(inputPath)) return [];
    const probe = await runCommandCapture('ffprobe', [
      '-v',
      'error',
      '-select_streams',
      'a',
      '-show_entries',
      'stream=index,channels,codec_name:stream_tags=language,title',
      '-of',
      'json',
      inputPath
    ]);
    if (!probe.ok) return [];
    try {
      const parsed = JSON.parse(String(probe.stdout || '{}'));
      const streams = Array.isArray(parsed?.streams) ? parsed.streams : [];
      return streams.map((s, order) => {
        const index = Number.isFinite(Number(s?.index)) ? Number(s.index) : order;
        const channels = Number.isFinite(Number(s?.channels)) ? Math.max(0, Math.floor(Number(s.channels))) : 0;
        const codec = String(s?.codec_name || '').trim();
        const language = String(s?.tags?.language || '').trim().toLowerCase();
        const title = String(s?.tags?.title || '').trim();
        const labelParts = [
          `A${order + 1}`,
          title || '',
          language ? language.toUpperCase() : '',
          channels > 0 ? `${channels}ch` : '',
          codec ? codec : ''
        ].filter(Boolean);
        return {
          order,
          index,
          channels,
          codec,
          language,
          title,
          label: labelParts.join(' • ')
        };
      });
    } catch (_error) {
      return [];
    }
  }

  async function getMediaAudioChannelCount(inputPath) {
    const streams = await getMediaAudioStreams(inputPath);
    if (!streams.length) return 0;
    const sum = streams.reduce((acc, s) => acc + Math.max(0, Number(s.channels) || 0), 0);
    if (sum > 0) return sum;
    return Math.max(0, Number(streams[0]?.channels) || 0);
  }

  async function extractAudio(inputPath, outputPath, extractOptions = {}, runtimeContext = {}) {
    const args = buildAudioExtractArgs(inputPath, outputPath, extractOptions);
    const result = await runCommandCapture('ffmpeg', args, {
      jobId: runtimeContext.jobId,
      onProgress: runtimeContext.onProgress
    });
    if (!result.ok || !fileSystem.existsSync(outputPath)) {
      throw new Error(String(result.stderr || result.stdout || 'Failed to extract audio'));
    }
    return { format: 'wav', codec: 'pcm_s16le' };
  }

  async function transcodeMedia(inputPath, outputPath, transcodeOptions = {}) {
    await runFfmpeg(buildMediaTranscodeArgs(inputPath, outputPath, transcodeOptions));
    if (!fileSystem.existsSync(outputPath) || fileSystem.statSync(outputPath).size <= 0) throw new Error('Media transcode did not produce output');
    return { profile: String(transcodeOptions.profile || '').trim().toLowerCase() };
  }

  async function extractOcrFrames(inputPath, outputDir, frameOptions = {}, runtimeContext = {}) {
    fileSystem.mkdirSync(outputDir, { recursive: true });
    const outputPattern = require('path').join(outputDir, 'frame-%06d.jpg');
    const result = await runCommandCapture('ffmpeg', buildOcrFrameExtractArgs(inputPath, outputPattern, frameOptions), { jobId: runtimeContext.jobId, onProgress: runtimeContext.onProgress });
    if (!result.ok) throw new Error(String(result.stderr || 'Could not sample video frames'));
    const files = fileSystem.readdirSync(outputDir).filter((name) => /^frame-\d+\.jpg$/i.test(name)).sort();
    return { frameCount: files.length, files };
  }

  async function generateImageDerivative(inputPath, outputPath, derivativeOptions = {}) {
    await runFfmpeg(buildImageDerivativeArgs(inputPath, outputPath, derivativeOptions));
    if (!fileSystem.existsSync(outputPath) || fileSystem.statSync(outputPath).size <= 0) throw new Error('Image derivative did not produce output');
    return { kind: derivativeOptions.kind === 'thumbnail' ? 'thumbnail' : 'preview' };
  }

  async function renderPdfThumbnail(inputPath, outputPath) {
    const outputBase = outputPath.replace(/\.(?:jpe?g|png)$/i, '');
    const result = await runCommandCapture('pdftoppm', ['-f', '1', '-singlefile', '-jpeg', '-scale-to-x', '960', '-scale-to-y', '-1', inputPath, outputBase]);
    const generated = `${outputBase}.jpg`;
    if (!result.ok || !fileSystem.existsSync(generated) || fileSystem.statSync(generated).size <= 0) throw new Error(String(result.stderr || 'PDF thumbnail generation failed'));
    if (generated !== outputPath) fileSystem.copyFileSync(generated, outputPath);
    return { kind: 'document-thumbnail' };
  }

  async function generateDocumentPreview(inputPath, outputPath) {
    if (/\.pdf$/i.test(inputPath)) {
      fileSystem.copyFileSync(inputPath, outputPath);
      return { kind: 'document-preview', format: 'pdf' };
    }
    const tempDir = fileSystem.mkdtempSync(path.join(path.dirname(outputPath), '.document-preview-'));
    try {
      const result = await runCommandCapture('libreoffice', ['--headless', '--convert-to', 'pdf', '--outdir', tempDir, inputPath], { env: { HOME: tempDir } });
      const generated = path.join(tempDir, `${path.basename(inputPath, path.extname(inputPath))}.pdf`);
      if (!result.ok || !fileSystem.existsSync(generated)) throw new Error(String(result.stderr || 'Document preview conversion failed'));
      fileSystem.copyFileSync(generated, outputPath);
      return { kind: 'document-preview', format: 'pdf' };
    } finally { fileSystem.rmSync(tempDir, { recursive: true, force: true }); }
  }

  async function generateDocumentThumbnail(inputPath, outputPath) {
    if (/\.pdf$/i.test(inputPath)) return renderPdfThumbnail(inputPath, outputPath);
    const previewPath = `${outputPath}.preview.pdf`;
    try {
      await generateDocumentPreview(inputPath, previewPath);
      return await renderPdfThumbnail(previewPath, outputPath);
    } finally {
      if (fileSystem.existsSync(previewPath)) fileSystem.rmSync(previewPath, { force: true });
    }
  }

  async function probeMediaTechnicalInfo(inputPath) {
    if (!inputPath || !fileSystem.existsSync(inputPath)) return { available: false };
    const probe = await runCommandCapture('ffprobe', [
      '-v',
      'error',
      '-print_format',
      'json',
      '-count_frames',
      '-show_format',
      '-show_streams',
      inputPath
    ]);
    if (!probe.ok) return { available: false };

    try {
      const parsed = JSON.parse(String(probe.stdout || '{}'));
      const format = parsed?.format && typeof parsed.format === 'object' ? parsed.format : {};
      const streams = Array.isArray(parsed?.streams) ? parsed.streams : [];
      const video = streams.find((s) => String(s?.codec_type || '') === 'video') || null;
      const audioStreams = streams.filter((s) => String(s?.codec_type || '') === 'audio');
      const audioPrimary = audioStreams[0] || null;
      const fps = video ? parseFfprobeFraction(video.avg_frame_rate || video.r_frame_rate) : 0;

      return {
        available: true,
        container: String(format.format_name || '').split(',').filter(Boolean),
        durationSeconds: Number.isFinite(Number(format.duration)) ? Math.max(0, Number(format.duration)) : 0,
        bitRate: Number.isFinite(Number(format.bit_rate)) ? Math.max(0, Number(format.bit_rate)) : 0,
        fileSize: Number.isFinite(Number(format.size)) ? Math.max(0, Number(format.size)) : 0,
        video: video ? {
          codec: String(video.codec_name || '').trim(),
          profile: String(video.profile || '').trim(),
          width: Number.isFinite(Number(video.width)) ? Math.max(0, Number(video.width)) : 0,
          height: Number.isFinite(Number(video.height)) ? Math.max(0, Number(video.height)) : 0,
          pixelFormat: String(video.pix_fmt || '').trim(),
          frameRate: fps > 0 ? fps : 0,
          frameCount: Number.isFinite(Number(video.nb_read_frames)) && Number(video.nb_read_frames) > 0
            ? Number(video.nb_read_frames)
            : (Number.isFinite(Number(video.nb_frames)) ? Math.max(0, Number(video.nb_frames)) : 0)
        } : null,
        audio: {
          streamCount: audioStreams.length,
          codecs: Array.from(new Set(audioStreams.map((s) => String(s.codec_name || '').trim()).filter(Boolean))),
          channels: audioPrimary && Number.isFinite(Number(audioPrimary.channels)) ? Math.max(0, Number(audioPrimary.channels)) : 0,
          sampleRate: audioPrimary && Number.isFinite(Number(audioPrimary.sample_rate)) ? Math.max(0, Number(audioPrimary.sample_rate)) : 0
        }
      };
    } catch (_error) {
      return { available: false };
    }
  }

  async function generateVideoProxy(inputPath, outputPath, generateOptions = {}) {
    const audioStreams = await getMediaAudioStreams(inputPath);
    const technicalInfo = await probeMediaTechnicalInfo(inputPath);
    const sourceWidth = Number(technicalInfo?.video?.width || 0);
    const sourceHeight = Number(technicalInfo?.video?.height || 0);
    const proxyScaleFilter = buildProxyScaleFilter(sourceWidth, sourceHeight);
    const allowAudioFallback = Boolean(generateOptions.allowAudioFallback);
    const metadataComment = String(generateOptions.metadataComment || proxyMetadataComment).replace(/[\r\n]+/g, ' ').trim();

    const runProxy = async (includeAudio) => {
      await runFfmpeg(buildVideoProxyArgs(inputPath, outputPath, {
        includeAudio,
        audioStreamCount: audioStreams.length,
        scaleFilter: proxyScaleFilter,
        metadataComment
      }), generateOptions.jobId);
    };

    try {
      await runProxy(true);
      return { audioFallbackUsed: false, technicalInfo };
    } catch (error) {
      const message = String(error?.message || '');
      const audioStreamDecodeFailure = audioStreams.some((stream) => {
        const streamIndex = Number(stream?.index);
        if (!Number.isFinite(streamIndex)) return false;
        return new RegExp(
          `Error while (?:decoding stream|processing the decoded data for stream) #0:${streamIndex}\\b`,
          'i'
        ).test(message);
      });
      const aacDecoderFailure = /\[aac @[^\]]+\]\s+(?!Qavg:).*?(?:error|invalid|corrupt|decode|buffer exhausted|not allocated|reserved bit|exceeds limit)/i.test(message);
      const audioDecodeFailure =
        audioStreamDecodeFailure ||
        aacDecoderFailure ||
        /auto_aresample/i.test(message);
      if (!audioDecodeFailure) throw error;
      if (!allowAudioFallback) {
        throw createProxyConfirmationError(
          'Source audio stream could not be decoded reliably. Proxy can be created without audio if you approve it.',
          {
            warning: 'The uploaded video has audio stream issues. Approve silent proxy creation or continue without a proxy.',
            retryHint: 'If you do not approve, the asset can still be created and the file can be replaced later while keeping metadata.'
          }
        );
      }
      await runProxy(false);
      return {
        audioFallbackUsed: true,
        warning: 'Source audio stream could not be decoded reliably. Proxy was created without audio.',
        technicalInfo
      };
    }
  }

  return {
    buildProxyScaleFilter,
    buildVideoProxyArgs,
    extractOcrFrames,
    extractAudio,
    generateDocumentPreview,
    generateDocumentThumbnail,
    generateImageDerivative,
    generateVideoProxy,
    generateVideoThumbnail,
    getMediaAudioChannelCount,
    getMediaAudioStreamOptions,
    getMediaAudioStreams,
    getVideoDurationSeconds,
    probeMediaTechnicalInfo,
    runFfmpeg,
    summarizeFfmpegError,
    transcodeMedia
  };
}

module.exports = {
  buildAudioExtractArgs,
  buildImageDerivativeArgs,
  buildMediaTranscodeArgs,
  buildOcrFrameExtractArgs,
  buildProxyScaleFilter,
  buildVideoProxyArgs,
  createMediaToolService,
  parseFfprobeFraction,
  summarizeFfmpegError
};
