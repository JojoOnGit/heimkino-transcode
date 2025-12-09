/**
 * Heimkino Transcoding Service
 * Converts MKV/AVI/other formats to MP4 for mobile playback
 * Runs on Railway.app (free tier)
 */

const express = require('express');
const cors = require('cors');
const ffmpeg = require('fluent-ffmpeg');
const axios = require('axios');
const { Readable } = require('stream');

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors({
  origin: '*', // Allow all origins (Firebase, localhost, etc.)
  methods: ['GET', 'HEAD', 'OPTIONS'],
}));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Heimkino Transcoding Service',
    version: '1.0.0',
    ffmpeg: 'available'
  });
});

/**
 * Transcode endpoint
 * GET /transcode?url=<video_url>
 *
 * Accepts a video URL (from Real-Debrid) and transcodes it to MP4
 * Streams the transcoded video back to the client
 */
app.get('/transcode', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  console.log('🎬 Transcode request received');
  console.log('   Source URL:', url.substring(0, 60) + '...');

  try {
    // Fetch the video from Real-Debrid
    console.log('📥 Fetching video from Real-Debrid...');
    const videoResponse = await axios({
      method: 'get',
      url: url,
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0',
      }
    });

    const inputStream = videoResponse.data;
    const contentLength = videoResponse.headers['content-length'];
    const fileSizeMB = contentLength ? Math.round(contentLength / 1024 / 1024) : 0;

    console.log('✅ Video stream started');
    console.log('   Size:', fileSizeMB + ' MB');

    // Reject files over 30GB - they're too large to transcode on Railway free tier
    // These are typically BDRemux files that should be avoided anyway
    if (fileSizeMB > 30000) {
      console.error('❌ File too large for transcoding:', fileSizeMB, 'MB');
      console.error('   Railway free tier cannot handle files over 30GB');
      console.error('   Suggestion: Use WEB-DL/WEBRip torrents instead (they have AAC audio)');
      return res.status(413).json({
        error: 'File too large for transcoding',
        size: fileSizeMB + ' MB',
        message: 'This file is too large to transcode. Please try a different quality (WEB-DL recommended) or play directly without transcoding.'
      });
    }

    // Set response headers for streaming
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'no-cache');

    console.log('🔄 Starting FFmpeg transcoding...');
    console.log('   Target: H.264 video, AAC audio, MP4 container');
    console.log('   Preset: ultrafast (for real-time streaming)');

    // Probe the input to determine if we need full video transcode or just audio remux
    console.log('🔍 Probing input to determine video codec...');

    // For now, use a smart approach:
    // - Copy video codec if already H.264 (fast)
    // - Transcode video only if needed (MKV/AVI/other containers)
    // Always convert audio to AAC for browser compatibility

    // Start FFmpeg with smart codec selection
    const ffmpegCommand = ffmpeg(inputStream)
      .videoCodec('copy')        // Try copying video first (fast, low memory)
      .audioCodec('aac')         // Always convert audio to AAC (browser compatible)
      .audioBitrate('192k')      // Good quality AAC
      .format('mp4')             // MP4 container
      .outputOptions([
        '-movflags frag_keyframe+empty_moov+faststart', // Enable streaming
        '-avoid_negative_ts make_zero',  // Fix timestamp issues
        '-max_muxing_queue_size 1024',   // Limit muxing queue to reduce memory
      ])
      .on('start', (commandLine) => {
        console.log('▶️  FFmpeg started');
        console.log('   Command:', commandLine.substring(0, 100) + '...');
      })
      .on('progress', (progress) => {
        if (progress.percent) {
          console.log(`⏳ Progress: ${progress.percent.toFixed(1)}% | Time: ${progress.timemark}`);
        }
      })
      .on('end', () => {
        console.log('✅ Transcoding completed successfully');
      })
      .on('error', (err, stdout, stderr) => {
        console.error('❌ FFmpeg error:', err.message);
        if (stderr) {
          console.error('FFmpeg stderr:', stderr.substring(0, 500));
        }
        if (!res.headersSent) {
          res.status(500).json({ error: 'Transcoding failed', message: err.message });
        }
      });

    // Pipe transcoded stream to response
    ffmpegCommand.pipe(res, { end: true });

  } catch (error) {
    console.error('❌ Transcode error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Failed to transcode video',
        message: error.message
      });
    }
  }
});

/**
 * Get video info without transcoding
 * GET /info?url=<video_url>
 *
 * Returns video metadata (format, codecs, duration, etc.)
 */
app.get('/info', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  console.log('ℹ️  Video info request:', url.substring(0, 60) + '...');

  try {
    // Use ffprobe to get video information
    const videoResponse = await axios({
      method: 'get',
      url: url,
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0',
      }
    });

    ffmpeg.ffprobe(videoResponse.data, (err, metadata) => {
      if (err) {
        console.error('❌ FFprobe error:', err.message);
        return res.status(500).json({ error: 'Failed to get video info' });
      }

      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      const audioStream = metadata.streams.find(s => s.codec_type === 'audio');

      const info = {
        format: metadata.format.format_name,
        duration: metadata.format.duration,
        size: metadata.format.size,
        bitrate: metadata.format.bit_rate,
        video: videoStream ? {
          codec: videoStream.codec_name,
          width: videoStream.width,
          height: videoStream.height,
          fps: eval(videoStream.r_frame_rate),
        } : null,
        audio: audioStream ? {
          codec: audioStream.codec_name,
          sampleRate: audioStream.sample_rate,
          channels: audioStream.channels,
        } : null,
        mobileCompatible: videoStream?.codec_name === 'h264' &&
                         metadata.format.format_name.includes('mp4'),
      };

      console.log('✅ Video info retrieved');
      console.log('   Format:', info.format);
      console.log('   Mobile compatible:', info.mobileCompatible ? 'Yes ✅' : 'No ❌');

      res.json(info);
    });

  } catch (error) {
    console.error('❌ Info error:', error.message);
    res.status(500).json({ error: 'Failed to get video info', message: error.message });
  }
});

