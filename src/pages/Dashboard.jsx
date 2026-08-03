import { useState, useEffect, useRef } from 'react';
import { Chip, Btn } from '../components/ui/index';
import { useWS } from '../context/WSContext';

const API = '/api';

// ─── Readiness widget ─────────────────────────────────────────────────────
function ReadinessWidget() {
  const [data, setData] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const { on } = useWS();

  const load = () => {
    fetch(`${API}/health/event-readiness`).then((r) => r.json()).then(setData).catch(() => {});
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    const offTag = on('TAG_READ',         () => load());
    const offNfc = on('NFC_STATUS',       () => load());
    const offPrj = on('PROJECTOR_STATUS', () => load());
    const offVid = on('VIDEO_STATUS',     () => load());
    return () => { clearInterval(id); offTag(); offNfc(); offPrj(); offVid(); };
  }, [on]);

  if (!data) return null;
  const { ready, summary, checks } = data;
  const failed = checks.filter((c) => !c.ok);
  const blocking = failed.filter((c) => !c.warn);

  const headerColor = ready
    ? 'var(--success-500)'
    : blocking.length > 0 ? 'var(--danger-500)' : 'var(--warning-500)';
  const headerBg = ready
    ? 'rgba(34, 197, 94, 0.08)'
    : blocking.length > 0 ? 'rgba(239, 68, 68, 0.08)' : 'rgba(245, 158, 11, 0.10)';

  return (
    <div style={{ borderBottom: '1px solid var(--line)', background: headerBg, flexShrink: 0 }}>
      <div
        onClick={() => setExpanded((e) => !e)}
        style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '10px 24px', cursor: 'pointer',
        }}
      >
        <div style={{
          width: 10, height: 10, borderRadius: '50%',
          background: headerColor,
          boxShadow: ready ? `0 0 0 4px ${headerColor}33` : 'none',
        }} />
        <div style={{ fontWeight: 700, fontSize: 13 }}>
          {ready
            ? 'Sistema listo para el evento'
            : blocking.length > 0
              ? `${blocking.length} ${blocking.length === 1 ? 'problema crítico' : 'problemas críticos'}`
              : `${failed.length} ${failed.length === 1 ? 'advertencia' : 'advertencias'}`
          }
        </div>
        <span className="mono" style={{ fontSize: 10, color: 'var(--ink-mute)' }}>
          · {summary.totalGuests} invitados · {summary.checkedIn} ingresaron
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={(e) => { e.stopPropagation(); load(); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-mute)', fontSize: 11, fontFamily: 'var(--font-mono)' }}
          title="Re-verificar ahora"
        >
          ↻ verificar
        </button>
        <span style={{ fontSize: 11, color: 'var(--ink-mute)' }}>
          {expanded ? '▲' : '▼'}
        </span>
      </div>
      {expanded && (
        <div style={{ padding: '4px 24px 14px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px 24px' }}>
          {checks.map((c) => (
            <div key={c.key} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '6px 10px',
              background: 'var(--surface)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--line-soft)',
            }}>
              <span style={{
                width: 18, height: 18, borderRadius: '50%',
                background: c.ok ? 'var(--success-500)' : (c.warn ? 'var(--warning-500)' : 'var(--danger-500)'),
                color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 900, flexShrink: 0,
              }}>
                {c.ok ? '✓' : (c.warn ? '!' : '✕')}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{c.label}</div>
                {c.hint && (
                  <div className="mono" style={{ fontSize: 10, color: 'var(--ink-mute)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.hint}>
                    {c.hint}
                  </div>
                )}
              </div>
              <div className="mono" style={{ fontSize: 11, color: c.ok ? 'var(--ink-mute)' : 'var(--ink)' }}>
                {c.value}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function useStats() {
  const [stats, setStats] = useState({ total: 0, checkedIn: 0, pending: 0, rescans: 0, unknown: 0 });
  const load = () => fetch(`${API}/stats`).then((r) => r.json()).then(setStats).catch(() => {});
  useEffect(() => { load(); }, []);
  return [stats, load];
}

export default function Dashboard() {
  const [stats, reloadStats] = useStats();
  const [log, setLog] = useState([]);
  const [holoState, setHoloState] = useState(null);
  const { on } = useWS();
  const logRef = useRef(null);

  useEffect(() => {
    fetch(`${API}/logs?limit=30`).then((r) => r.json()).then((d) => setLog(d.rows || [])).catch(() => {});
  }, []);

  useEffect(() => {
    const off = on('TAG_READ', (ev) => {
      reloadStats();
      const ts = new Date(ev.ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const entry = {
        id: Date.now(),
        ts,
        uid: ev.uid,
        name: ev.guest?.name || '—',
        table: ev.guest?.table_num || '—',
        type: ev.checkinType || 'IN',
        video: ev.guest?.video || '',
        message: ev.guest?.message || '',
      };
      setLog((prev) => [entry, ...prev].slice(0, 50));

      if (ev.guest) {
        setHoloState({ guest: ev.guest, ts });
        setTimeout(() => setHoloState(null), 10000);
      }
    });
    return off;
  }, [on, reloadStats]);

  const openProjector = () => {
    window.open('/projector.html?v=xfade-1', 'HoloNFC_Projector', 'width=1280,height=720');
  };

  const pct = stats.total > 0 ? Math.round((stats.checkedIn / stats.total) * 100) : 0;

  return (
    <>
      {/* Top bar */}
      <header className="topbar">
        <div>
          <div className="topbar__title">Dashboard</div>
          <div className="topbar__sub">EVENTO EN VIVO</div>
        </div>
        <div className="topbar__actions">
          <Chip variant="accent" dot>EN VIVO</Chip>
          <Btn variant="ghost" size="sm">Pausar lector</Btn>
          <Btn variant="primary" size="sm" onClick={openProjector}>Abrir holograma ↗</Btn>
        </div>
      </header>

      <div className="page-content" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Readiness check */}
        <ReadinessWidget />

        {/* Stat row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
          <StatCell label="Total invitados"       value={stats.total}     sub="lista total" />
          <StatCell label="Han ingresado"         value={stats.checkedIn} sub={`${pct}% del total`} accent />
          <StatCell label="Reingresos"            value={stats.rescans}   sub="re-scans de sesión" />
          <StatCell label="Pulseras desconocidas" value={stats.unknown}   sub="revisar seguridad" danger />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', flex: 1, minHeight: 0 }}>
          {/* Left: log table */}
          <section style={{ borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ padding: '14px 24px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Últimos check-ins</div>
                <div className="mono" style={{ fontSize: 10, color: 'var(--ink-mute)' }}>TIEMPO REAL · WEBSOCKET</div>
              </div>
              <Btn variant="ghost" size="sm" onClick={() => { window.location.href = '/logs'; }}>Ver logs completos →</Btn>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '70px 1.5fr 110px 70px 80px', padding: '0 24px', flexShrink: 0 }}>
              {['HORA', 'INVITADO', 'UID', 'MESA', 'EST.'].map((h) => (
                <div key={h} style={{ padding: '6px 8px', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', color: 'var(--ink-mute)', textTransform: 'uppercase', borderBottom: '1px solid var(--line)' }}>{h}</div>
              ))}
            </div>

            <div ref={logRef} style={{ flex: 1, overflow: 'auto' }}>
              {log.map((entry, i) => (
                <div key={entry.id || i} style={{
                  display: 'grid',
                  gridTemplateColumns: '70px 1.5fr 110px 70px 80px',
                  padding: '0 24px',
                  borderBottom: '1px solid var(--line-soft)',
                  fontSize: 13,
                  background: i === 0 ? 'var(--accent-soft)' : 'transparent',
                  animation: i === 0 ? 'fade-in 200ms ease-out' : 'none',
                }}>
                  <div style={{ padding: '9px 8px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-mute)' }}>{entry.ts}</div>
                  <div style={{ padding: '9px 8px', fontWeight: i === 0 ? 700 : 500 }}>{entry.name}</div>
                  <div style={{ padding: '9px 8px', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{entry.uid}</div>
                  <div style={{ padding: '9px 8px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{entry.table}</div>
                  <div style={{ padding: '7px 8px' }}>
                    {entry.type === 'IN'      && <Chip variant="success" style={{ height: 20, fontSize: 10 }}>IN</Chip>}
                    {entry.type === 'RESCAN'  && <Chip variant="warning" style={{ height: 20, fontSize: 10 }}>RE</Chip>}
                    {entry.type === 'UNKNOWN' && <Chip variant="danger"  style={{ height: 20, fontSize: 10 }}>??</Chip>}
                  </div>
                </div>
              ))}
              {log.length === 0 && (
                <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--ink-mute)', fontSize: 13 }}>
                  Esperando check-ins…
                </div>
              )}
            </div>
          </section>

          {/* Right: hologram + NFC status */}
          <aside style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ padding: '14px 24px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Holograma activo</div>
                <div className="mono" style={{ fontSize: 10, color: 'var(--ink-mute)' }}>HDMI · PROYECTOR</div>
              </div>
              <Chip variant={holoState ? 'accent' : 'default'} dot={!!holoState}>
                {holoState ? 'proyectando' : 'idle'}
              </Chip>
            </div>

            {/* Hologram preview */}
            <div style={{ padding: '0 24px 14px', flexShrink: 0 }}>
              <div className="holo-bg" style={{ aspectRatio: '16/9', position: 'relative', border: '1px solid #222', overflow: 'hidden' }}>
                <div className="hatch-dark" style={{ position: 'absolute', inset: 0 }} />
                {holoState ? (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: 16, color: '#fff', animation: 'fade-in 300ms ease-out' }}>
                    <div className="mono" style={{ fontSize: 10, opacity: 0.55, letterSpacing: '0.18em' }}>BIENVENIDO</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, letterSpacing: '-0.02em', lineHeight: 1.1, marginTop: 4 }}>
                      {holoState.guest.name}
                    </div>
                    {holoState.guest.table_num && (
                      <div className="mono" style={{ fontSize: 10, opacity: 0.55, marginTop: 4 }}>MESA {holoState.guest.table_num}</div>
                    )}
                    {holoState.guest.message && (
                      <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4, fontStyle: 'italic' }}>«{holoState.guest.message}»</div>
                    )}
                  </div>
                ) : (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="mono" style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.18em' }}>IDLE · LOOP</div>
                  </div>
                )}
                <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', gap: 5, alignItems: 'center' }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)' }} />
                  <span className="mono" style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.1em' }}>LIVE</span>
                </div>
              </div>
            </div>

            {/* Live WS feed */}
            <div style={{ flex: 1, overflow: 'hidden', padding: '12px 24px', borderTop: '1px solid var(--line)', minHeight: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>WebSocket · live feed</div>
              <div className="live-feed" style={{ height: '100%', overflow: 'auto' }}>
                {log.slice(0, 20).map((e, i) => (
                  <div key={e.id || i} className="live-feed__line">
                    <span className="live-feed__time">[{e.ts}]</span>{' '}
                    <span className={`live-feed__tag live-feed__tag--${e.type === 'IN' ? 'ok' : e.type === 'RESCAN' ? 'accent' : 'danger'}`}>
                      {e.type === 'IN' ? 'TAG_READ' : e.type === 'RESCAN' ? 'RESCAN' : 'UNKNOWN'}
                    </span>{' '}
                    <span style={{ color: 'var(--ink-2)' }}>uid={e.uid}{e.name !== '—' ? ` → ${e.name}` : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}

function StatCell({ label, value, sub, accent, danger }) {
  return (
    <div style={{ padding: '18px 24px', borderRight: '1px solid var(--line)' }}>
      <div className="stat-card__label">{label}</div>
      <div className={`stat-card__value${accent ? ' stat-card__value--accent' : danger ? ' stat-card__value--danger' : ''}`}>
        {value}
      </div>
      <div className="stat-card__sub">{sub}</div>
    </div>
  );
}
