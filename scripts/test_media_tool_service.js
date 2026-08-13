const assert = require('assert');
const {
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
    height: 1080
  });
  assert(withAudio.includes('-map'));
  assert(withAudio.includes('0:v:0'));
  assert(withAudio.includes('0:a:0'));
  assert(withAudio.includes('aac'));
  assert(withAudio.includes('160k'));
  assert(!withAudio.includes('amerge'));
  assert(!withAudio.includes('-filter_complex'));

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
