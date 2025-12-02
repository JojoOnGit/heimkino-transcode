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

    console.log('✅ Video stream started');
    console.log('   Size:', contentLength ? Math.round(contentLength / 1024 / 1024) + ' MB' : 'Unknown');

    // Set response headers for streaming
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'no-cache');

    console.log('🔄 Starting FFmpeg transcoding...');
    console.log('   Target: H.264 video, AAC audio, MP4 container');
    console.log('   Preset: ultrafast (for real-time streaming)');

    // Start FFmpeg transcoding
    const ffmpegCommand = ffmpeg(inputStream)
      .videoCodec('libx264')     // H.264 video (mobile compatible)
      .audioCodec('aac')         // AAC audio (mobile compatible)
      .format('mp4')             // MP4 container
      .outputOptions([
        '-movflags frag_keyframe+empty_moov+faststart', // Enable streaming
        '-preset ultrafast',     // Fast encoding for real-time
        '-crf 23',              // Good quality (lower = better, 18-28 range)
        '-maxrate 5M',          // Max bitrate 5Mbps (prevents buffering)
        '-bufsize 10M',         // Buffer size
        '-g 60',                // Keyframe every 60 frames (2 seconds at 30fps)
        '-sc_threshold 0',      // Disable scene detection (faster)
        '-pix_fmt yuv420p',     // Pixel format (mobile compatible)
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

// Start server
app.listen(PORT, () => {
  console.log('========================================');
  console.log('🎬 Heimkino Transcoding Service');
  console.log('========================================');
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
  console.log(`🔄 Transcode: http://localhost:${PORT}/transcode?url=<video_url>`);
  console.log(`ℹ️  Info: http://localhost:${PORT}/info?url=<video_url>`);
  console.log('========================================');
  console.log('Waiting for transcode requests...');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('⏹️  SIGTERM received, shutting down gracefully...');
  process.exit(0);
});
