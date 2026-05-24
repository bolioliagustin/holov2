import { useState, useEffect, useRef } from 'react';
import { Chip, Btn, Field } from '../components/ui/index';
import { useWS } from '../context/WSContext';
import { useToast } from '../components/ui/Toasts';

const API = '/api';

function normalizeUID(raw) {
  return String(raw || '').replace(/[:\s-]/g, '').toUpperCase();
}

export default function AssignNFC() {
  const toast = useToast();
  const { on } = useWS();
  const [queue, setQueue]     = useState([]);
  const [current, setCurrent] = useState(null);
  const [manualUID, setManualUID] = useState('');
  const [active, setActive]   = useState(false);
  const [lastAssigned, setLastAssigned] = useState(null);
  const [timer, setTimer]     = useState(0);
  const timerRef = useRef(null);

  const loadQueue = () => {
    fetch(`${API}/guests?status=pend&limit=200`)
      .then((r) => r.json())
      .then((d) => {
        const noUid = (d.rows || []).filter((g) => !g.uid);
        setQueue(noUid);
        if (noUid.length > 0) setCurrent(noUid[0]);
        else setCurrent(null);
      })
      .catch(() => {});
  };

  useEffect(() => { loadQueue(); }, []);

  useEffect(() => {
    if (!active) return;
    timerRef.current = setInterval(() => setTimer((t) => t + 1), 1000);
    return () => clearInterval(timerRef.current);
  }, [active]);

  useEffect(() => {
    const off = on('NFC_ASSIGN', (ev) => {
      if (!active || !current) return;
      assignUID(current.id, ev.uid);
    });
    return off;
  }, [on, active, current]);

  const toggleMode = () => {
    const next = !active;
    setActive(next);
    setTimer(0);
    fetch(`${API}/nfc/assign-mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: next }),
    }).catch(() => {});
    if (!next) fetch(`${API}/nfc/assign-mode`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: false }) });
  };

  const assignUID = (guestId, uid) => {
    const normalized = normalizeUID(uid);
    if (!normalized) { toast('UID inválido', 'warning'); return; }

    const guest = queue.find((g) => g.id === guestId);
    fetch(`${API}/guests/assign-uid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: guestId, uid: normalized }),
    })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          toast(body.error || 'Error asignando UID', 'danger');
          return;
        }
        setLastAssigned({ guest, uid: normalized, ts: new Date().toLocaleTimeString('es') });
        toast(`UID asignado a ${guest?.name}`, 'success');
        setManualUID('');
        setTimer(0);
        setQueue((prev) => {
          const rest = prev.filter((g) => g.id !== guestId);
          setCurrent(rest[0] || null);
          return rest;
        });
      })
      .catch(() => toast('Error asignando UID', 'danger'));
  };

  const skip = () => {
    setQueue((prev) => {
      if (prev.length <= 1) return prev;
      const [first, ...rest] = prev;
      const requeued = [...rest, first];
      setCurrent(requeued[0]);
      return requeued;
    });
    setTimer(0);
    toast('Invitado saltado', 'warning');
  };

  const undoLast = () => {
    if (!lastAssigned) return;
    fetch(`${API}/guests/assign-uid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: lastAssigned.guest.id, uid: '' }),
    }).then(() => { toast('UID borrado', 'success'); loadQueue(); setLastAssigned(null); }).catch(() => {});
  };

  const timerFmt = `${String(Math.floor(timer / 60)).padStart(2, '0')}:${String(timer % 60).padStart(2, '0')}`;
  const assigned = queue.length === 0 ? 0 : 0;

  return (
    <>
      <header className="topbar">
        <div>
          <div className="topbar__title">Asignar pulseras NFC</div>
          <div className="topbar__sub">MODO PREPARACIÓN · {active ? 'HOLOGRAMA SILENCIADO' : 'EN ESPERA'}</div>
        </div>
        <div className="topbar__actions">
          {active && <Chip variant="accent" dot>ESCANEO ACTIVO</Chip>}
          <Btn variant="ghost" size="sm" onClick={toggleMode}>{active ? 'Pausar' : 'Iniciar escaneo'}</Btn>
          <Btn size="sm" onClick={() => { if (active) toggleMode(); }}>Terminar sesión</Btn>
        </div>
      </header>

      <div className="page-content" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', flex: 1, minHeight: 0 }}>
          {/* Left: current guest + reader */}
          <section style={{ padding: '28px 36px', borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div className="mono" style={{ fontSize: 10, letterSpacing: '0.12em', color: 'var(--ink-mute)' }}>
              VINCULANDO AHORA
            </div>

            {current ? (
              <div style={{ marginTop: 12, padding: '24px 0', borderBottom: '1px solid var(--line)' }}>
                <div className="mono" style={{ fontSize: 11, color: 'var(--ink-mute)', marginBottom: 8 }}>
                  INVITADO ACTUAL {current.table_num ? `· MESA ${current.table_num}` : ''}
                </div>
                <div style={{ font: '800 52px/1 var(--font-display)', letterSpacing: '-0.025em' }}>{current.name}</div>
                <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  {current.email && <Chip>{current.email}</Chip>}
                  {current.video && <Chip>Video: <span className="mono" style={{ color: 'var(--accent)', marginLeft: 4 }}>{current.video}</span></Chip>}
                  <Chip variant="warning" dot>Sin UID</Chip>
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 24, padding: '24px 0', borderBottom: '1px solid var(--line)', color: 'var(--ink-mute)', fontSize: 15 }}>
                ✓ Todos los invitados tienen UID asignado.
              </div>
            )}

            {/* NFC reader visual */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
              <div style={{ position: 'relative', width: 200, height: 200 }}>
                <div style={{ position: 'absolute', inset: 0, border: '1.5px dashed var(--line-strong)', borderRadius: '50%' }} />
                <div style={{ position: 'absolute', inset: 24, border: '1.5px dashed var(--line-strong)', borderRadius: '50%', opacity: 0.6 }} />
                <div style={{
                  position: 'absolute', inset: 48, border: '2px solid var(--accent)', borderRadius: '50%',
                  animation: active ? 'pulse-ring 1.6s ease-in-out infinite' : 'none',
                  opacity: active ? 1 : 0.3,
                }} />
                <div style={{
                  position: 'absolute', inset: 72, background: active ? 'var(--accent)' : 'var(--surface-3)',
                  borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: active ? '#fff' : 'var(--ink-mute)',
                  transition: 'background 300ms',
                }}>
                  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <rect x="2" y="4" width="18" height="14" rx="2" />
                    <path d="M9 11h4M11 9v4" />
                  </svg>
                </div>
              </div>

              <div style={{ textAlign: 'center' }}>
                <div style={{ font: '700 20px/1 var(--font-display)' }}>
                  {active ? 'Acerca la pulsera al lector' : 'Escaneo pausado'}
                </div>
                <div className="mono" style={{ fontSize: 11, color: 'var(--ink-mute)', marginTop: 6, letterSpacing: '0.08em' }}>
                  ACR122U · {active ? `ESPERANDO TAG · ${timerFmt}` : 'EN ESPERA'}
                </div>
              </div>
            </div>

            {/* Manual entry */}
            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 18 }}>
              <div className="mono" style={{ fontSize: 10, letterSpacing: '0.12em', color: 'var(--ink-mute)', marginBottom: 8 }}>
                O INGRESA EL UID MANUALMENTE
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Field
                  placeholder="27:23:0B:6F  ó  27230B6F"
                  value={manualUID}
                  onChange={setManualUID}
                  mono
                  onKeyDown={(e) => { if (e.key === 'Enter' && current) assignUID(current.id, manualUID); }}
                />
                <Btn variant="ghost" size="lg" onClick={skip} disabled={!current}>Saltar</Btn>
                <Btn variant="primary" size="lg" disabled={!manualUID || !current} onClick={() => assignUID(current.id, manualUID)}>
                  Asignar
                </Btn>
              </div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--ink-mute)', marginTop: 6 }}>
                » Se normaliza automáticamente:{' '}
                <span style={{ color: 'var(--ink)' }}>{manualUID ? normalizeUID(manualUID) : '27:23:0B:6F → 27230B6F'}</span>
              </div>
            </div>
          </section>

          {/* Right: queue */}
          <aside style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ padding: '20px 28px 14px', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Cola pendiente</div>
                <span className="mono" style={{ fontSize: 11, color: 'var(--ink-mute)' }}>{queue.length} SIN UID</span>
              </div>
            </div>

            <div style={{ flex: 1, overflow: 'auto' }}>
              {queue.slice(0, 30).map((g, i) => (
                <div key={g.id} style={{
                  display: 'grid', gridTemplateColumns: '34px 1fr 70px',
                  alignItems: 'center', padding: '10px 28px', gap: 10,
                  background: g.id === current?.id ? 'var(--accent-soft)' : 'transparent',
                  borderTop: '1px solid var(--line-soft)',
                  borderLeft: g.id === current?.id ? '3px solid var(--accent)' : '3px solid transparent',
                }}>
                  <span className="mono" style={{ fontSize: 11, color: g.id === current?.id ? 'var(--accent)' : 'var(--ink-mute)' }}>
                    {String(i + 1).padStart(3, '0')}
                  </span>
                  <div>
                    <div style={{ fontWeight: g.id === current?.id ? 700 : 500, fontSize: 13 }}>{g.name}</div>
                    <div className="mono" style={{ fontSize: 10, color: 'var(--ink-mute)' }}>{g.video || 'sin video'}</div>
                  </div>
                  <div className="mono" style={{ fontSize: 12, textAlign: 'right', color: 'var(--ink-mute)' }}>
                    {g.table_num ? `Mesa ${g.table_num}` : '—'}
                  </div>
                </div>
              ))}
              {queue.length === 0 && (
                <div style={{ padding: '40px 28px', textAlign: 'center', color: 'var(--ink-mute)', fontSize: 13 }}>
                  ✓ Todos con UID asignado
                </div>
              )}
            </div>

            {lastAssigned && (
              <div style={{ borderTop: '1px solid var(--line)', padding: '14px 28px', background: 'var(--surface-2)', flexShrink: 0 }}>
                <div className="mono" style={{ fontSize: 10, color: 'var(--ink-mute)', marginBottom: 8 }}>ÚLTIMA ASIGNACIÓN · {lastAssigned.ts}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ width: 28, height: 28, background: 'var(--success-500)', borderRadius: 2, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 14, flexShrink: 0 }}>✓</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{lastAssigned.guest?.name}</div>
                    <div className="mono" style={{ fontSize: 11, color: 'var(--ink-mute)' }}>UID → {lastAssigned.uid}</div>
                  </div>
                  <Btn variant="ghost" size="sm" onClick={undoLast}>Deshacer</Btn>
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </>
  );
}
