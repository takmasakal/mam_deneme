const fs = require('fs');
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

  args.push('-movflags', '+faststart', outputPath);
  return args;
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

  function runCommandCapture(cmd, args, commandOptions = {}) {
    const env = commandOptions?.env ? { ...process.env, ...commandOptions.env } : process.env;
    const cwd = commandOptions?.cwd || undefined;
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

  async function runFfmpeg(args) {
    const ffmpegArgs = args[0] === '-hide_banner' ? args : ['-hide_banner', ...args];
    const result = await runCommandCapture('ffmpeg', ffmpegArgs);
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

  async function probeMediaTechnicalInfo(inputPath) {
    if (!inputPath || !fileSystem.existsSync(inputPath)) return { available: false };
    const probe = await runCommandCapture('ffprobe', [
      '-v',
      'error',
      '-print_format',
      'json',
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
          frameRate: fps > 0 ? fps : 0
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

    const runProxy = async (includeAudio) => {
      await runFfmpeg(buildVideoProxyArgs(inputPath, outputPath, {
        includeAudio,
        audioStreamCount: audioStreams.length,
        scaleFilter: proxyScaleFilter
      }));
    };

    try {
      await runProxy(true);
      return { audioFallbackUsed: false };
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
        warning: 'Source audio stream could not be decoded reliably. Proxy was created without audio.'
      };
    }
  }

  return {
    buildProxyScaleFilter,
    buildVideoProxyArgs,
    generateVideoProxy,
    getMediaAudioChannelCount,
    getMediaAudioStreamOptions,
    getMediaAudioStreams,
    getVideoDurationSeconds,
    probeMediaTechnicalInfo,
    runFfmpeg,
    summarizeFfmpegError
  };
}

module.exports = {
  buildProxyScaleFilter,
  buildVideoProxyArgs,
  createMediaToolService,
  parseFfprobeFraction,
  summarizeFfmpegError
};
