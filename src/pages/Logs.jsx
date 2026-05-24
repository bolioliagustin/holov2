import { useState, useEffect } from 'react';
import { Chip, Btn } from '../components/ui/index';
import { useWS } from '../context/WSContext';
import { useToast } from '../components/ui/Toasts';

const API = '/api';

export default function Logs() {
  const toast = useToast();
  const { on } = useWS();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const load = (p = 1) => {
    fetch(`${API}/logs?page=${p}&limit=100`)
      .then((r) => r.json())
      .then((d) => { setRows(d.rows || []); setTotal(d.total || 0); setPage(p); })
      .catch(() => {});
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const off = on('TAG_READ', () => { if (page === 1) load(1); });
    return off;
  }, [on, page]);

  const clearLogs = () => {
    if (!confirm('¿Borrar todos los logs de ingreso?')) return;
    fetch(`${API}/logs/clear`, { method: 'DELETE' })
      .then(() => { toast('Logs eliminados', 'success'); load(1); })
      .catch(() => toast('Error', 'danger'));
  };

  const typeStyle = (type) => {
    if (type === 'IN')      return { color: 'var(--success-500)', label: 'TAG_READ' };
    if (type === 'RESCAN')  return { color: 'var(--warning-500)', label: 'RESCAN' };
    if (type === 'UNKNOWN') return { color: 'var(--danger-500)',  label: 'UNKNOWN' };
    return { color: 'var(--ink-mute)', label: type };
  };

  return (
    <>
      <header className="topbar">
        <div>
          <div className="topbar__title">Logs de ingreso</div>
          <div className="topbar__sub">HISTORIAL · {total} EVENTOS</div>
        </div>
        <div className="topbar__actions">
          <Btn variant="danger-ghost" size="sm" onClick={clearLogs}>Limpiar logs</Btn>
        </div>
      </header>

      <div className="page-content">
        <div style={{ padding: '16px 28px', fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.7 }}>
          {rows.map((r, i) => {
            const { color, label } = typeStyle(r.type);
            const ts = r.ts ? r.ts.replace('T', ' ').replace(/\.\d{3}$/, '') : '—';
            return (
              <div key={r.id} style={{ display: 'flex', gap: 12, padding: '3px 0', borderBottom: '1px solid var(--line-soft)' }}>
                <span style={{ color: 'var(--ink-faint)', width: 170, flexShrink: 0 }}>[{ts}]</span>
                <span style={{ color, fontWeight: 600, width: 90, flexShrink: 0 }}>{label}</span>
                <span style={{ color: 'var(--ink-mute)', width: 100, flexShrink: 0 }}>uid={r.uid}</span>
                <span style={{ color: 'var(--ink-2)', flex: 1 }}>{r.guest_name || 'desconocido'}</span>
              </div>
            );
          })}
          {rows.length === 0 && (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--ink-mute)' }}>
              Sin eventos registrados aún.
            </div>
          )}
        </div>

        {total > 100 && (
          <div style={{ padding: '12px 28px', borderTop: '1px solid var(--line)', display: 'flex', gap: 12, alignItems: 'center' }}>
            <span className="mono" style={{ fontSize: 11, color: 'var(--ink-mute)' }}>
              Mostrando {rows.length} de {total}
            </span>
            <div style={{ flex: 1 }} />
            <Btn variant="ghost" size="sm" disabled={page <= 1} onClick={() => load(page - 1)}>‹</Btn>
            <span className="mono" style={{ fontSize: 12 }}>{page}</span>
            <Btn size="sm" onClick={() => load(page + 1)}>›</Btn>
          </div>
        )}
      </div>
    </>
  );
}
