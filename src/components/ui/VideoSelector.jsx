import { useState, useEffect, useRef } from 'react';

const API = '/api';

export default function VideoSelector({ value, onChange, placeholder = 'Sin video asignado' }) {
  const [videos, setVideos] = useState([]);
  const [open, setOpen]     = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    fetch(`${API}/videos/queue`)
      .then((r) => r.json())
      .then((rows) => setVideos(rows.filter((v) => v.status === 'done')))
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = videos.find((v) => v.output === value);
  const label    = selected ? selected.original : value || placeholder;

  return (
    <div ref={ref} style={{ position: 'relative', minWidth: 180 }}>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          height: 36, padding: '0 10px 0 8px',
          border: `1px solid ${open ? 'var(--accent)' : 'var(--line)'}`,
          borderRadius: 'var(--radius-sm)',
          background: 'var(--surface)',
          color: selected || value ? 'var(--ink)' : 'var(--ink-faint)',
          cursor: 'pointer', width: '100%', textAlign: 'left',
          fontSize: 13, boxShadow: open ? 'var(--shadow-focus)' : 'none',
          transition: 'border-color 120ms',
        }}
      >
        {/* Thumbnail */}
        {selected ? (
          <span style={{ width: 28, height: 18, background: '#000', borderRadius: 1, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><polygon points="2,1 9,5 2,9" fill="white" opacity="0.7"/></svg>
          </span>
        ) : (
          <span style={{ width: 28, height: 18, background: 'var(--surface-3)', borderRadius: 1, flexShrink: 0 }} />
        )}
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--ink-mute)" strokeWidth="1.5" strokeLinecap="round">
          <path d="M2 3.5l3 3 3-3" />
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
          background: 'var(--surface)', border: '1px solid var(--line)',
          boxShadow: 'var(--shadow-3)', marginTop: 2,
          maxHeight: 220, overflowY: 'auto',
          borderRadius: 'var(--radius-sm)',
        }}>
          {/* Clear option */}
          <button
            type="button"
            onClick={() => { onChange(''); setOpen(false); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              width: '100%', padding: '8px 10px', background: 'none',
              border: 'none', cursor: 'pointer', fontSize: 12,
              color: 'var(--ink-mute)', borderBottom: '1px solid var(--line-soft)',
            }}
          >
            <span style={{ width: 28, height: 18, background: 'var(--surface-3)', borderRadius: 1, flexShrink: 0 }} />
            Sin video
          </button>

          {videos.length === 0 && (
            <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--ink-mute)' }}>
              No hay videos procesados aún.
              <a href="/video" style={{ color: 'var(--accent)', marginLeft: 4 }}>Subir uno →</a>
            </div>
          )}

          {videos.map((v) => (
            <div
              key={v.id}
              style={{
                display: 'flex', alignItems: 'center',
                background: v.output === value ? 'var(--accent-soft)' : 'none',
                borderBottom: '1px solid var(--line-soft)',
              }}
            >
              <button
                type="button"
                onClick={() => { onChange(v.output); setOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  flex: 1, padding: '8px 10px',
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 13, color: 'var(--ink)', textAlign: 'left',
                }}
              >
                <span style={{ width: 28, height: 18, background: '#000', borderRadius: 1, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><polygon points="2,1 9,5 2,9" fill="white" opacity="0.7"/></svg>
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: v.output === value ? 600 : 400 }}>
                    {v.original}
                  </div>
                </div>
                {v.output === value && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round"><path d="M2 6l3 3 5-5"/></svg>
                )}
              </button>
              <a
                href={`/videos/${v.output}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Ver preview"
                onClick={(e) => e.stopPropagation()}
                style={{
                  padding: '0 10px', height: '100%', display: 'flex', alignItems: 'center',
                  color: 'var(--ink-mute)', fontSize: 13, textDecoration: 'none', flexShrink: 0,
                }}
              >
                ▶
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
