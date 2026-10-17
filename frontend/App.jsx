import { useState } from 'react';
import './App.css';

export default function App() {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();

    setStatus('working');
    setProgress(0);
    setError('');

    try {
      // Start the download
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: url.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));

        throw new Error(
          data.error || 'Download failed.'
        );
      }

      // Backend immediately returns the download ID
      const data = await res.json();
      const downloadId = data.id;

      // Listen for live progress
      const eventSource = new EventSource(
        `/api/progress/${downloadId}`
      );

      eventSource.onmessage = (event) => {
        const download = JSON.parse(event.data);

        // Update percentage
        setProgress(Math.round(download.progress));

        // Download completed
        if (download.status === 'completed') {
          eventSource.close();

          setProgress(100);

          // Start the actual file download
          window.location.href =
            `/api/download-file/${downloadId}`;

          setStatus('idle');
          setUrl('');
        }

        // Download failed
        if (download.status === 'error') {
          eventSource.close();

          setError(
            download.error || 'Download failed.'
          );

          setStatus('error');
        }
      };

      // SSE connection error
      eventSource.onerror = () => {
        eventSource.close();

        setError(
          'Connection to download server lost.'
        );

        setStatus('error');
      };
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }

  return (
    <main className="card">
      <h1>Video Downloader</h1>

      <p className="hint">
        Paste your video URL
      </p>

      <form onSubmit={handleSubmit}>
        <input
          type="url"
          placeholder="https://example.com/watch?v=..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />

        <button
          type="submit"
          disabled={status === 'working'}
        >
          {status === 'working'
            ? `Downloading ${progress}%`
            : 'Download'}
        </button>
      </form>

      {status === 'working' && (
        <div className="progress-container">

          <div className="progress-info">
            <span>Downloading...</span>

            <span>
              {progress}%
            </span>
          </div>

          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{
                width: `${progress}%`,
              }}
            />
          </div>

        </div>
      )}

      {status === 'error' && (
        <p className="error">
          {error}
        </p>
      )}
    </main>
  );
}