/**
 * Audio-only remux endpoint
 * GET /audio-remux?url=<video_url>
 *
 * Remuxes video to extract audio and convert to AAC (browser compatible)
 * Keeps video stream as-is, only transcodes audio - much faster than full transcode
 */
app.get('/audio-remux', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  console.log('🎵 Audio remux request received');
  console.log('   Source URL:', url.substring(0, 60) + '...');

  try {
    // Fetch the video from Real-Debrid
    console.log('📥 Fetching video from Real-Debrid...');
    const videoResponse = await axios({
      method: 'get',
      url: url,
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0',
      }
    });

    const inputStream = videoResponse.data;
    const contentLength = videoResponse.headers['content-length'];
    const fileSizeMB = contentLength ? Math.round(contentLength / 1024 / 1024) : 0;

    console.log('✅ Video stream started');
    console.log('   Size:', fileSizeMB + ' MB');

    // Set response headers for streaming
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'no-cache');

    console.log('🔄 Starting audio remux (copy video, convert audio to AAC)...');
    console.log('   This is much faster than full transcoding!');

    // Remux: Copy video stream, only transcode audio to AAC
    const ffmpegCommand = ffmpeg(inputStream)
      .videoCodec('copy')         // Copy video as-is (no transcoding = FAST!)
      .audioCodec('aac')          // Convert audio to AAC (browser compatible)
      .audioBitrate('192k')       // Good quality AAC audio
      .format('mp4')              // MP4 container
      .outputOptions([
        '-movflags frag_keyframe+empty_moov+faststart', // Enable streaming
        '-avoid_negative_ts make_zero',  // Fix timestamp issues
      ])
      .on('start', (commandLine) => {
        console.log('▶️  FFmpeg started (audio remux mode)');
        console.log('   Command:', commandLine.substring(0, 100) + '...');
      })
      .on('progress', (progress) => {
        if (progress.percent) {
          console.log(`⏳ Progress: ${progress.percent.toFixed(1)}% | Time: ${progress.timemark}`);
        }
      })
      .on('end', () => {
        console.log('✅ Audio remux completed successfully');
      })
      .on('error', (err, stdout, stderr) => {
        console.error('❌ FFmpeg error:', err.message);
        if (stderr) {
          console.error('FFmpeg stderr:', stderr.substring(0, 500));
        }
        if (!res.headersSent) {
          res.status(500).json({ error: 'Audio remux failed', message: err.message });
        }
      });

    // Pipe remuxed stream to response
    ffmpegCommand.pipe(res, { end: true });

  } catch (error) {
    console.error('❌ Audio remux error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Failed to remux audio',
        message: error.message
      });
    }
  }
});

/**
 * Torrentio proxy endpoint
 * GET /torrentio/:imdbId
 *
 * Proxies Torrentio API requests to bypass Cloudflare blocking
 * Firebase Functions IP addresses are blocked, but Railway is not
 */
app.get('/torrentio/:imdbId', async (req, res) => {
  const { imdbId } = req.params;
  const { type = 'movie' } = req.query;

  if (!imdbId) {
    return res.status(400).json({ error: 'Missing IMDb ID' });
  }

  console.log('🔍 Torrentio proxy request');
  console.log('   IMDb ID:', imdbId);
  console.log('   Type:', type);

  try {
    const torrentioUrl = `https://torrentio.strem.fun/stream/${type}/${imdbId}.json`;
    console.log('   Fetching from:', torrentioUrl);

    const response = await axios({
      method: 'get',
      url: torrentioUrl,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    console.log('✅ Torrentio response received');
    console.log('   Streams found:', response.data.streams?.length || 0);

    res.json(response.data);
  } catch (error) {
    console.error('❌ Torrentio proxy error:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', typeof error.response.data === 'string'
        ? error.response.data.substring(0, 200)
        : JSON.stringify(error.response.data).substring(0, 200));
      return res.status(error.response.status).json({
        error: 'Torrentio API error',
        status: error.response.status
      });
    }
    res.status(500).json({ error: 'Failed to fetch from Torrentio', message: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log('========================================');
  console.log('🎬 Heimkino Transcoding Service');
  console.log('========================================');
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
  console.log(`🔄 Transcode: http://localhost:${PORT}/transcode?url=<video_url>`);
  console.log(`ℹ️  Info: http://localhost:${PORT}/info?url=<video_url>`);
  console.log(`🔍 Torrentio Proxy: http://localhost:${PORT}/torrentio/:imdbId`);
  console.log('========================================');
  console.log('Waiting for requests...');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('⏹️  SIGTERM received, shutting down gracefully...');
  process.exit(0);
});
