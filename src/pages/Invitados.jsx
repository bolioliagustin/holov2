import { useState, useEffect, useCallback } from 'react';
import { Chip, Btn, Field, Select, Checkbox, Avatar, StatusChip } from '../components/ui/index';
import VideoSelector from '../components/ui/VideoSelector';
import { useToast } from '../components/ui/Toasts';

const API = '/api';
const LIMITS = [25, 50, 100];

function parseCSV(text) {
  const lines = text.split('\n').filter((l) => l.trim());
  if (!lines.length) return [];
  const header = lines[0].toLowerCase().split(',').map((h) => h.trim().replace(/"/g, ''));
  return lines.slice(1).map((line) => {
    const cols = line.split(',').map((c) => c.trim().replace(/"/g, ''));
    const obj = {};
    header.forEach((h, i) => { obj[h] = cols[i] || ''; });
    return {
      name:      obj.nombre || obj.name || '',
      email:     obj.email  || obj.correo || '',
      table_num: obj.mesa   || obj.table  || obj.table_num || '',
      uid:       obj.uid    || '',
      video:     obj.video  || '',
      message:   obj.mensaje || obj.message || '',
    };
  }).filter((r) => r.name);
}

function VideoModal({ guest, onSave, onClose }) {
  const [video, setVideo] = useState(guest.video || '');

  const save = () => {
    onSave(guest, video);
    onClose();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface)', border: '1px solid var(--line)',
          boxShadow: 'var(--shadow-3)', borderRadius: 'var(--radius-sm)',
          width: 420, padding: 24,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Asignar video</div>
        <div style={{ fontSize: 12, color: 'var(--ink-mute)', marginBottom: 20 }}>
          {guest.name}
        </div>

        <div style={{ marginBottom: 20 }}>
          <VideoSelector value={video} onChange={setVideo} />
        </div>

        {video && (
          <div style={{ marginBottom: 16 }}>
            <video
              src={`/videos/${video}`}
              controls
              style={{ width: '100%', background: '#000', borderRadius: 2, display: 'block' }}
            />
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Btn variant="ghost" size="sm" onClick={onClose}>Cancelar</Btn>
          <Btn variant="primary" size="sm" onClick={save}>Guardar</Btn>
        </div>
      </div>
    </div>
  );
}

export default function Invitados() {
  const toast = useToast();
  const [data, setData]         = useState({ total: 0, rows: [], page: 1, limit: 50 });
  const [search, setSearch]     = useState('');
  const [status, setStatus]     = useState('');
  const [selected, setSelected] = useState(new Set());
  const [showAdd, setShowAdd]   = useState(false);
  const [addForm, setAddForm]   = useState({ name: '', email: '', table_num: '', uid: '', video: '', message: '' });
  const [videoModal, setVideoModal] = useState(null); // guest object or null

  const load = useCallback((page = 1, limit = data.limit) => {
    const params = new URLSearchParams({ page, limit });
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    fetch(`${API}/guests?${params}`)
      .then((r) => r.json())
      .then((d) => { setData({ ...d, page, limit }); setSelected(new Set()); })
      .catch(() => toast('Error cargando invitados', 'danger'));
  }, [search, status, data.limit]);

  useEffect(() => { load(1); }, [search, status]);

  const handleCSV = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rows = parseCSV(ev.target.result);
      if (!rows.length) { toast('CSV sin filas válidas', 'warning'); return; }
      fetch(`${API}/guests/import-csv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
        .then((r) => r.json())
        .then((d) => { toast(`${d.imported} invitados importados`, 'success'); load(1); })
        .catch(() => toast('Error importando CSV', 'danger'));
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const addGuest = () => {
    if (!addForm.name.trim()) { toast('El nombre es requerido', 'warning'); return; }
    fetch(`${API}/guests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(addForm),
    })
      .then(() => {
        toast('Invitado agregado', 'success');
        setShowAdd(false);
        setAddForm({ name: '', email: '', table_num: '', uid: '', video: '', message: '' });
        load(1);
      })
      .catch(() => toast('Error agregando invitado', 'danger'));
  };

  const updateVideo = (guest, video) => {
    fetch(`${API}/guests/${guest.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...guest, video }),
    })
      .then(() => {
        toast('Video asignado', 'success');
        setData((prev) => ({ ...prev, rows: prev.rows.map((r) => r.id === guest.id ? { ...r, video } : r) }));
      })
      .catch(() => toast('Error guardando video', 'danger'));
  };

  const resetOne = (id) => {
    fetch(`${API}/guests/${id}/reset`, { method: 'POST' })
      .then(() => { toast('Check-in reseteado', 'success'); load(data.page); })
      .catch(() => toast('Error', 'danger'));
  };

  const deleteOne = (id) => {
    if (!confirm('¿Eliminar este invitado?')) return;
    fetch(`${API}/guests/${id}`, { method: 'DELETE' })
      .then(() => { toast('Invitado eliminado', 'success'); load(data.page); })
      .catch(() => toast('Error', 'danger'));
  };

  const resetAll = () => {
    if (!confirm('¿Resetear el check-in de TODOS los invitados?')) return;
    fetch(`${API}/guests/reset-all`, { method: 'POST' })
      .then(() => { toast('Reset masivo completado', 'success'); load(data.page); })
      .catch(() => toast('Error', 'danger'));
  };

  const bulkReset = () => {
    Promise.all([...selected].map((id) => fetch(`${API}/guests/${id}/reset`, { method: 'POST' })))
      .then(() => { toast(`${selected.size} check-ins reseteados`, 'success'); load(data.page); })
      .catch(() => toast('Error', 'danger'));
  };

  const bulkDelete = () => {
    if (!confirm(`¿Eliminar ${selected.size} invitados?`)) return;
    Promise.all([...selected].map((id) => fetch(`${API}/guests/${id}`, { method: 'DELETE' })))
      .then(() => { toast(`${selected.size} eliminados`, 'success'); load(data.page); })
      .catch(() => toast('Error', 'danger'));
  };

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const allSelected = data.rows.length > 0 && data.rows.every((r) => selected.has(r.id));
  const toggleAll   = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(data.rows.map((r) => r.id)));
  };

  const totalPages = Math.max(1, Math.ceil(data.total / data.limit));

  return (
    <>
      {videoModal && (
        <VideoModal
          guest={videoModal}
          onSave={updateVideo}
          onClose={() => setVideoModal(null)}
        />
      )}

      <header className="topbar">
        <div>
          <div className="topbar__title">Invitados</div>
          <div className="topbar__sub">GESTIÓN · {data.total} EN LISTA</div>
        </div>
        <div className="topbar__actions">
          <Btn variant="ghost" size="sm" onClick={resetAll}>Reset masivo</Btn>
          <Btn size="sm" onClick={() => setShowAdd(true)}>+ Invitado</Btn>
          <label>
            <Btn variant="primary" size="sm" onClick={() => {}}>Importar CSV ↑</Btn>
            <input type="file" accept=".csv,.txt" onChange={handleCSV} style={{ display: 'none' }} />
          </label>
        </div>
      </header>

      {/* Add guest form */}
      {showAdd && (
        <div style={{ padding: '14px 28px', borderBottom: '1px solid var(--line)', background: 'var(--accent-soft)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Field placeholder="Nombre *" value={addForm.name}      onChange={(v) => setAddForm((p) => ({ ...p, name: v }))} />
          <Field placeholder="Email"    value={addForm.email}     onChange={(v) => setAddForm((p) => ({ ...p, email: v }))} />
          <Field placeholder="Mesa"     value={addForm.table_num} onChange={(v) => setAddForm((p) => ({ ...p, table_num: v }))} />
          <Field placeholder="UID NFC"  value={addForm.uid}       onChange={(v) => setAddForm((p) => ({ ...p, uid: v }))} mono />
          <VideoSelector value={addForm.video} onChange={(v) => setAddForm((p) => ({ ...p, video: v }))} />
          <Field placeholder="Mensaje"  value={addForm.message}   onChange={(v) => setAddForm((p) => ({ ...p, message: v }))} />
          <Btn variant="primary" size="sm" onClick={addGuest}>Guardar</Btn>
          <Btn variant="ghost" size="sm" onClick={() => setShowAdd(false)}>Cancelar</Btn>
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 28px', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
        <Field placeholder="⌕  Buscar por nombre, mesa o UID…" value={search} onChange={setSearch} style={{ flex: 1, maxWidth: 360 }} />
        <Select value={status} onChange={setStatus} options={[
          { value: '', label: 'Estado: todos' },
          { value: 'in',   label: 'Ya ingresó' },
          { value: 'pend', label: 'Pendiente' },
        ]} />
        <Select value={String(data.limit)} onChange={(v) => { load(1, Number(v)); }} options={LIMITS.map((l) => ({ value: String(l), label: `${l} por página` }))} />
        <div style={{ flex: 1 }} />
        <span className="mono" style={{ fontSize: 11, color: 'var(--ink-mute)' }}>{data.total} RESULTADOS</span>
      </div>

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div className="bulk-bar">
          <Checkbox checked indeterminate onChange={toggleAll} />
          <span style={{ fontWeight: 600, fontSize: 13 }}>{selected.size} seleccionados</span>
          <span style={{ color: 'var(--ink-mute)' }}>·</span>
          <Btn variant="ghost" size="sm" onClick={bulkReset}>Reset check-in</Btn>
          <Btn variant="danger-ghost" size="sm" onClick={bulkDelete}>Eliminar</Btn>
          <div style={{ flex: 1 }} />
          <Btn variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Limpiar selección</Btn>
        </div>
      )}

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '44px 1.6fr 70px 1.1fr 1.2fr 1fr 130px 60px', background: 'var(--surface-2)', borderBottom: '1px solid var(--line)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-mute)' }}>
          <div style={{ padding: '8px 0 8px 28px' }}>
            <Checkbox checked={allSelected} onChange={toggleAll} />
          </div>
          {['Invitado', 'Mesa', 'UID', 'Video', 'Mensaje', 'Estado', ''].map((h) => (
            <div key={h} style={{ padding: '8px 12px' }}>{h}</div>
          ))}
        </div>

        {data.rows.map((g) => (
          <div
            key={g.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '44px 1.6fr 70px 1.1fr 1.2fr 1fr 130px 60px',
              borderBottom: '1px solid var(--line-soft)',
              background: selected.has(g.id) ? 'var(--accent-soft)' : 'transparent',
              borderLeft: selected.has(g.id) ? '3px solid var(--accent)' : '3px solid transparent',
            }}
          >
            <div style={{ padding: '10px 0 10px 28px', display: 'flex', alignItems: 'center' }}>
              <Checkbox checked={selected.has(g.id)} onChange={() => toggleSelect(g.id)} />
            </div>
            <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar initials={(g.name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('')} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{g.name}</div>
                <div className="mono" style={{ fontSize: 10, color: 'var(--ink-mute)' }}>{g.email}</div>
              </div>
            </div>
            <div style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{g.table_num || '—'}</div>
            <div style={{ padding: '10px 12px' }}>
              {g.uid
                ? <span className="mono" style={{ fontSize: 11 }}>{g.uid}</span>
                : <Chip variant="warning" mono>SIN ASIGNAR</Chip>
              }
            </div>

            {/* Video cell — click to open modal */}
            <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center' }}>
              <button
                onClick={() => setVideoModal(g)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'none', border: '1px solid var(--line)',
                  borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                  padding: '4px 8px', maxWidth: '100%',
                  color: g.video ? 'var(--ink)' : 'var(--ink-faint)',
                  fontSize: 11,
                }}
              >
                <span style={{ width: 20, height: 13, background: g.video ? '#000' : 'var(--surface-3)', borderRadius: 1, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {g.video && <svg width="7" height="7" viewBox="0 0 10 10" fill="none"><polygon points="2,1 9,5 2,9" fill="white" opacity="0.8"/></svg>}
                </span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)' }}>
                  {g.video ? g.video.replace(/^processed_\d+_/, '') : 'Asignar…'}
                </span>
              </button>
            </div>

            <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--ink-2)' }}>{g.message || <span style={{ color: 'var(--ink-faint)' }}>—</span>}</div>
            <div style={{ padding: '10px 12px' }}>
              <StatusChip status={g.checked_in ? 'in' : 'pend'} />
            </div>
            <div style={{ padding: '10px 12px', display: 'flex', gap: 4 }}>
              <button title="Reset" onClick={() => resetOne(g.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-faint)', fontSize: 14 }}>↺</button>
              <button title="Eliminar" onClick={() => deleteOne(g.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-faint)', fontSize: 14 }}>✕</button>
            </div>
          </div>
        ))}

        {data.rows.length === 0 && (
          <div style={{ padding: '60px 28px', textAlign: 'center', color: 'var(--ink-mute)' }}>
            <div style={{ fontWeight: 700, fontSize: 18 }}>Sin invitados</div>
            <p style={{ marginTop: 8, fontSize: 13 }}>Importa un CSV o agrega invitados uno por uno.</p>
          </div>
        )}
      </div>

      {/* Pagination */}
      <div style={{ borderTop: '1px solid var(--line)', padding: '10px 28px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <span className="mono" style={{ fontSize: 11, color: 'var(--ink-mute)' }}>
          {data.rows.length > 0 ? `MOSTRANDO ${(data.page - 1) * data.limit + 1}–${Math.min(data.page * data.limit, data.total)} DE ${data.total}` : 'SIN RESULTADOS'}
        </span>
        <div style={{ flex: 1 }} />
        <Btn variant="ghost" size="sm" disabled={data.page <= 1} onClick={() => load(data.page - 1)}>‹ Anterior</Btn>
        <span className="mono" style={{ fontSize: 12 }}>{data.page} / {totalPages}</span>
        <Btn size="sm" disabled={data.page >= totalPages} onClick={() => load(data.page + 1)}>Siguiente ›</Btn>
      </div>
    </>
  );
}
