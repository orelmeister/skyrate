'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '40px', background: '#fef2f2' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <h1 style={{ color: '#dc2626' }}>Application Error</h1>
          <div style={{ background: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #fecaca', marginTop: '16px' }}>
            <h3 style={{ margin: '0 0 8px 0' }}>Error Message:</h3>
            <pre style={{ whiteSpace: 'pre-wrap', color: '#7f1d1d', fontSize: '14px', background: '#fef2f2', padding: '12px', borderRadius: '4px' }}>
              {error.message}
            </pre>
            {error.digest && (
              <p style={{ color: '#6b7280', fontSize: '12px', marginTop: '8px' }}>
                Digest: {error.digest}
              </p>
            )}
          </div>
          <button
            onClick={() => reset()}
            style={{ marginTop: '16px', padding: '10px 20px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '16px' }}
          >
            Try Again
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: '16px', marginLeft: '8px', padding: '10px 20px', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '16px' }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
