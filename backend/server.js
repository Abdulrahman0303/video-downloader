const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
 
const app = express();
const PORT = process.env.PORT || 3000;
 
const DOWNLOAD_DIR = path.join(__dirname, 'downloads');
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend', 'dist');
const downloads = new Map();
 
if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR);
}
 
// ===============================
// STARTUP CHECK: ffmpeg
// ===============================
// YouTube/Instagram serve best quality as separate video+audio streams that
// must be merged. Without ffmpeg, yt-dlp can't merge them, and you end up
// with two loose files (video-only + audio-only) instead of one mp4.
// Reddit serves a single combined file, so it "works" even without ffmpeg —
// that's the tell that this is what's going on.
const ffmpegCheck = spawn('ffmpeg', ['-version']);
ffmpegCheck.on('error', () => {
  console.warn(
    '\n⚠️  ffmpeg not found on PATH. YouTube/Instagram downloads will fail ' +
    'to merge video+audio (you may get an audio-only file). Install ffmpeg ' +
    'and restart the server.\n'
  );
});
 
app.use(cors());
app.use(express.json());
 
if (fs.existsSync(FRONTEND_DIR)) {
  app.use(express.static(FRONTEND_DIR));
 
  app.get('/', (req, res) => {
    res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.json({
      status: 'ok',
      message: 'API is running. Start the frontend with npm run dev.'
    });
  });
}
 
// ===============================
// DOWNLOAD VIDEO
// ===============================
 
app.post('/api/download', (req, res) => {
  const { url } = req.body || {};
 
  if (typeof url !== 'string' || !/^https?:\/\/\S+$/.test(url.trim())) {
    return res.status(400).json({
      error: 'Please provide a valid video URL.'
    });
  }
 
  const id = crypto.randomBytes(6).toString('hex');
  const outputTemplate = path.join(DOWNLOAD_DIR, `${id}.%(ext)s`);
 
  const args = [
    '-f', 'bv*+ba/b',
    '--merge-output-format', 'mp4',
    '--no-playlist',
    '--newline',
    '--progress',
    '-o', outputTemplate,
    url.trim()
  ];
 
  const download = { id, status: 'working', progress: 0, error: null, fileName: null, clients: new Set() };
  downloads.set(id, download);

  const sendUpdate = () => {
    const message = `data: ${JSON.stringify({
      status: download.status,
      progress: download.progress,
      error: download.error
    })}\n\n`;
    for (const client of download.clients) {
      client.write(message);
    }
  };

  const failDownload = (message) => {
    download.status = 'error';
    download.error = message;
    sendUpdate();
    fs.readdirSync(DOWNLOAD_DIR)
      .filter(file => file.startsWith(id))
      .forEach(file => fs.unlink(path.join(DOWNLOAD_DIR, file), () => {}));
  };

  console.log(`Starting download ${id}`);
  const child = spawn('yt-dlp', args);
  let errorOutput = '';
  let progressBuffer = '';

  const handleOutput = (data) => {
    const output = data.toString();
    progressBuffer += output;
    const matches = [...progressBuffer.matchAll(/(\d+(?:\.\d+)?)%/g)];
    if (matches.length > 0) {
      download.progress = Math.min(99, Math.round(Number(matches[matches.length - 1][1])));
      sendUpdate();
      progressBuffer = progressBuffer.slice(-100);
    }
  };

  child.stdout.on('data', handleOutput);
  child.stderr.on('data', (data) => {
    const output = data.toString();
    errorOutput += output;
    handleOutput(data);
  });

  child.on('error', (error) => {
    failDownload(`Could not start yt-dlp: ${error.message}. Install yt-dlp and make sure it is on PATH.`);
  });

  child.on('close', (code) => {
    if (download.status === 'error') return;
    if (code !== 0) {
      const details = errorOutput
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('[download]'))
        .slice(-3)
        .join(' ')
        .slice(-500);
      failDownload(details || `yt-dlp exited with code ${code}.`);
      return;
    }

    const files = fs.readdirSync(DOWNLOAD_DIR).filter(file => file.startsWith(id));
    if (files.length === 0) {
      failDownload('yt-dlp finished, but no output file was created.');
      return;
    }

    const mergedMp4 = files.find(file => file.endsWith('.mp4') && !/\.f\d+\./.test(file));
    const fileName = mergedMp4 || (files.length === 1 ? files[0] : null);
    if (!fileName) {
      failDownload('Video and audio could not be merged. Install ffmpeg, add it to PATH, and try again.');
      return;
    }

    files.filter(file => file !== fileName)
      .forEach(file => fs.unlink(path.join(DOWNLOAD_DIR, file), () => {}));

    download.fileName = fileName;
    download.status = 'completed';
    download.progress = 100;
    sendUpdate();
  });

  res.status(202).json({ id });
});

app.get('/api/progress/:id', (req, res) => {
  const download = downloads.get(req.params.id);
  if (!download) {
    return res.status(404).json({ error: 'Download not found.' });
  }

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  res.flushHeaders();

  download.clients.add(res);
  res.write(`data: ${JSON.stringify({
    status: download.status,
    progress: download.progress,
    error: download.error
  })}\n\n`);
  req.on('close', () => download.clients.delete(res));
});

app.get('/api/download-file/:id', (req, res) => {
  const download = downloads.get(req.params.id);
  if (!download || download.status !== 'completed' || !download.fileName) {
    return res.status(404).json({ error: 'Completed download not found.' });
  }

  const filePath = path.join(DOWNLOAD_DIR, download.fileName);
  res.download(filePath, download.fileName, (error) => {
    fs.unlink(filePath, () => {});
    downloads.delete(download.id);
    if (error) {
      console.error('Send error:', error.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Could not send the downloaded file.' });
      }
    }
  });
});
 
app.listen(PORT, () => {
  console.log(`API running at http://localhost:${PORT}`);
});
 