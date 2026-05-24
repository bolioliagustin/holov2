import { NavLink, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { useWS } from '../context/WSContext';

const NAV = [
  {
    group: 'Evento en vivo',
    items: [
      { to: '/',          label: 'Dashboard',            icon: IcoDashboard },
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
  const { connected } = useWS();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar__logo">
          <span className="sidebar__logo-mark" />
          <div>
            <div className="sidebar__logo-text">HoloNFC</div>
            <span className="sidebar__logo-sub">CONTROL · v0.4</span>
          </div>
        </div>

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

      <div className="main-content">
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
function IcoLogs({ size = 16 }) {
  return (
    <svg className="nav-item__icon" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M2 4h12M2 8h8M2 12h10" />
    </svg>
  );
}
