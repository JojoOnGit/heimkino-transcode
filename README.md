# Heimkino Transcoding Service

Video transcoding service that converts MKV/AVI videos to MP4 for mobile playback.

## Features

- ✅ Real-time FFmpeg transcoding
- ✅ Streams MP4 to mobile browsers
- ✅ H.264 video + AAC audio (universal compatibility)
- ✅ No file storage (direct streaming)
- ✅ Free deployment on Railway.app

## How It Works

```
Mobile Browser
    ↓
Request MKV video
    ↓
This Service (Railway)
    ↓
Fetch from Real-Debrid
    ↓
FFmpeg transcode to MP4
    ↓
Stream MP4 to browser
```

## API Endpoints

### GET /health
Health check endpoint

**Response:**
```json
{
  "status": "ok",
  "service": "Heimkino Transcoding Service",
  "version": "1.0.0",
  "ffmpeg": "available"
}
```

### GET /transcode?url=<video_url>
Transcode video to MP4 and stream it

**Parameters:**
- `url` - Direct video URL (from Real-Debrid)

**Response:** MP4 video stream

**Example:**
```
GET /transcode?url=https://real-debrid.com/d/ABC123/video.mkv
```

### GET /info?url=<video_url>
Get video metadata without transcoding

**Parameters:**
- `url` - Direct video URL

**Response:**
```json
{
  "format": "matroska,webm",
  "duration": "7200.5",
  "size": "5368709120",
  "video": {
    "codec": "h264",
    "width": 1920,
    "height": 1080
  },
  "audio": {
    "codec": "aac",
    "channels": 2
  },
  "mobileCompatible": false
}
```

## Local Development

### Prerequisites
- Node.js 18+
- FFmpeg installed

**Install FFmpeg:**
```bash
# Windows
choco install ffmpeg

# Mac
brew install ffmpeg

# Linux
apt-get install ffmpeg
```

### Run Locally
```bash
cd transcode-service
npm install
npm start
```

Server runs on http://localhost:3002

### Test Transcoding
```bash
# Test with a sample video URL
curl "http://localhost:3002/transcode?url=YOUR_VIDEO_URL"
```

## Deploy to Railway.app (FREE)

### Option 1: Deploy from GitHub (Recommended)

1. **Push to GitHub:**
```bash
cd transcode-service
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/heimkino-transcode.git
git push -u origin main
```

2. **Deploy on Railway:**
   - Go to https://railway.app
   - Click "Start a New Project"
   - Select "Deploy from GitHub repo"
   - Choose your repository
   - Railway automatically detects Node.js and FFmpeg
   - Click "Deploy"

3. **Get your URL:**
   - After deployment, Railway gives you a URL like:
   - `https://heimkino-transcode-production.up.railway.app`

### Option 2: Deploy with Railway CLI

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Initialize project
railway init

# Deploy
railway up
```

### Environment Variables (Optional)

No environment variables required! The service works out of the box.

## Free Tier Limits

Railway.app free tier includes:
- ✅ 500 hours/month runtime
- ✅ 1GB RAM
- ✅ Unlimited bandwidth
- ✅ FFmpeg pre-installed

**Perfect for personal use!**

## Performance

**Transcoding speed:**
- 1080p video: ~1x realtime (transcodes as fast as you watch)
- 720p video: ~2-3x realtime
- CPU usage: ~80% during transcoding

**Startup time:**
- First request: ~5-10 seconds (FFmpeg initialization)
- Subsequent: Instant

## Troubleshooting

### "FFmpeg not found"
- Railway automatically installs FFmpeg via `nixpacks.toml`
- No action needed on Railway
- For local dev, install FFmpeg manually

### "Transcoding too slow"
- Railway free tier has limited CPU
- Consider upgrading to Railway Pro ($5/month) for better performance
- Or deploy to your own PC for faster transcoding

### "Video stutters on mobile"
- This is normal during initial buffering
- FFmpeg is transcoding in real-time
- Wait 10-20 seconds for buffer to fill
- Or use `-preset fast` for faster encoding (lower quality)

## Integration with Main App

The main Heimkino app automatically detects MKV files and routes them to this service:

```javascript
// In frontend (Watch.tsx)
if (videoFormat === 'mkv' && isMobile) {
  // Use transcoding service
  streamUrl = `https://your-transcode-service.up.railway.app/transcode?url=${realDebridUrl}`;
} else {
  // Use direct Real-Debrid URL
  streamUrl = realDebridUrl;
}
```

## Cost

**Railway free tier:**
- $0/month for personal use
- 500 hours/month (enough for 500 movies!)

**If you exceed free tier:**
- $5/month for Railway Pro
- 1000 hours/month runtime
- Better CPU performance

## License

MIT
