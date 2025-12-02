# Transcoding Service - Quick Start

## 🚀 Deploy to Railway in 5 Minutes

### 1. Push to GitHub

```bash
cd C:\Users\Joaquim\Downloads\heimkino\transcode-service
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/heimkino-transcode.git
git push -u origin main
```

### 2. Deploy on Railway

1. Go to https://railway.app
2. Login with GitHub
3. Click "New Project" → "Deploy from GitHub repo"
4. Select `heimkino-transcode`
5. Wait 2 minutes for deployment
6. Click "Settings" → "Networking" → "Generate Domain"
7. **COPY YOUR URL!** (e.g., `https://heimkino-transcode-production.up.railway.app`)

### 3. Configure Main App

```bash
cd C:\Users\Joaquim\Downloads\heimkino

# Add to .env
echo "REACT_APP_TRANSCODE_URL=https://your-railway-url.up.railway.app" >> .env

# Add to functions/.env
echo "REACT_APP_TRANSCODE_URL=https://your-railway-url.up.railway.app" >> functions/.env

# Rebuild and deploy
npm run build
mkdir -p functions/dist && cp -r dist/* functions/dist/
firebase deploy
```

### 4. Test

Open your Firebase site on mobile and try watching a movie. Check console for:
```
🔄 Video format not mobile-compatible, using transcoding service
```

## Done! 🎉

All video formats now work on mobile!

---

## Alternative: Run Locally (100% Free)

```bash
# Terminal 1: Start transcoding service
cd transcode-service
npm install
npm start

# Terminal 2: Start Cloudflare Tunnel
npm install -g cloudflared
cloudflared tunnel --url http://localhost:3002

# Copy the URL and add to .env:
# REACT_APP_TRANSCODE_URL=https://random-slug.trycloudflare.com
```

**Note:** Your PC must stay running for this to work.
