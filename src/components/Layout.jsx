import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { useWS } from '../context/WSContext';

const NAV = [
  {
    group: 'Evento en vivo',
    items: [
      { to: '/',          label: 'Dashboard',            icon: IcoDashboard },
      { to: '/events',    label: 'Eventos',              icon: IcoEvents },
    ],
  },
  {
    group: 'Preparación',
    items: [
      { to: '/invitados', label: 'Invitados',            icon: IcoGuests },
      { to: '/nfc',       label: 'Asignar pulseras',     icon: IcoNFC },
      { to: '/video',     label: 'Procesador de video',  icon: IcoVideo },
    ],
  },
  {
    group: 'Sistema',
    items: [
      { to: '/config',    label: 'Configuración',        icon: IcoConfig },
      { to: '/logs',      label: 'Logs de ingreso',      icon: IcoLogs },
    ],
  },
];

export default function Layout({ children }) {
  const { theme, toggleTheme } = useTheme();
  const { connected, on } = useWS();
  const [projectorStatus, setProjectorStatus] = useState({ status: 'unknown', since: null });
  const [currentEvent, setCurrentEvent] = useState(null);

  useEffect(() => {
    const off = on('PROJECTOR_STATUS', (ev) => setProjectorStatus({ status: ev.status, since: ev.since }));
    return off;
  }, [on]);

  useEffect(() => {
    const load = () => fetch('/api/events/current').then((r) => r.json()).then(setCurrentEvent).catch(() => {});
    load();
    const off1 = on('EVENTS_CHANGED',         load);
    const off2 = on('CURRENT_EVENT_CHANGED',  load);
    const off3 = on('CONFIG_UPDATED',         load);
    return () => { off1(); off2(); off3(); };
  }, [on]);

  const projectorOffline = projectorStatus.status === 'offline';
  const offlineSeconds = projectorStatus.since ? Math.floor((Date.now() - projectorStatus.since) / 1000) : 0;

  return (
    <div className="app-shell">
      {projectorOffline && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, zIndex: 300,
            background: 'var(--danger-500)', color: '#fff',
            padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 14,
            fontWeight: 600, fontSize: 13, boxShadow: '0 2px 14px rgba(0,0,0,0.3)',
          }}
        >
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#fff', animation: 'blink 1.2s ease-in-out infinite' }} />
          <span>⚠ Proyector desconectado{offlineSeconds > 0 ? ` desde hace ${offlineSeconds}s` : ''}</span>
          <span style={{ opacity: 0.85, fontWeight: 400 }}>· verificá la pantalla del holograma o esperá auto-recovery (30s)</span>
          <div style={{ flex: 1 }} />
          <a
            href="/projector.html?v=xfade-1"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#fff', textDecoration: 'underline', fontSize: 12 }}
          >
            Abrir proyector ↗
          </a>
        </div>
      )}
      <aside className="sidebar" style={{ marginTop: projectorOffline ? 40 : 0 }}>
        <div className="sidebar__logo">
          <span className="sidebar__logo-mark" />
          <div>
            <div className="sidebar__logo-text">HoloNFC</div>
            <span className="sidebar__logo-sub">CONTROL · v0.4</span>
          </div>
        </div>

        {currentEvent && (
          <div style={{
            margin: '0 14px 14px', padding: '10px 12px',
            background: currentEvent.status === 'active' ? 'var(--accent-soft)' : 'var(--surface-2)',
            border: `1px solid ${currentEvent.status === 'active' ? 'var(--accent)' : 'var(--line)'}`,
            borderRadius: 'var(--radius-sm)',
          }}>
            <div className="mono" style={{ fontSize: 9, color: 'var(--ink-mute)', letterSpacing: '0.14em', marginBottom: 4 }}>
              EVENTO {currentEvent.status === 'active' ? '· EN VIVO' : currentEvent.status === 'archived' ? '· ARCHIVADO' : '· BORRADOR'}
            </div>
            <div style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentEvent.name}
            </div>
            {currentEvent.date && (
              <div className="mono" style={{ fontSize: 10, color: 'var(--ink-mute)', marginTop: 2 }}>{currentEvent.date}</div>
            )}
          </div>
        )}

        <nav className="sidebar__nav">
          {NAV.map((group) => (
            <div key={group.group}>
              <div className="nav-group-label">{group.group}</div>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
                >
                  <item.icon size={16} />
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar__footer">
          <span className={`dot dot--${connected ? 'success' : 'danger'}${connected ? ' dot--pulse' : ''}`} />
          <div style={{ flex: 1, lineHeight: 1.2 }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>
              {connected ? 'WS conectado' : 'WS desconectado'}
            </div>
            <div className="mono" style={{ fontSize: 10, color: 'var(--ink-mute)' }}>localhost:3000</div>
          </div>
          <button
            title="Cambiar tema"
            onClick={toggleTheme}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-mute)', fontSize: 16, padding: 2 }}
          >
            {theme === 'dark' ? '☀' : '🌙'}
          </button>
        </div>
      </aside>

      <div className="main-content" style={{ marginTop: projectorOffline ? 40 : 0 }}>
        {children}
      </div>
    </div>
  );
}

// Icon components
function IcoDashboard({ size = 16 }) {
  return (
    <svg className="nav-item__icon" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <rect x="1" y="1" width="6" height="6" rx="1" />
      <rect x="9" y="1" width="6" height="6" rx="1" />
      <rect x="1" y="9" width="6" height="6" rx="1" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
    </svg>
  );
}
function IcoGuests({ size = 16 }) {
  return (
    <svg className="nav-item__icon" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="6" cy="5" r="3" />
      <path d="M1 14c0-3 2-5 5-5s5 2 5 5" />
      <path d="M12 7l2 2 3-3" />
    </svg>
  );
}
function IcoNFC({ size = 16 }) {
  return (
    <svg className="nav-item__icon" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <rect x="2" y="3" width="12" height="10" rx="1" />
      <path d="M6 8h4M8 6v4" />
    </svg>
  );
}
function IcoVideo({ size = 16 }) {
  return (
    <svg className="nav-item__icon" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <rect x="1" y="3" width="10" height="10" rx="1" />
      <path d="M11 6l4-2v8l-4-2" />
    </svg>
  );
}
function IcoConfig({ size = 16 }) {
  return (
    <svg className="nav-item__icon" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="8" cy="8" r="2.5" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M13 3l-1.4 1.4M4.4 11.6L3 13" />
    </svg>
  );
}
function IcoEvents({ size = 16 }) {
  return (
    <svg className="nav-item__icon" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <rect x="2" y="3" width="12" height="11" rx="1" />
      <path d="M2 6h12M5 2v3M11 2v3" />
    </svg>
  );
}
function IcoLogs({ size = 16 }) {
  return (
    <svg className="nav-item__icon" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M2 4h12M2 8h8M2 12h10" />
    </svg>
  );
}
