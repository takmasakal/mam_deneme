# FFmpeg / FFprobe Command Inventory - Belgelik Web

Date: 2026-08-13
Scope: Kaisha / Belgelik web application, branch `takmasakal/kaisha`.

This document lists the code locations where the application invokes `ffmpeg` or `ffprobe`, with the current line numbers at the time of writing.

## Summary

The application does not use shell-concatenated ffmpeg commands. Commands are executed through Node `spawn()` or through the local `runCommandCapture()` wrapper with argument arrays. This avoids shell interpretation problems for filenames that contain spaces, Turkish characters, underscores, parentheses, or `*` characters.

The proxy failure reported from the admin page was not caused by shell quoting. The admin proxy tool was returning the first 260 characters of raw ffmpeg stderr, so the response mostly showed input metadata and hid the actual ffmpeg failure line. The admin proxy flow also did not pass the audio fallback option used by the upload flow. This was adjusted so admin proxy generation can retry without audio when source audio cannot be decoded reliably, and the returned error now uses the ffmpeg summarizer.

## Core Helpers

### Video Proxy Generation

File: `src/server.js`

- `src/server.js:4041` - `generateVideoProxy(inputPath, outputPath, options = {})`
- `src/server.js:4117` - direct `spawn('ffmpeg', args, ...)` for proxy generation
- `src/server.js:4120` - collects stderr
- `src/server.js:4124` - ffmpeg process error handler
- `src/server.js:4125` - close handler
- `src/server.js:4127` - throws stderr or exit-code error

Purpose:

- Creates MP4 proxy with H.264 video.
- Uses AAC stereo audio for browser/iOS compatibility.
- For multi-stream audio, merges audio streams and downmixes to stereo.
- For portrait video, limits long edge to 640px.

Relevant command shape:

```text
ffmpeg -hide_banner -y -i INPUT -map 0:v:0 -c:v libx264 -preset veryfast -crf 31 -pix_fmt yuv420p -profile:v main -level 4.0 -vf SCALE_FILTER [audio options] -movflags +faststart OUTPUT
```

### Generic FFmpeg Runner

File: `src/server.js`

- `src/server.js:4172` - prepends `-hide_banner` if absent
- `src/server.js:4173` - direct `spawn('ffmpeg', ffmpegArgs, ...)`
- `src/server.js:4175` - collects stderr
- `src/server.js:4178` - process error handler
- `src/server.js:4179` - close handler
- `src/server.js:4181` - throws stderr or exit-code error

Purpose:

- Runs low-level ffmpeg tasks where only success/failure is needed.

### FFmpeg Error Summarizer

File: `src/server.js`

- `src/server.js:4186` - `summarizeFfmpegError(error)`
- `src/server.js:4193` - filters noisy ffmpeg banner/configuration lines

Purpose:

- Removes banner/config noise from ffmpeg stderr.
- Returns the last meaningful lines so UI/API errors show the real failure instead of only input metadata.

### Command Capture Wrapper

File: `src/server.js`

- `src/server.js:4208` - `runCommandCapture(cmd, args, options = {})`

Purpose:

- Shared wrapper for `ffmpeg`, `ffprobe`, `python3`, backup tools, and document utilities.
- Captures stdout/stderr.
- Tracks media job processes when `jobId` is supplied.
- Parses `MAM_PROGRESS` lines for job progress callbacks.

## Video OCR Frame Sampling

File: `src/server.js`

### Scene Change Detection

- `src/server.js:1644` - `runCommandCapture('ffmpeg', [...])`

Purpose:

- Detects scene-change timestamps using `select='gt(scene,...)',showinfo`.

Command shape:

```text
ffmpeg -hide_banner -loglevel info -i INPUT -vf select='gt(scene,THRESHOLD)',showinfo -an -f null -
```

### Scene Frame Extraction

- `src/server.js:1697` - `runCommandCapture('ffmpeg', args, ...)`

Purpose:

- Extracts selected scene frames for OCR.

Command shape:

