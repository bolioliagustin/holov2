import { useState, useEffect, useRef, useMemo } from 'react';
import { Chip, Btn, ProgressBar, Toggle, Checkbox } from '../components/ui/index';
import { useWS } from '../context/WSContext';
import { useToast } from '../components/ui/Toasts';

const API = '/api';

const BG_PRESETS = [
  { hex: '#000000', name: 'Negro holo', rec: true },
  { hex: '#050a14', name: 'Azul nocturno' },
  { hex: '#0a0a0a', name: 'Negro suave' },
  { hex: '#0d1421', name: 'Marino' },
  { hex: '#001f12', name: 'Verde oscuro' },
];

const MODELS = [
  { key: 'selfie',           label: 'Selfie (portrait)' },
  { key: 'selfie_landscape', label: 'Selfie landscape (grupo)' },
];

function fmtBytes(n) {
  if (!n) return '—';
  if (n < 1024)        return `${n} B`;
  if (n < 1024 ** 2)   return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3)   return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
function fmtDuration(s) {
  if (!s) return '—';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}
function statusColor(s) {
  if (s === 'done')       return 'var(--success-500)';
  if (s === 'error')      return 'var(--danger-500)';
  if (s === 'processing') return 'var(--accent)';
  return 'var(--ink-mute)';
}
function statusIcon(s) {
  if (s === 'done')       return '✓';
  if (s === 'error')      return '!';
  if (s === 'processing') return '↻';
  return '·';
}

// ─── Thumbnail with first-frame poster ────────────────────────────────────
function VideoThumb({ src, size = 'sm', onClick }) {
  const W = size === 'lg' ? 200 : 72;
  const H = size === 'lg' ? 112 : 44;
  return (
    <button
      onClick={onClick}
      style={{
        width: W, height: H, background: '#000',
        border: '1px solid var(--line)', borderRadius: 2, padding: 0,
        cursor: onClick ? 'pointer' : 'default', flexShrink: 0,
        position: 'relative', overflow: 'hidden',
      }}
    >
      {src ? (
        <video
          src={`${src}#t=0.1`}
          preload="metadata"
          muted
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <div style={{ width: '100%', height: '100%', background: 'var(--surface-3)' }} />
      )}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.15)',
      }}>
        <svg width={size === 'lg' ? 22 : 14} height={size === 'lg' ? 22 : 14} viewBox="0 0 22 22" fill="none">
          <circle cx="11" cy="11" r="10" fill="rgba(255,255,255,0.18)" />
          <polygon points="9,6.5 16,11 9,15.5" fill="white" opacity="0.9" />
        </svg>
      </div>
    </button>
  );
}

// ─── Comparator: raw vs processed side-by-side ────────────────────────────
function CompareModal({ item, onClose }) {
  const isPassthrough = !!item.passthrough;
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.88)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: isPassthrough ? 720 : 1200 }}>
        {isPassthrough ? (
          <div>
            <div className="mono" style={{ fontSize: 10, color: 'var(--accent)', letterSpacing: '0.2em', marginBottom: 6 }}>
              YA EDITADO · SIN PROCESAR
            </div>
            <video src={`/videos/${item.output}`} controls style={{ width: '100%', background: '#000' }} />
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div className="mono" style={{ fontSize: 10, color: '#fff8', letterSpacing: '0.2em', marginBottom: 6 }}>ORIGINAL</div>
              <video src={`/uploads/${item.filename}`} controls style={{ width: '100%', background: '#000' }} />
            </div>
            <div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--accent)', letterSpacing: '0.2em', marginBottom: 6 }}>PROCESADO</div>
              <video src={`/videos/${item.output}`} controls style={{ width: '100%', background: '#000' }} />
            </div>
          </div>
        )}
        <div style={{ textAlign: 'right', marginTop: 12 }}>
          <button onClick={onClose} style={{
            color: '#fff', background: 'none', border: '1px solid #fff4',
            borderRadius: 2, padding: '6px 14px', cursor: 'pointer', fontSize: 12,
          }}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Assign to guest modal ────────────────────────────────────────────────
