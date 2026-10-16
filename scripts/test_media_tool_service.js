const assert = require('assert');
const {
  buildAudioExtractArgs,
  buildImageDerivativeArgs,
  buildMediaTranscodeArgs,
  buildOcrFrameExtractArgs,
  buildProxyScaleFilter,
  buildVideoProxyArgs,
  parseFfprobeFraction,
  summarizeFfmpegError
} = require('../src/services/mediaToolService');

function run() {
  assert.strictEqual(buildProxyScaleFilter(1920, 1080), 'scale=min(640\\,iw):-2');
  assert.strictEqual(buildProxyScaleFilter(720, 1280), 'scale=-2:min(640\\,ih)');
  assert.strictEqual(buildProxyScaleFilter(360, 640), 'scale=-2:min(640\\,ih)');

  const withAudio = buildVideoProxyArgs('/in.mp4', '/out.mp4', {
    audioStreamCount: 3,
    width: 1920,
    height: 1080,
    metadataComment: 'MetMAM tarafından üretilen proxy'
  });
  assert(withAudio.includes('-map'));
  assert(withAudio.includes('0:v:0'));
  assert(withAudio.includes('0:a:0'));
  assert(withAudio.includes('aac'));
  assert(withAudio.includes('160k'));
  assert(!withAudio.includes('amerge'));
  assert(!withAudio.includes('-filter_complex'));
  const metadataIndex = withAudio.indexOf('-metadata');
  assert(metadataIndex >= 0);
  assert.strictEqual(withAudio[metadataIndex + 1], 'comment=MetMAM tarafından üretilen proxy');

  const noAudio = buildVideoProxyArgs('/in.mp4', '/out.mp4', {
    includeAudio: false,
    audioStreamCount: 3,
    width: 720,
    height: 1280
  });
  assert(noAudio.includes('-an'));
  assert(!noAudio.includes('0:a:0'));
  assert(noAudio.includes('scale=-2:min(640\\,ih)'));

  assert.strictEqual(parseFfprobeFraction('30000/1001').toFixed(3), '29.970');
  assert.strictEqual(parseFfprobeFraction('25'), 25);
  assert.strictEqual(parseFfprobeFraction('0/0'), 0);

  assert.deepStrictEqual(
    buildAudioExtractArgs('/in.mp4', '/out.wav'),
    ['-y', '-i', '/in.mp4', '-map', '0:a:0', '-vn', '-c:a', 'pcm_s16le', '/out.wav']
  );
  assert(buildMediaTranscodeArgs('/in.mov', '/out.mp4', { profile: 'video-h264' }).includes('libx264'));
  assert.throws(() => buildMediaTranscodeArgs('/in', '/out', { profile: 'arbitrary' }), /Unsupported media transcode profile/);
  const frameArgs = buildOcrFrameExtractArgs('/in.mp4', '/frames/frame-%06d.jpg', { intervalSec: 5, startSec: 10, endSec: 20 });
  assert(frameArgs.includes('fps=1/5,scale=min(2200\\,iw):-2'));
  assert(frameArgs.includes('10.000'));
  const imageArgs = buildImageDerivativeArgs('/in.png', '/out.jpg', { kind: 'thumbnail' });
  assert(imageArgs.includes('scale=480:480:force_original_aspect_ratio=decrease'));
  assert.deepStrictEqual(
    buildAudioExtractArgs('/in.mp4', '/out.wav', { audioStreamIndex: 3, audioChannelIndex: 2 }),
    ['-y', '-i', '/in.mp4', '-map', '0:3', '-vn', '-af', 'pan=mono|c0=c1', '-ac', '1', '-c:a', 'pcm_s16le', '/out.wav']
  );

  const summary = summarizeFfmpegError([
    'ffmpeg version 5.1',
    'configuration: --very-long',
    'Input #0',
    'Stream mapping:',
    'Invalid argument'
  ].join('\n'));
  assert(!summary.includes('ffmpeg version'));
  assert(!summary.includes('configuration:'));
  assert(summary.includes('Invalid argument'));

  console.log('media tool service tests passed');
}

run();