```text
ffmpeg -hide_banner -loglevel error -ss SEC -i INPUT -frames:v 1 [-vf VISUAL_ENHANCE] -q:v 3 OUTPUT.jpg
```

### Periodic OCR Frame Sampling

- `src/server.js:4531` - builds `ffmpegArgs`
- `src/server.js:4536` - optional `-ss` range start
- `src/server.js:4537` - input path
- `src/server.js:4538` - optional `-t` range duration
- `src/server.js:4539` - pushes frame sampling options
- `src/server.js:4547` - `runCommandCapture('ffmpeg', ffmpegArgs, ...)`
- `src/server.js:4551` - throws if frame sampling failed

Purpose:

- Samples video frames at fixed intervals for OCR.
- Supports optional IN/OUT timecode range.

Command shape:

```text
ffmpeg -hide_banner -loglevel error [-ss START] -i INPUT [-t DURATION] -vf FPS_AND_PREPROCESS_FILTER -q:v 3 frame-%06d.jpg
```

## Subtitle / Audio Preparation

File: `src/server.js`

- `src/server.js:4402` - `runCommandCapture('ffmpeg', args, ...)`

Purpose:

- Extracts selected audio stream/channel to temporary WAV for subtitle transcription.

Command shape:

```text
ffmpeg -y -i INPUT [-map 0:STREAM_INDEX | -map 0:a:0] -vn [-af pan=mono|c0=cN -ac 1] -c:a pcm_s16le TEMP.wav
```

## Photo OCR Preparation

File: `src/server.js`

- `src/server.js:4432` - `runCommandCapture('ffmpeg', [...])`

Purpose:

- Converts a still image into a normalized JPEG frame for OCR.

Command shape:

```text
ffmpeg -hide_banner -loglevel error -y -i INPUT -frames:v 1 -vf scale=min(2200\,iw):-2 -q:v 3 frame-000001.jpg
```

## Media Probe Calls

File: `src/server.js`

### Duration Probe

- `src/server.js:6474` - direct `spawn('ffprobe', args, ...)`
- `src/server.js:6476` - collects stdout
- `src/server.js:6479` - process error fallback
- `src/server.js:6480` - close handler

Purpose:

- Reads media duration quickly.

Command shape:

```text
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 INPUT
```

### Audio Stream Probe

- `src/server.js:6489` - `runCommandCapture('ffprobe', [...])`

Purpose:

- Lists audio stream indexes and channel counts.

Command shape:

```text
ffprobe -v error -select_streams a -show_entries stream=index,channels -of json INPUT
```

### Audio Stream Option Probe

- `src/server.js:6517` - `runCommandCapture('ffprobe', [...])`

Purpose:

- Lists audio stream indexes, channels, codec, language and title for UI selection.

Command shape:

```text
ffprobe -v error -select_streams a -show_entries stream=index,channels,codec_name:stream_tags=language,title -of json INPUT
```

### Full Technical Probe

- `src/server.js:6584` - `runCommandCapture('ffprobe', [...])`

Purpose:

- Reads format and stream metadata for technical info and proxy sizing decisions.

Command shape:

```text
ffprobe -v error -print_format json -show_format -show_streams INPUT
```

## Image Derivatives

File: `src/services/imageDerivativeService.js`

### HEIC Preview Fallback

- `src/services/imageDerivativeService.js:39` - `runCommandCapture('ffmpeg', [...])`
- `src/services/imageDerivativeService.js:56` - validates output
- `src/services/imageDerivativeService.js:60` - includes ffmpeg fallback error text

Purpose:

- Converts HEIC/HEIF or heif-convert intermediate image to 1280px preview JPEG.

Command shape:

```text
ffmpeg -y -i INPUT_OR_INTERMEDIATE -frames:v 1 -vf scale=1280:1280:force_original_aspect_ratio=decrease -q:v 5 OUTPUT.jpg
```

### Generic Image Preview

- `src/services/imageDerivativeService.js:67` - `runCommandCapture('ffmpeg', [...])`

Purpose:

- Creates 1280px image preview for normal image formats.

### Generic Image Thumbnail

