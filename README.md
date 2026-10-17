# Video Downloader (local use)

A React (Vite) frontend + Express API backend that lets you paste a video URL
and download it to your machine. The backend shells out to `yt-dlp`, which
handles the actual extraction — it supports YouTube, Reddit, and public
Instagram posts/reels, among hundreds of other sites
(full list: https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md).

Note: private Instagram content, or anything behind a login, needs you to
pass `yt-dlp` your browser cookies (`--cookies-from-browser chrome`, e.g.) —
not set up here by default.

**For personal use only** — downloading from most platforms goes against
their Terms of Service, and redistributing or hosting this publicly can raise
copyright issues. Keep it local.

## Setup

1. Install `yt-dlp` (required — the backend calls it as a subprocess):
   - macOS: `brew install yt-dlp`
   - Windows: `winget install yt-dlp`
   - Linux: `sudo apt install yt-dlp` or `pip install yt-dlp`

   Verify: `yt-dlp --version`

2. Install Node.js 18+.

3. Start the backend (in one terminal):
   ```
   cd backend
   npm install
   npm start
   ```
   Runs on http://localhost:3000

4. Start the frontend (in a second terminal):
   ```
   cd frontend
   npm install
   npm run dev
   ```
   Runs on http://localhost:5173 and proxies `/api` requests to the backend.

5. Open http://localhost:5173, paste a URL, click Download — the file saves
   through your browser's normal download flow.

## Notes

- Downloaded files are streamed to the browser and deleted from
   `backend/downloads/` right after, so nothing piles up on disk.
- If a download fails, check `yt-dlp --version` still runs, and update it if
  it's been a while (`yt-dlp -U`) — sites change frequently.
- Video quality/format is set in `backend/server.js`
  (`-f "bv*+ba/b" --merge-output-format mp4`) if you want to adjust it.
- To ship a static build of the frontend instead of running the Vite dev
   server: `cd frontend && npm run build`, then serve the `dist/` folder however
  you like (the backend still needs to run separately).
