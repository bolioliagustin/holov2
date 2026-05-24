// Shared atomic UI components

export function Chip({ children, variant = 'default', dot, mono, style }) {
  const cls = ['chip', variant !== 'default' ? `chip--${variant}` : '', mono ? 'chip--mono' : ''].filter(Boolean).join(' ');
  return (
    <span className={cls} style={style}>
      {dot && <span className={`dot dot--${variant === 'default' ? 'mute' : variant} dot--pulse`} />}
      {children}
    </span>
  );
}

export function Btn({ children, variant = 'default', size, onClick, disabled, type = 'button', style, leftIcon, rightIcon }) {
  const cls = ['btn',
    variant === 'primary'      ? 'btn--primary'      : '',
    variant === 'ghost'        ? 'btn--ghost'        : '',
    variant === 'danger'       ? 'btn--danger'       : '',
    variant === 'danger-ghost' ? 'btn--danger-ghost' : '',
    size === 'sm' ? 'btn--sm' : '',
    size === 'lg' ? 'btn--lg' : '',
  ].filter(Boolean).join(' ');
  return (
    <button className={cls} onClick={onClick} disabled={disabled} type={type} style={style}>
      {leftIcon}
      {children}
      {rightIcon}
    </button>
  );
}

export function Toggle({ on, onChange }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      className={'toggle' + (on ? ' on' : '')}
      onClick={() => onChange?.(!on)}
    />
  );
}

export function Checkbox({ checked, onChange, indeterminate }) {
  return (
    <span
      className={'checkbox' + (checked ? ' checked' : '')}
      onClick={() => onChange?.(!checked)}
      role="checkbox"
      aria-checked={checked}
    />
  );
}

export function Field({ placeholder, value, onChange, mono, size, type = 'text', name, autoFocus, onKeyDown }) {
  return (
    <span className={'field' + (mono ? ' field--mono' : '') + (size === 'lg' ? ' field--lg' : '')}>
      <input
        type={type}
        name={name}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        autoFocus={autoFocus}
        onKeyDown={onKeyDown}
      />
    </span>
  );
}

export function Select({ value, onChange, options, style }) {
  return (
    <select className="select" value={value} onChange={(e) => onChange?.(e.target.value)} style={style}>
      {options.map((o) => (
        <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>
      ))}
    </select>
  );
}

export function ProgressBar({ value, variant }) {
  return (
    <div className="progress">
      <div
        className={'progress__bar' + (variant === 'success' ? ' progress__bar--success' : variant === 'danger' ? ' progress__bar--danger' : '')}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export function Spinner({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }}>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2" />
      <path d="M8 2a6 6 0 0 1 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Avatar({ initials, size = 32 }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%',
      background: 'var(--accent-soft)', border: '1px solid var(--accent-soft-2)',
      color: 'var(--accent)', fontWeight: 700, fontSize: size * 0.35,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, fontFamily: 'var(--font-body)',
    }}>
      {initials}
    </span>
  );
}

export function StatusChip({ status }) {
  if (status === 'in')   return <Chip variant="success" dot>Ya ingresó</Chip>;
  if (status === 'pend') return <Chip dot>Pendiente</Chip>;
  if (status === 'rescan') return <Chip variant="warning" dot>Re-scan</Chip>;
  return <Chip dot>—</Chip>;
}