- `src/services/imageDerivativeService.js:85` - `runCommandCapture('ffmpeg', [...])`

Purpose:

- Creates 480px thumbnail for image cards/mobile previews.

## Metadata Enrichment

File: `src/services/metadataEnrichmentService.js`

### Image Metadata OCR Preparation

- `src/services/metadataEnrichmentService.js:580` - `runCommandCapture('ffmpeg', [...])`

Purpose:

- Converts image to a resized scene frame for OCR-backed metadata extraction.

Command shape:

```text
ffmpeg -y -i INPUT -frames:v 1 -vf scale=min(1600\,iw):-2 scene-000001.jpg
```

### Video Scene Frame Extraction For Metadata

- `src/services/metadataEnrichmentService.js:605` - `runCommandCapture('ffmpeg', [...])`

Purpose:

- Extracts up to 10 scene-change frames for video metadata.

Command shape:

```text
ffmpeg -y -i INPUT -vf select='gt(scene,0.32)',scale=min(960\,iw):-2 -vsync vfr -frames:v 10 scene-%06d.jpg
```

### Video Metadata Fallback Frame

- `src/services/metadataEnrichmentService.js:616` - `runCommandCapture('ffmpeg', [...])`

Purpose:

- Extracts one fallback frame when scene detection produces no output.

Command shape:

```text
ffmpeg -y -ss 1 -i INPUT -frames:v 1 -vf scale=min(960\,iw):-2 scene-000001.jpg
```

## Admin Health Endpoint

File: `src/routes/admin.js`

- `src/routes/admin.js:3671` - `/api/admin/ffmpeg-health`
- `src/routes/admin.js:3674` - `runCommandCapture('ffmpeg', ['-version'])`
- `src/routes/admin.js:3675` - `runCommandCapture('ffprobe', ['-version'])`

Purpose:

- Verifies that ffmpeg and ffprobe are installed in the app container.

## Proxy Call Sites

### Upload Flow

File: `src/routes/assets.js`

- `src/routes/assets.js:1282` - calls `generateVideoProxy(absolutePath, proxyOut.absolutePath, { allowAudioFallback })`

Purpose:

- Generates proxy during video upload.
- Can ask for or use silent proxy fallback when source audio cannot be decoded reliably.

### Admin Proxy Tool

File: `src/routes/admin.js`

- `src/routes/admin.js:3899` - proxy mode branch
- `src/routes/admin.js:4009` - resolves current proxy URL for response
- `src/routes/admin.js:4238` - error response now uses `summarizeFfmpegError()`

Purpose:

- Generates or regenerates proxy from Management > Settings proxy tools.
- Updated to pass `allowAudioFallback: true` through `ensureVideoProxyAndThumbnail()` so admin proxy generation behaves like the upload flow for bad source audio.

### Ensure Proxy API

File: `src/server.js`

- `src/server.js:6819` - calls `generateVideoProxy()` inside `ensureVideoProxyAndThumbnail()`
- `src/server.js:8192` - `/api/assets/:id/ensure-proxy`
- `src/server.js:8204` - ensure-proxy error response

Purpose:

- Regenerates missing or forced proxy/thumbnail for one asset.

## Operational Debug Commands

Use these on the Belgelik server for the reported asset:

```bash
docker logs --tail=200 kaisha-app | grep -Ei 'ffmpeg|proxy|Failed to run proxy|error'

docker exec -it kaisha-app sh -lc '
ffprobe -hide_banner -show_streams -show_format "/app/uploads/2026/8/12/video/1786549270228-GGq7ZvXZTYbb8od6vWUOV-Prof._Dr.*Taskin_Duman_beyin_sag_l_g___hakkinda_TRT_de_konusuyor-_Bolum_2.mp4"
'
```

If the filename differs because of shell escaping, copy the exact path from the DB with:

```bash
docker exec -it kaisha-postgres psql -U postgres -d mam_mvp -c "
SELECT id, title, media_url, source_path, proxy_url, proxy_status
FROM assets
WHERE title ILIKE '%Taskin%' OR file_name ILIKE '%Taskin%';
"
```
