import { useState, useEffect, useCallback, useRef } from 'react';
import { Chip, Btn, Field, Select, Checkbox, Avatar, StatusChip } from '../components/ui/index';
import VideoSelector from '../components/ui/VideoSelector';
import { useToast } from '../components/ui/Toasts';

const API = '/api';
const LIMITS = [25, 50, 100];

function loadSheetJS() {
  return new Promise((resolve, reject) => {
    if (window.XLSX) {
      resolve(window.XLSX);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    script.onload = () => resolve(window.XLSX);
    script.onerror = () => reject(new Error('No se pudo cargar el motor de lectura de Excel. Revisa tu conexión.'));
    document.head.appendChild(script);
  });
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

function BulkVideoModal({ selectedCount, onSave, onClose }) {
  const [video, setVideo] = useState('');

  const save = () => {
    onSave(video);
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
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Asignar video de forma masiva</div>
        <div style={{ fontSize: 12, color: 'var(--ink-mute)', marginBottom: 20 }}>
          Se asignará el video seleccionado a {selectedCount} invitados.
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
          <Btn variant="primary" size="sm" onClick={save}>Asignar a todos</Btn>
        </div>
      </div>
    </div>
  );
}

function EditGuestModal({ guest, onSave, onClose }) {
  const [form, setForm] = useState({
    name: guest.name || '',
    email: guest.email || '',
    table_num: guest.table_num || '',
    uid: guest.uid || '',
    video: guest.video || '',
    message: guest.message || '',
  });

  const save = () => {
    if (!form.name.trim()) return alert('El nombre es requerido');
    onSave(guest.id, form);
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
          width: 460, padding: 24,
          maxHeight: '90vh', overflowY: 'auto'
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Editar invitado</div>
        <div style={{ fontSize: 12, color: 'var(--ink-mute)', marginBottom: 20 }}>
          Modifica los datos del invitado
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 24 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink-mute)', marginBottom: 4, textTransform: 'uppercase' }}>Nombre *</label>
            <Field value={form.name} onChange={(v) => setForm(p => ({ ...p, name: v }))} style={{ width: '100%' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink-mute)', marginBottom: 4, textTransform: 'uppercase' }}>Email</label>
            <Field value={form.email} onChange={(v) => setForm(p => ({ ...p, email: v }))} style={{ width: '100%' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink-mute)', marginBottom: 4, textTransform: 'uppercase' }}>Mesa</label>
            <Field value={form.table_num} onChange={(v) => setForm(p => ({ ...p, table_num: v }))} style={{ width: '100%' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink-mute)', marginBottom: 4, textTransform: 'uppercase' }}>UID NFC</label>
            <Field value={form.uid} onChange={(v) => setForm(p => ({ ...p, uid: v }))} mono style={{ width: '100%' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink-mute)', marginBottom: 4, textTransform: 'uppercase' }}>Video asignado</label>
            <VideoSelector value={form.video} onChange={(v) => setForm(p => ({ ...p, video: v }))} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink-mute)', marginBottom: 4, textTransform: 'uppercase' }}>Mensaje personalizado</label>
            <Field value={form.message} onChange={(v) => setForm(p => ({ ...p, message: v }))} style={{ width: '100%' }} />
          </div>
        </div>

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
  const fileInputRef = useRef(null);
  const [data, setData]         = useState({ total: 0, rows: [], page: 1, limit: 50 });
  const [search, setSearch]     = useState('');
  const [status, setStatus]     = useState('');
  const [table, setTable]       = useState('');
  const [tables, setTables]     = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [showAdd, setShowAdd]   = useState(false);
  const [addForm, setAddForm]   = useState({ name: '', email: '', table_num: '', uid: '', video: '', message: '' });
  const [videoModal, setVideoModal] = useState(null); // guest object or null
  const [showBulkVideo, setShowBulkVideo] = useState(false);
  const [editModal, setEditModal] = useState(null); // guest object or null

  const loadTables = useCallback(() => {
    fetch(`${API}/guests/tables`)
      .then((r) => r.json())
      .then((t) => {
        setTables(t);
        setTable((curr) => (curr && !t.includes(curr) ? '' : curr));
      })
      .catch(() => {});
  }, []);

  const load = useCallback((page = 1, limit = data.limit) => {
    const params = new URLSearchParams({ page, limit });
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    if (table) params.set('table', table);
    fetch(`${API}/guests?${params}`)
      .then((r) => r.json())
      .then((d) => { setData({ ...d, page, limit }); setSelected(new Set()); })
      .catch(() => toast('Error cargando invitados', 'danger'));
  }, [search, status, table, data.limit]);

  useEffect(() => { load(1); }, [search, status, table]);
  useEffect(() => { loadTables(); }, [loadTables]);

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    toast('Procesando archivo...', 'info');

    try {
      const XLSX = await loadSheetJS();
      const reader = new FileReader();

      reader.onload = (ev) => {
        try {
          const data = new Uint8Array(ev.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

          if (!json.length) {
            toast('El archivo está vacío', 'warning');
            return;
          }

          // Normalizar encabezados a minúsculas
          const headers = json[0].map((h) => String(h || '').toLowerCase().trim());

          // Mapear filas
          const rows = json.slice(1).map((row) => {
            const obj = {};
            headers.forEach((h, i) => {
              if (h) obj[h] = row[i] !== undefined ? String(row[i]).trim() : '';
            });

            return {
              name:      obj.nombre || obj.name || '',
              email:     obj.email  || obj.correo || '',
              table_num: String(obj.mesa   || obj.table  || obj.table_num || ''),
              uid:       obj.uid    || '',
              video:     obj.video  || '',
              message:   obj.mensaje || obj.message || '',
            };
          }).filter((r) => r.name); // Filtrar filas vacías o sin nombre

          if (!rows.length) {
            toast('No se encontraron invitados válidos (la columna "Nombre" es requerida)', 'warning');
            return;
          }

          fetch(`${API}/guests/import-csv`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rows }),
          })
            .then((r) => r.json())
            .then((d) => {
              toast(`${d.imported} invitados importados con éxito`, 'success');
              load(1);
              loadTables();
            })
            .catch(() => toast('Error importando invitados', 'danger'));

        } catch (err) {
          toast('Error al procesar el archivo: ' + err.message, 'danger');
        }
      };

      reader.readAsArrayBuffer(file);
    } catch (err) {
      toast(err.message, 'danger');
    }

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
        loadTables();
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

  const updateGuest = (id, updatedForm) => {
    fetch(`${API}/guests/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedForm),
    })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          toast(body.error || 'Error al guardar invitado', 'danger');
          return;
        }
        toast('Invitado actualizado', 'success');
        load(data.page);
        loadTables();
      })
      .catch(() => toast('Error guardando invitado', 'danger'));
  };

  const unassignUID = (id) => {
    if (!confirm('¿Desasignar la pulsera de este invitado?')) return;
    fetch(`${API}/guests/assign-uid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, uid: '' }),
    })
      .then(() => {
        toast('Pulsera desasignada', 'success');
        load(data.page);
      })
      .catch(() => toast('Error al desasignar pulsera', 'danger'));
  };

  const resetOne = (id) => {
    fetch(`${API}/guests/${id}/reset`, { method: 'POST' })
      .then(() => { toast('Check-in reseteado', 'success'); load(data.page); })
      .catch(() => toast('Error', 'danger'));
  };

  const deleteOne = (id) => {
    if (!confirm('¿Eliminar este invitado?')) return;
    fetch(`${API}/guests/${id}`, { method: 'DELETE' })
      .then(() => { toast('Invitado eliminado', 'success'); load(data.page); loadTables(); })
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

  const bulkAssignVideo = (video) => {
    fetch(`${API}/guests/bulk-video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [...selected], video }),
    })
      .then(() => {
        toast(`Video asignado a ${selected.size} invitados`, 'success');
        load(data.page);
        setSelected(new Set());
      })
      .catch(() => toast('Error asignando videos', 'danger'));
  };

  const bulkDelete = () => {
    if (!confirm(`¿Eliminar ${selected.size} invitados?`)) return;
    Promise.all([...selected].map((id) => fetch(`${API}/guests/${id}`, { method: 'DELETE' })))
      .then(() => { toast(`${selected.size} eliminados`, 'success'); load(data.page); loadTables(); })
      .catch(() => toast('Error', 'danger'));
  };

  const bulkUnassignUID = () => {
    if (!confirm(`¿Desasignar las pulseras de los ${selected.size} invitados seleccionados?`)) return;
    Promise.all([...selected].map((id) =>
      fetch(`${API}/guests/assign-uid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, uid: '' }),
      })
    ))
      .then(() => {
        toast(`${selected.size} pulseras desasignadas`, 'success');
        load(data.page);
        setSelected(new Set());
      })
      .catch(() => toast('Error desasignando pulseras', 'danger'));
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

      {showBulkVideo && (
        <BulkVideoModal
          selectedCount={selected.size}
          onSave={bulkAssignVideo}
          onClose={() => setShowBulkVideo(false)}
        />
      )}

      {editModal && (
        <EditGuestModal
          guest={editModal}
          onSave={updateGuest}
          onClose={() => setEditModal(null)}
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
          <div style={{ display: 'inline-block' }}>
            <Btn variant="primary" size="sm" onClick={() => fileInputRef.current.click()}>Importar Excel/CSV ↑</Btn>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleImport}
              style={{ display: 'none' }}
            />
          </div>
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
        <Select value={table} onChange={setTable} options={[
          { value: '', label: 'Mesa: todas' },
          ...tables.map((t) => {
            const label = /^[Mm]esa\b/.test(t) ? t : `Mesa ${t}`;
            return { value: t, label };
          })
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
          <Btn variant="ghost" size="sm" onClick={bulkUnassignUID}>Desasignar pulseras</Btn>
          <Btn variant="ghost" size="sm" onClick={() => setShowBulkVideo(true)}>Asignar video</Btn>
          <Btn variant="danger-ghost" size="sm" onClick={bulkDelete}>Eliminar</Btn>
          <div style={{ flex: 1 }} />
          <Btn variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Limpiar selección</Btn>
        </div>
      )}

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '44px 1.6fr 70px 1.1fr 1.2fr 1fr 100px 110px', background: 'var(--surface-2)', borderBottom: '1px solid var(--line)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-mute)' }}>
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
              gridTemplateColumns: '44px 1.6fr 70px 1.1fr 1.2fr 1fr 100px 110px',
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
              {g.uid ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="mono" style={{ fontSize: 11 }}>{g.uid}</span>
                  <button
                    title="Desasignar pulsera"
                    onClick={() => unassignUID(g.id)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--ink-faint)', fontSize: 12, padding: '2px 4px',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <Chip variant="warning" mono>SIN ASIGNAR</Chip>
              )}
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
            <div style={{ padding: '10px 4px', display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'center' }}>
              <button
                title="Editar"
                onClick={() => setEditModal(g)}
                className="table-action-btn table-action-btn--edit"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z" />
                </svg>
              </button>
              <button
                title="Reset check-in"
                onClick={() => resetOne(g.id)}
                className="table-action-btn table-action-btn--reset"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                </svg>
              </button>
              <button
                title="Eliminar"
                onClick={() => deleteOne(g.id)}
                className="table-action-btn table-action-btn--delete"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </button>
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