function AssignModal({ item, onClose, onAssigned }) {
  const [guests, setGuests] = useState([]);
  const [query, setQuery]   = useState('');

  useEffect(() => {
    fetch(`${API}/guests?limit=500`).then((r) => r.json()).then((d) => setGuests(d.rows || [])).catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return guests;
    return guests.filter((g) => (g.name || '').toLowerCase().includes(q) || (g.email || '').toLowerCase().includes(q));
  }, [guests, query]);

  const assign = (guestId) => {
    fetch(`${API}/videos/assign/${item.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guest_id: guestId }),
    }).then((r) => {
      if (!r.ok) throw new Error();
      onAssigned();
      onClose();
    }).catch(() => {});
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--surface)', border: '1px solid var(--line)',
        boxShadow: 'var(--shadow-3)', borderRadius: 'var(--radius-sm)',
        width: 480, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '18px 20px 12px', borderBottom: '1px solid var(--line)' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Asignar a invitado</div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--ink-mute)', marginTop: 4 }}>{item.original}</div>
        </div>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--line)' }}>
          <input
            placeholder="Buscar por nombre o email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            style={{
              width: '100%', height: 34, padding: '0 10px',
              border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)',
              background: 'var(--surface)', color: 'var(--ink)', fontSize: 13, outline: 'none',
            }}
          />
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {filtered.length === 0 && (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--ink-mute)', fontSize: 13 }}>
              Sin coincidencias
            </div>
          )}
          {filtered.map((g) => (
            <button
              key={g.id}
              onClick={() => assign(g.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', padding: '10px 20px',
                background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: '1px solid var(--line-soft)', textAlign: 'left',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{g.name}</div>
                <div className="mono" style={{ fontSize: 10, color: 'var(--ink-mute)' }}>
                  {g.table_num ? `Mesa ${g.table_num} · ` : ''}{g.video ? `tiene video` : 'sin video'}
                </div>
              </div>
              {g.video && <Chip variant="warning" mono>YA TIENE</Chip>}
            </button>
          ))}
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'flex-end' }}>
          <Btn variant="ghost" size="sm" onClick={onClose}>Cancelar</Btn>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────
export default function VideoIA() {
  const toast = useToast();
  const { on } = useWS();
  const [queue, setQueue]       = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter]     = useState('all');     // all | queue | done | error
  const [dragging, setDragging] = useState(false);
  const [bulkSelect, setBulkSelect] = useState(new Set());
  const [showCompare, setShowCompare] = useState(false);
  const [showAssign, setShowAssign]   = useState(false);

  // Upload defaults
  const [uploadMode, setUploadMode]   = useState('ai'); // 'ai' | 'passthrough'
  const [uploadBg, setUploadBg]       = useState('#000000');
  const [uploadCustom, setUploadCustom] = useState('');
  const [uploadFeather, setUploadFeather] = useState(5);
  const [uploadModel, setUploadModel] = useState('selfie');
  const [uploadBoost, setUploadBoost] = useState(false);
  const fileRef = useRef(null);

  // Pending edits on the selected item (for reprocess)
  const [edit, setEdit] = useState(null);

  const loadQueue = () => {
    fetch(`${API}/videos/queue`).then((r) => r.json()).then(setQueue).catch(() => {});
  };

  useEffect(() => {
    loadQueue();
    const off = on('VIDEO_STATUS', (ev) => {
      setQueue((prev) => {
        const idx = prev.findIndex((item) => item.id === ev.id);
        if (idx === -1) {
          // New item from another tab / fast passthrough — refresh list
          loadQueue();
          return prev;
        }
        return prev.map((item) =>
          item.id === ev.id
            ? { ...item, status: ev.status, progress: ev.progress,
                output: ev.output || item.output, error_msg: ev.error || item.error_msg,
                duration: ev.duration ?? item.duration,
                width: ev.width ?? item.width, height: ev.height ?? item.height,
                file_size: ev.file_size ?? item.file_size,
                passthrough: ev.passthrough ?? item.passthrough }
            : item
        );
      });
    });
    return off;
  }, [on]);

  const uploadColor = uploadCustom.match(/^#[0-9a-fA-F]{6}$/) ? uploadCustom : uploadBg;

  const uploadFile = (file) => {
    if (!file) return;
    const form = new FormData();
    form.append('video', file);
    form.append('mode', uploadMode);
    if (uploadMode === 'ai') {
      form.append('bg_color',   uploadColor);
      form.append('feather',    String(uploadFeather));
      form.append('model',      uploadModel);
      form.append('holo_boost', uploadBoost ? '1' : '');
    }
    fetch(`${API}/videos/upload`, { method: 'POST', body: form })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error || 'Error subiendo');
        return body;
      })
      .then(() => {
        toast(
          uploadMode === 'passthrough' ? `Video listo: ${file.name}` : `Video en cola: ${file.name}`,
          'success',
        );
        loadQueue();
      })
      .catch((e) => toast(e.message || 'Error subiendo video', 'danger'));
  };

  const handleFileInput = (e) => {
    [...(e.target.files || [])].forEach(uploadFile);
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    [...(e.dataTransfer.files || [])].filter((f) => f.type.startsWith('video/')).forEach(uploadFile);
  };

  const deleteItem = (id) => {
    fetch(`${API}/videos/${id}`, { method: 'DELETE' })
      .then((r) => {
        if (!r.ok) return r.json().then((b) => toast(b.error || 'Error', 'danger'));
        toast('Eliminado', 'success');
        setQueue((p) => p.filter((i) => i.id !== id));
        if (selectedId === id) setSelectedId(null);
      })
      .catch(() => {});
  };

  const cancelItem = (id) => {
    fetch(`${API}/videos/cancel/${id}`, { method: 'POST' })
      .then(() => toast('Cancelado', 'warning'))
      .catch(() => toast('Error', 'danger'));
  };

  const retryItem = (id) => {
    fetch(`${API}/videos/retry/${id}`, { method: 'POST' })
      .then(() => toast('Reintentando…', 'success'))
      .catch(() => toast('Error', 'danger'));
  };

  const reprocessItem = (id, settings) => {
    fetch(`${API}/videos/reprocess/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error || 'Error');
        return body;
      })
      .then(() => { toast('Reprocesando con nuevos ajustes…', 'success'); setEdit(null); })
      .catch((e) => toast(e.message || 'Error', 'danger'));
  };

  const bulkDelete = () => {
    if (!bulkSelect.size) return;
    if (!confirm(`¿Eliminar ${bulkSelect.size} videos?`)) return;
    Promise.all([...bulkSelect].map((id) => fetch(`${API}/videos/${id}`, { method: 'DELETE' })))
      .then(() => { toast(`${bulkSelect.size} eliminados`, 'success'); setBulkSelect(new Set()); loadQueue(); })
      .catch(() => toast('Error en algunos', 'danger'));
  };

  const filtered = useMemo(() => {
    if (filter === 'all')   return queue;
    if (filter === 'queue') return queue.filter((i) => i.status === 'queued' || i.status === 'processing');
    if (filter === 'done')  return queue.filter((i) => i.status === 'done');
    if (filter === 'error') return queue.filter((i) => i.status === 'error');
    return queue;
  }, [queue, filter]);

  const selected = queue.find((i) => i.id === selectedId) || null;

  // Sync edit state when selected changes
  useEffect(() => {
    if (selected) {
      setEdit({
        bg_color:   selected.bg_color || '#000000',
        feather:    selected.feather ?? 5,
        model:      selected.model    || 'selfie',
        holo_boost: !!selected.holo_boost,
      });
    } else {
      setEdit(null);
    }
  }, [selectedId, selected?.status]);

  const counts = useMemo(() => ({
    all:   queue.length,
    queue: queue.filter((i) => i.status === 'queued' || i.status === 'processing').length,
    done:  queue.filter((i) => i.status === 'done').length,
    error: queue.filter((i) => i.status === 'error').length,
  }), [queue]);

  const toggleBulk = (id) => {
    setBulkSelect((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <>
      {selected && showCompare && <CompareModal item={selected} onClose={() => setShowCompare(false)} />}
      {selected && showAssign  && <AssignModal item={selected} onClose={() => setShowAssign(false)} onAssigned={() => toast('Video asignado', 'success')} />}

      <header className="topbar">
        <div>
          <div className="topbar__title">Procesador de video</div>
          <div className="topbar__sub">IA · YA EDITADOS · {queue.length} CLIPS</div>
        </div>
        <div className="topbar__actions">
          <Btn size="sm" onClick={() => fileRef.current?.click()}>+ Subir video</Btn>
        </div>
      </header>

      <div className="page-content" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: 0 }}>

        {/* Upload mode */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '10px 28px', borderBottom: '1px solid var(--line)',
          background: 'var(--surface)',
        }}>
          <span className="mono" style={{ fontSize: 10, color: 'var(--ink-mute)', letterSpacing: '0.12em' }}>MODO</span>
          {[
            { k: 'ai',          l: 'Procesar con IA' },
            { k: 'passthrough', l: 'Ya editado (solo guardar)' },
          ].map((m) => (
            <button
              key={m.k}
              type="button"
              onClick={() => setUploadMode(m.k)}
              style={{
                padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: `1.5px solid ${uploadMode === m.k ? 'var(--accent)' : 'var(--line)'}`,
                background: uploadMode === m.k ? 'var(--accent-soft)' : 'var(--surface-2)',
                color: uploadMode === m.k ? 'var(--ink)' : 'var(--ink-mute)',
                borderRadius: 2,
              }}
            >
              {m.l}
            </button>
          ))}
          {uploadMode === 'passthrough' && (
            <span style={{ fontSize: 12, color: 'var(--ink-mute)' }}>
              El video se usa tal cual en el proyector · sin MediaPipe
            </span>
          )}
        </div>

        {/* Dropzone bar — always visible at top */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          style={{
            borderBottom: '1px solid var(--line)',
            padding: '14px 28px', cursor: 'pointer',
            background: dragging ? 'var(--accent-soft)' : 'var(--surface-2)',
            display: 'flex', alignItems: 'center', gap: 18,
            transition: 'background 120ms',
          }}
        >
          <div style={{
            width: 38, height: 38, border: `2px ${dragging ? 'solid' : 'dashed'} ${dragging ? 'var(--accent)' : 'var(--line-strong)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <span style={{ fontSize: 22, lineHeight: 1, color: dragging ? 'var(--accent)' : 'var(--ink-mute)' }}>+</span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{dragging ? 'Soltá para subir' : 'Arrastrá videos aquí o hacé clic'}</div>
            <div className="mono" style={{ fontSize: 10, color: 'var(--ink-mute)', marginTop: 2 }}>
              {uploadMode === 'passthrough'
                ? 'MP4, MOV · MAX 500MB · se guarda listo para asignar (sin editar)'
                : `MP4, MOV · MAX 500MB · ajustes default: ${uploadColor} · feather ${uploadFeather}px · ${uploadModel}${uploadBoost ? ' · BOOST' : ''}`}
            </div>
          </div>

          {/* Upload settings inline — only for AI mode */}
          {uploadMode === 'ai' && (
            <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {BG_PRESETS.slice(0, 5).map((p) => (
                  <button
                    key={p.hex}
                    onClick={() => { setUploadBg(p.hex); setUploadCustom(''); }}
                    title={p.name}
                    style={{
                      width: 24, height: 24, background: p.hex, borderRadius: 2,
                      border: `2px solid ${uploadColor === p.hex ? 'var(--accent)' : 'var(--line)'}`,
                      cursor: 'pointer', padding: 0,
                    }}
                  />
                ))}
              </div>
              <input
                placeholder="#______"
                value={uploadCustom}
                onChange={(e) => setUploadCustom(e.target.value)}
                style={{ width: 80, height: 28, padding: '0 6px', border: '1px solid var(--line)', borderRadius: 2, background: 'var(--surface)', fontFamily: 'var(--font-mono)', fontSize: 11, outline: 'none' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ink-mute)' }}>
                feather
                <input
                  type="range" min="0" max="15" value={uploadFeather}
                  onChange={(e) => setUploadFeather(Number(e.target.value))}
                  style={{ width: 80 }}
                />
                <span className="mono" style={{ width: 22, textAlign: 'right' }}>{uploadFeather}</span>
              </div>
              <select
                value={uploadModel}
                onChange={(e) => setUploadModel(e.target.value)}
                className="select"
                style={{ height: 28, fontSize: 11 }}
              >
                {MODELS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ink-mute)' }}>
                boost <Toggle on={uploadBoost} onChange={setUploadBoost} />
              </label>
            </div>
          )}
          <input ref={fileRef} type="file" accept="video/*" multiple onChange={handleFileInput} style={{ display: 'none' }} />
        </div>

        {/* Main 2-column area */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', flex: 1, minHeight: 0 }}>

          {/* ─── LEFT: list ───────────────────────────────────────────── */}
          <section style={{ borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {/* Filter tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
              {[
                { k: 'all',   l: 'Todos' },
                { k: 'queue', l: 'En cola' },
                { k: 'done',  l: 'Listos' },
                { k: 'error', l: 'Errores' },
              ].map((t) => (
                <button
                  key={t.k}
                  onClick={() => setFilter(t.k)}
                  style={{
                    flex: 1, padding: '10px 8px', background: filter === t.k ? 'var(--surface)' : 'var(--surface-2)',
                    border: 'none', borderBottom: filter === t.k ? '2px solid var(--accent)' : '2px solid transparent',
                    cursor: 'pointer', fontSize: 12, fontWeight: 600,
                    color: filter === t.k ? 'var(--ink)' : 'var(--ink-mute)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  {t.l}
                  <span className="mono" style={{ fontSize: 10, background: 'var(--surface-3)', padding: '1px 5px', borderRadius: 10 }}>
                    {counts[t.k]}
                  </span>
                </button>
              ))}
            </div>

            {/* Bulk bar */}
            {bulkSelect.size > 0 && (
              <div className="bulk-bar" style={{ borderBottom: '1px solid var(--line)' }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{bulkSelect.size} seleccionados</span>
                <Btn variant="danger-ghost" size="sm" onClick={bulkDelete}>Eliminar</Btn>
                <div style={{ flex: 1 }} />
                <Btn variant="ghost" size="sm" onClick={() => setBulkSelect(new Set())}>Limpiar</Btn>
              </div>
            )}

            {/* List */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {filtered.length === 0 && (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-mute)', fontSize: 13 }}>
                  Sin items en esta categoría.
                </div>
              )}
              {filtered.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px',
                    borderBottom: '1px solid var(--line-soft)',
                    borderLeft: selectedId === item.id ? '3px solid var(--accent)' : '3px solid transparent',
                    background: selectedId === item.id ? 'var(--accent-soft)' : (bulkSelect.has(item.id) ? 'var(--surface-2)' : 'transparent'),
                    cursor: 'pointer',
                  }}
                >
                  <div onClick={(e) => { e.stopPropagation(); toggleBulk(item.id); }}>
                    <Checkbox checked={bulkSelect.has(item.id)} onChange={() => toggleBulk(item.id)} />
                  </div>
                  {item.status === 'done'
                    ? <VideoThumb src={`/videos/${item.output}`} />
                    : (
                      <div style={{
                        width: 72, height: 44, background: 'var(--surface-3)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: statusColor(item.status), fontWeight: 900, fontSize: 14,
                        borderRadius: 2, flexShrink: 0,
                        animation: item.status === 'processing' ? 'spin 1.2s linear infinite' : 'none',
                      }}>{statusIcon(item.status)}</div>
                    )
                  }
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.original}
                    </div>
                    <div className="mono" style={{ fontSize: 10, color: 'var(--ink-mute)', display: 'flex', gap: 8, marginTop: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                      {!!item.passthrough && (
                        <span style={{
                          color: 'var(--accent)', border: '1px solid var(--accent)',
                          padding: '0 5px', borderRadius: 2, letterSpacing: '0.06em',
                        }}>SIN IA</span>
                      )}
                      {item.status === 'done' && (
                        <>
                          <span>{fmtDuration(item.duration)}</span>
                          {item.width > 0 && <span>{item.width}×{item.height}</span>}
                          <span>{fmtBytes(item.file_size)}</span>
                        </>
                      )}
                      {item.status === 'processing' && <span>procesando · {item.progress}%</span>}
                      {item.status === 'queued'     && <span style={{ color: 'var(--ink-mute)' }}>en cola</span>}
                      {item.status === 'error'      && <span style={{ color: 'var(--danger-500)' }}>{item.error_msg || 'error'}</span>}
                    </div>
                    {item.status === 'processing' && <ProgressBar value={item.progress} />}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ─── RIGHT: detail panel ───────────────────────────────────── */}
          <section style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
            {!selected && (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-mute)', fontSize: 14, padding: 40, textAlign: 'center' }}>
                Seleccioná un video de la lista para ver detalles, previsualizarlo o ajustar settings.
              </div>
            )}

            {selected && (
              <>
                {/* Header */}
                <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
                  <div className="mono" style={{ fontSize: 10, color: 'var(--ink-mute)', letterSpacing: '0.12em', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span>{selected.status === 'done' ? 'LISTO' : selected.status.toUpperCase()}</span>
                    {!!selected.passthrough && (
                      <span style={{ color: 'var(--accent)', letterSpacing: '0.08em' }}>· SIN IA</span>
                    )}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 18, marginTop: 4 }}>{selected.original}</div>
                  <div className="mono" style={{ fontSize: 10, color: 'var(--ink-mute)', marginTop: 4 }}>
                    {selected.status === 'done' && (
                      <>
                        {fmtDuration(selected.duration)}
                        {selected.width > 0 ? ` · ${selected.width}×${selected.height}` : ''}
                        {' · '}{fmtBytes(selected.file_size)}
                        {selected.passthrough ? ' · subido sin procesar' : ''}
                      </>
                    )}
                  </div>
                </div>

                {/* Preview */}
                <div style={{ padding: '18px 24px', flexShrink: 0 }}>
                  {selected.status === 'done' && selected.output ? (
                    <video
                      src={`/videos/${selected.output}`}
                      controls
                      style={{ width: '100%', maxHeight: 320, background: '#000', display: 'block' }}
                    />
                  ) : selected.status === 'processing' ? (
                    <div style={{ padding: 30, textAlign: 'center', background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
                      <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--accent)' }}>{selected.progress}%</div>
                      <ProgressBar value={selected.progress} />
                      <div style={{ fontSize: 11, color: 'var(--ink-mute)', marginTop: 8 }}>procesando frame por frame…</div>
                    </div>
                  ) : selected.status === 'error' ? (
                    <div style={{ padding: 20, background: 'var(--surface-2)', border: '1px solid var(--danger-500)', borderRadius: 2 }}>
                      <div style={{ fontWeight: 700, color: 'var(--danger-500)', fontSize: 13 }}>Error de procesamiento</div>
                      <div className="mono" style={{ fontSize: 11, color: 'var(--ink-mute)', marginTop: 6 }}>{selected.error_msg}</div>
                    </div>
                  ) : (
                    <div style={{ padding: 20, textAlign: 'center', background: 'var(--surface-2)', color: 'var(--ink-mute)', fontSize: 13 }}>
                      Esperando en cola…
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ padding: '0 24px 18px', display: 'flex', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
                  {selected.status === 'done' && (
                    <>
                      <Btn size="sm" onClick={() => setShowAssign(true)}>Asignar a invitado</Btn>
                      {!selected.passthrough && (
                        <Btn variant="ghost" size="sm" onClick={() => setShowCompare(true)}>Comparar antes/después</Btn>
                      )}
                      <a href={`/videos/${selected.output}`} download style={{ textDecoration: 'none' }}>
                        <Btn variant="ghost" size="sm">↓ Descargar</Btn>
                      </a>
                    </>
                  )}
                  {selected.status === 'processing' && (
                    <Btn variant="danger-ghost" size="sm" onClick={() => cancelItem(selected.id)}>Cancelar</Btn>
                  )}
                  {selected.status === 'error' && !selected.passthrough && (
                    <Btn size="sm" onClick={() => retryItem(selected.id)}>Reintentar</Btn>
                  )}
                  <Btn variant="danger-ghost" size="sm" onClick={() => deleteItem(selected.id)}>Eliminar</Btn>
                </div>

                {/* Passthrough note */}
                {selected.passthrough && selected.status === 'done' && (
                  <div style={{
                    margin: '0 24px 18px', padding: '12px 14px',
                    background: 'var(--accent-soft)', border: '1px solid var(--accent)',
                    borderRadius: 2, fontSize: 12, color: 'var(--ink)',
                  }}>
                    Video subido <strong>sin procesar</strong>. Ya está en la librería del proyector; podés asignarlo a un invitado o usarlo como idle.
                  </div>
                )}

                {/* Settings panel — edit + reprocess (AI uploads only) */}
                {edit && selected.status !== 'processing' && !selected.passthrough && (
                  <div style={{ borderTop: '1px solid var(--line)', padding: '18px 24px', overflow: 'auto', flex: 1 }}>
                    <div className="mono" style={{ fontSize: 10, color: 'var(--ink-mute)', letterSpacing: '0.12em', marginBottom: 14 }}>
                      AJUSTES DE PROCESAMIENTO
                    </div>

                    {/* BG color */}
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Color de fondo</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {BG_PRESETS.map((p) => (
                          <button
                            key={p.hex}
                            onClick={() => setEdit({ ...edit, bg_color: p.hex })}
                            title={p.name}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px 4px 4px',
                              border: `1.5px solid ${edit.bg_color === p.hex ? 'var(--accent)' : 'var(--line)'}`,
                              background: edit.bg_color === p.hex ? 'var(--accent-soft)' : 'var(--surface)',
                              cursor: 'pointer', borderRadius: 2, fontSize: 11,
                            }}
                          >
                            <span style={{ width: 16, height: 16, background: p.hex, border: '1px solid #333' }} />
                            {p.name}
                          </button>
                        ))}
                      </div>
                      <input
                        placeholder="o pega un hex #______"
                        value={edit.bg_color}
                        onChange={(e) => setEdit({ ...edit, bg_color: e.target.value })}
                        style={{ width: 140, height: 28, marginTop: 8, padding: '0 8px', border: '1px solid var(--line)', borderRadius: 2, background: 'var(--surface)', fontFamily: 'var(--font-mono)', fontSize: 11, outline: 'none' }}
                      />
                    </div>

                    {/* Feather */}
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                        <span>Suavizado de borde (feather)</span>
                        <span className="mono" style={{ color: 'var(--ink-mute)' }}>{edit.feather} px</span>
                      </div>
                      <input
                        type="range" min="0" max="15" value={edit.feather}
                        onChange={(e) => setEdit({ ...edit, feather: Number(e.target.value) })}
                        style={{ width: '100%' }}
                      />
                      <div className="mono" style={{ fontSize: 10, color: 'var(--ink-mute)', marginTop: 4 }}>
                        0 = borde duro · 5 = balanceado · 15 = muy suave (puede sangrar)
                      </div>
                    </div>

                    {/* Model */}
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Modelo</div>
                      <select
                        value={edit.model}
                        onChange={(e) => setEdit({ ...edit, model: e.target.value })}
                        className="select"
                        style={{ width: '100%' }}
                      >
                        {MODELS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                      </select>
                    </div>

                    {/* Holo boost */}
                    <div style={{ marginBottom: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>Holo boost</div>
                        <div className="mono" style={{ fontSize: 10, color: 'var(--ink-mute)', marginTop: 2 }}>
                          +contraste y +brillo para la pirámide
                        </div>
                      </div>
                      <Toggle on={edit.holo_boost} onChange={(v) => setEdit({ ...edit, holo_boost: v })} />
                    </div>

                    <Btn variant="primary" size="sm" onClick={() => reprocessItem(selected.id, edit)}>
                      ↻ Reprocesar con estos ajustes
                    </Btn>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
