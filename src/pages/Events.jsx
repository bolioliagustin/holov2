import { useState, useEffect } from 'react';
import { Chip, Btn, Field } from '../components/ui/index';
import { useWS } from '../context/WSContext';
import { useToast } from '../components/ui/Toasts';

const API = '/api';

function statusChip(status) {
  if (status === 'active')   return <Chip variant="success" dot>EN VIVO</Chip>;
  if (status === 'archived') return <Chip variant="default">archivado</Chip>;
  return <Chip variant="warning" dot>borrador</Chip>;
}

export default function Events() {
  const toast = useToast();
  const { on } = useWS();
  const [data, setData]     = useState({ rows: [], currentId: null });
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm]     = useState({ name: '', venue: '', date: '', capacity: '', notes: '' });

  const load = () => {
    fetch(`${API}/events`).then((r) => r.json()).then(setData).catch(() => {});
  };

  useEffect(() => {
    load();
    const off1 = on('EVENTS_CHANGED', load);
    const off2 = on('CURRENT_EVENT_CHANGED', load);
    return () => { off1(); off2(); };
  }, [on]);

  const create = () => {
    if (!form.name.trim()) { toast('Nombre requerido', 'warning'); return; }
    fetch(`${API}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
      .then((r) => r.json())
      .then(() => {
        toast('Evento creado', 'success');
        setShowAdd(false);
        setForm({ name: '', venue: '', date: '', capacity: '', notes: '' });
        load();
      })
      .catch(() => toast('Error', 'danger'));
  };

  const activate = (id, name) => {
    if (!confirm(`Activar "${name}"? El evento actualmente activo (si lo hay) volverá a borrador.`)) return;
    fetch(`${API}/events/${id}/activate`, { method: 'POST' })
      .then((r) => r.json())
      .then(() => { toast(`Evento "${name}" activado`, 'success'); load(); })
      .catch(() => toast('Error', 'danger'));
  };

  const select = (id) => {
    fetch(`${API}/events/${id}/select`, { method: 'POST' })
      .then(() => { toast('Cambiado al evento', 'success'); load(); })
      .catch(() => toast('Error', 'danger'));
  };

  const archive = (id, name) => {
    if (!confirm(`¿Archivar "${name}"?\n\nSe va a guardar un snapshot completo en data/archives/event-${id}/ y el evento queda en modo solo-lectura. Esto es permanente.`)) return;
    fetch(`${API}/events/${id}/archive`, { method: 'POST' })
      .then(async (r) => {
        if (!r.ok) { const b = await r.json().catch(() => ({})); toast(b.error || 'Error', 'danger'); return; }
        const j = await r.json();
        toast(`Archivado en ${j.path}`, 'success');
        load();
      })
      .catch(() => toast('Error', 'danger'));
  };

  const remove = (id, name) => {
    if (!confirm(`¿Eliminar definitivamente "${name}"? Esta acción borra todos los invitados, check-ins y videos del evento. No se puede deshacer.`)) return;
    fetch(`${API}/events/${id}`, { method: 'DELETE' })
      .then(async (r) => {
        if (!r.ok) { const b = await r.json().catch(() => ({})); toast(b.error || 'Error', 'danger'); return; }
        toast('Eliminado', 'success'); load();
      })
      .catch(() => toast('Error', 'danger'));
  };

  return (
    <>
      <header className="topbar">
        <div>
          <div className="topbar__title">Eventos</div>
          <div className="topbar__sub">{data.rows.length} TOTAL · 1 ACTIVO POR VEZ</div>
        </div>
        <div className="topbar__actions">
          <Btn variant="primary" size="sm" onClick={() => setShowAdd(true)}>+ Nuevo evento</Btn>
        </div>
      </header>

      {showAdd && (
        <div style={{ padding: '14px 28px', borderBottom: '1px solid var(--line)', background: 'var(--accent-soft)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Field placeholder="Nombre del evento *" value={form.name}     onChange={(v) => setForm((p) => ({ ...p, name: v }))} />
          <Field placeholder="Sede / Salón"        value={form.venue}    onChange={(v) => setForm((p) => ({ ...p, venue: v }))} />
          <Field placeholder="Fecha"               value={form.date}     onChange={(v) => setForm((p) => ({ ...p, date: v }))} />
          <Field placeholder="Capacidad"           value={form.capacity} onChange={(v) => setForm((p) => ({ ...p, capacity: v }))} />
          <Field placeholder="Notas"               value={form.notes}    onChange={(v) => setForm((p) => ({ ...p, notes: v }))} />
          <Btn variant="primary" size="sm" onClick={create}>Crear</Btn>
          <Btn variant="ghost"   size="sm" onClick={() => setShowAdd(false)}>Cancelar</Btn>
        </div>
      )}

      <div className="page-content" style={{ overflow: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 14, padding: 24 }}>
          {data.rows.map((e) => {
            const isCurrent = e.id === data.currentId;
            const checkinPct = e.guests_count > 0 ? Math.round((e.checked_in_count / e.guests_count) * 100) : 0;
            return (
              <div
                key={e.id}
                style={{
                  border: `1.5px solid ${isCurrent ? 'var(--accent)' : 'var(--line)'}`,
                  background: isCurrent ? 'var(--accent-soft)' : 'var(--surface)',
                  borderRadius: 'var(--radius-sm)',
                  padding: 16,
                  display: 'flex', flexDirection: 'column', gap: 12,
                  opacity: e.status === 'archived' ? 0.7 : 1,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{e.name}</div>
                    <div className="mono" style={{ fontSize: 10, color: 'var(--ink-mute)' }}>
                      #{e.id} {e.venue && `· ${e.venue}`} {e.date && `· ${e.date}`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    {statusChip(e.status)}
                    {isCurrent && <Chip variant="accent" mono>VIEWING</Chip>}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, padding: '10px 0', borderTop: '1px solid var(--line-soft)', borderBottom: '1px solid var(--line-soft)' }}>
                  <Stat label="Invitados" value={e.guests_count} />
                  <Stat label="Check-ins" value={`${e.checked_in_count}/${e.guests_count}`} sub={`${checkinPct}%`} />
                  <Stat label="Videos"    value={e.videos_count} />
                </div>

                {e.notes && <div style={{ fontSize: 12, color: 'var(--ink-2)', fontStyle: 'italic' }}>«{e.notes}»</div>}
                {e.archived_at && (
                  <div className="mono" style={{ fontSize: 10, color: 'var(--ink-mute)' }}>
                    archivado: {new Date(e.archived_at).toLocaleString('es')}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {!isCurrent && (
                    <Btn variant="ghost" size="sm" onClick={() => select(e.id)}>Ver datos</Btn>
                  )}
                  {e.status !== 'active' && e.status !== 'archived' && (
                    <Btn variant="primary" size="sm" onClick={() => activate(e.id, e.name)}>Activar</Btn>
                  )}
                  {e.status !== 'archived' && (
                    <Btn variant="ghost" size="sm" onClick={() => archive(e.id, e.name)}>Archivar</Btn>
                  )}
                  <a href={`${API}/events/${e.id}/export/guests.csv`} download style={{ textDecoration: 'none' }}>
                    <Btn variant="ghost" size="sm">↓ Invitados CSV</Btn>
                  </a>
                  <a href={`${API}/events/${e.id}/export/checkins.csv`} download style={{ textDecoration: 'none' }}>
                    <Btn variant="ghost" size="sm">↓ Check-ins CSV</Btn>
                  </a>
                  {e.id !== 1 && e.status !== 'active' && (
                    <Btn variant="danger-ghost" size="sm" onClick={() => remove(e.id, e.name)}>Eliminar</Btn>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div>
      <div className="mono" style={{ fontSize: 9, color: 'var(--ink-mute)', letterSpacing: '0.12em' }}>{label.toUpperCase()}</div>
      <div style={{ fontWeight: 700, fontSize: 16, marginTop: 2 }}>{value}</div>
      {sub && <div className="mono" style={{ fontSize: 9, color: 'var(--ink-mute)' }}>{sub}</div>}
    </div>
  );
}
