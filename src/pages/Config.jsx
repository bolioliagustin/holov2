import { useState, useEffect, useRef } from 'react';
import { Chip, Btn, Field, Toggle } from '../components/ui/index';
import { useToast } from '../components/ui/Toasts';
import { useWS } from '../context/WSContext';

const API = '/api';

export default function Config() {
  const toast = useToast();
  const { on } = useWS();
  const [nfcStatus, setNfcStatus] = useState({ connected: false, readers: [] });

  useEffect(() => {
    fetch(`${API}/health/event-readiness`).then((r) => r.json()).then((d) => setNfcStatus(d.nfc)).catch(() => {});
    const off = on('NFC_STATUS', (ev) => setNfcStatus({ connected: ev.connected, readers: ev.readers || [] }));
    return off;
  }, [on]);

  const [cfg, setCfg] = useState({
    holo_screen: '', idle_video: '', sim_mode: '0',
    event_name: '', event_venue: '', event_date: '', event_capacity: '0',
    xfade_ms: '100', xfade_offset_ms: '0', xfade_auto: '1',
  });
  const [screens, setScreens] = useState([
    { id: 'HDMI-1', name: 'Monitor principal', res: '1920×1080' },
    { id: 'HDMI-2', name: 'Pantalla holo', res: '1920×1080' },
    { id: 'HDMI-3', name: 'No detectado', res: '—', disabled: true },
  ]);
  const [idleVideos, setIdleVideos] = useState([]);
  const [saving, setSaving] = useState(false);
  const [xfadeStats, setXfadeStats] = useState(null);

  useEffect(() => {
    fetch(`${API}/config`).then((r) => r.json()).then(setCfg).catch(() => {});
    fetch(`${API}/videos/queue`).then((r) => r.json()).then((rows) => {
      setIdleVideos(rows.filter((v) => v.status === 'done'));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const off = on('TRANSITION_STATS', (ev) => {
      setXfadeStats(ev);
    });
    return off;
  }, [on]);
  const save = () => {
    setSaving(true);
    fetch(`${API}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
    })
      .then(() => toast('Configuración guardada', 'success'))
      .catch(() => toast('Error guardando configuración', 'danger'))
      .finally(() => setSaving(false));
  };

  const set = (key, val) => setCfg((p) => ({ ...p, [key]: val }));

  const resetAll = () => {
    if (!confirm('¿Resetear el check-in de TODOS los invitados?')) return;
    fetch(`${API}/guests/reset-all`, { method: 'POST' })
      .then(() => toast('Reset masivo completado', 'success'))
      .catch(() => toast('Error', 'danger'));
  };

  const clearUIDs = () => {
    if (!confirm('¿Borrar TODOS los UIDs asignados?')) return;
    fetch(`${API}/guests/clear-uids`, { method: 'POST' })
      .then(() => toast('UIDs eliminados', 'success'))
      .catch(() => toast('Error', 'danger'));
  };

  return (
    <>
      <header className="topbar">
        <div>
          <div className="topbar__title">Configuración del sistema</div>
          <div className="topbar__sub">HARDWARE · TRANSICIÓN · VIDEO DE ESPERA</div>
        </div>
        <div className="topbar__actions">
          <Btn variant="primary" size="sm" onClick={save} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </Btn>
        </div>
      </header>

      <div className="page-content">
        {/* Pantallas */}
        <div className="section-2col">
          <div>
            <div className="section-2col__label">01 · Pantallas</div>
            <div className="section-2col__title">Asignación HDMI</div>
            <div className="section-2col__desc">
              Elige en qué monitor se abrirá la ventana de proyección holográfica.
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {screens.map((s) => (
              <div
                key={s.id}
                onClick={() => !s.disabled && set('holo_screen', s.id)}
                style={{
                  border: `1.5px solid ${cfg.holo_screen === s.id ? 'var(--accent)' : 'var(--line)'}`,
                  padding: 14, opacity: s.disabled ? 0.45 : 1,
                  cursor: s.disabled ? 'default' : 'pointer',
                  background: cfg.holo_screen === s.id ? 'var(--accent-soft)' : 'var(--surface)',
                  transition: 'border-color 150ms, background 150ms',
                }}
              >
                <div className="hatch" style={{ aspectRatio: '16/9', marginBottom: 12, position: 'relative' }}>
                  {cfg.holo_screen === s.id && (
                    <div style={{ position: 'absolute', inset: 8, border: '2px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span className="mono" style={{ fontSize: 9, color: 'var(--accent)', letterSpacing: '0.1em' }}>EN USO</span>
                    </div>
                  )}
                </div>
                <div className="mono" style={{ fontSize: 11, color: cfg.holo_screen === s.id ? 'var(--accent)' : 'var(--ink-mute)', letterSpacing: '0.1em' }}>{s.id}</div>
                <div style={{ fontWeight: 700, fontSize: 13, marginTop: 2 }}>{s.name}</div>
                <div className="mono" style={{ fontSize: 10, color: 'var(--ink-mute)', marginTop: 2 }}>{s.res}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Lector NFC + Sim mode */}
        <div className="section-2col">
          <div>
            <div className="section-2col__label">02 · Lector NFC</div>
            <div className="section-2col__title">ACR122U</div>
            <div className="section-2col__desc">
              Hardware físico. Si no está conectado, activa el modo simulación.
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>Conexión hardware</div>
                  <div className="mono" style={{ fontSize: 10, color: 'var(--ink-mute)', marginTop: 2 }}>USB · ACR122U</div>
                </div>
                {nfcStatus.connected
                  ? <Chip variant="success" dot>Conectado</Chip>
                  : <Chip variant="danger"  dot>Desconectado</Chip>
                }
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5 }}>
                {nfcStatus.connected
                  ? <>Lector: <span className="mono" style={{ color: 'var(--accent)' }}>{nfcStatus.readers.join(', ')}</span></>
                  : 'Conectá el ACR122U por USB. Si no aparece, verificá los drivers de PC/SC (ACS Unified Driver).'
                }
              </div>
            </div>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>Modo simulación</div>
                  <div className="mono" style={{ fontSize: 10, color: 'var(--ink-mute)', marginTop: 2 }}>PRUEBAS SIN HARDWARE</div>
                </div>
                <Toggle on={cfg.sim_mode === '1'} onChange={(v) => set('sim_mode', v ? '1' : '0')} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5, marginBottom: 12 }}>
                Permite disparar check-ins haciendo clic en invitados, sin acercar la pulsera al lector.
              </div>
              <Btn size="sm" onClick={() => window.location.href = '/invitados'}>Ir a Invitados →</Btn>
            </div>
          </div>
        </div>

        {/* Video idle */}
        <div className="section-2col">
          <div>
            <div className="section-2col__label">03 · Video de espera</div>
            <div className="section-2col__title">Loop idle</div>
            <div className="section-2col__desc">
              Se reproduce continuamente mientras no haya check-ins activos.
            </div>
          </div>
          <div>
            {idleVideos.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                {idleVideos.map((v) => (
                  <div
                    key={v.id}
                    onClick={() => set('idle_video', v.output)}
                    style={{
                      border: `1.5px solid ${cfg.idle_video === v.output ? 'var(--accent)' : 'var(--line)'}`,
                      padding: 6, cursor: 'pointer',
                      background: cfg.idle_video === v.output ? 'var(--accent-soft)' : 'var(--surface)',
                    }}
                  >
                    <div className="holo-bg" style={{ aspectRatio: '16/9', position: 'relative' }}>
                      <div className="hatch-dark" style={{ position: 'absolute', inset: 0 }} />
                      {cfg.idle_video === v.output && (
                        <Chip variant="accent" style={{ position: 'absolute', top: 5, right: 5, height: 16, fontSize: 9, padding: '0 5px' }}>EN USO</Chip>
                      )}
                    </div>
                    <div className="mono" style={{ fontSize: 10, marginTop: 5 }}>{v.original}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '20px', color: 'var(--ink-mute)', fontSize: 13 }}>
                No hay videos procesados aún. Ve a{' '}
                <a href="/video" style={{ color: 'var(--accent)' }}>Procesador de video</a> para subir uno.
              </div>
            )}
          </div>
        </div>

        {/* Transición holográfica */}
        <div className="section-2col">
          <div>
            <div className="section-2col__label">04 · Transición</div>
            <div className="section-2col__title">Micro-crossfade</div>
            <div className="section-2col__desc">
              Aplica a videos con IA y ya editados. El proyector analiza luminancia
              de frames para elegir el momento del swap; el desfase lo afinás a mano.
            </div>
          </div>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Análisis automático de frame</div>
                <div className="mono" style={{ fontSize: 10, color: 'var(--ink-mute)', marginTop: 2 }}>
                  Espera el frame donde idle y guest están más parecidos en brillo
                </div>
              </div>
              <Toggle
                on={cfg.xfade_auto !== '0'}
                onChange={(v) => set('xfade_auto', v ? '1' : '0')}
              />
            </label>

            <div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                <span>Duración del crossfade</span>
                <span className="mono" style={{ color: 'var(--ink-mute)' }}>{cfg.xfade_ms || 100} ms</span>
              </div>
              <input
                type="range" min="40" max="200" step="10"
                value={Number(cfg.xfade_ms) || 100}
                onChange={(e) => set('xfade_ms', e.target.value)}
                style={{ width: '100%' }}
              />
              <div className="mono" style={{ fontSize: 10, color: 'var(--ink-mute)', marginTop: 4 }}>
                40 = casi hard cut · 100 = sutil (default) · 200 = más suave
              </div>
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                <span>Desfase manual</span>
                <span className="mono" style={{ color: 'var(--ink-mute)' }}>
                  {Number(cfg.xfade_offset_ms) >= 0 ? '+' : ''}{cfg.xfade_offset_ms || 0} ms
                </span>
              </div>
              <input
                type="range" min="-100" max="250" step="10"
                value={Number(cfg.xfade_offset_ms) || 0}
                onChange={(e) => set('xfade_offset_ms', e.target.value)}
                style={{ width: '100%' }}
              />
              <div className="mono" style={{ fontSize: 10, color: 'var(--ink-mute)', marginTop: 4 }}>
                Negativo no retrocede el video; positivo espera más después del frame óptimo
              </div>
            </div>

            <div style={{
              padding: 12, background: 'var(--surface-2)', border: '1px solid var(--line)',
              borderRadius: 2, fontSize: 12,
            }}>
              <div className="mono" style={{ fontSize: 10, color: 'var(--ink-mute)', letterSpacing: '0.12em', marginBottom: 8 }}>
                ÚLTIMO SWAP (proyector)
              </div>
              {xfadeStats ? (
                <div className="mono" style={{ fontSize: 11, lineHeight: 1.7, color: 'var(--ink)' }}>
                  <div>Duración: {xfadeStats.xfadeMs} ms · Offset: {xfadeStats.offsetMs} ms</div>
                  <div>Luminancia idle: {xfadeStats.idleLuma} · guest: {xfadeStats.guestLuma} · Δ {xfadeStats.delta}</div>
                  <div>Espera auto: {xfadeStats.waitedMs ?? '—'} ms · {xfadeStats.auto ? 'AUTO' : 'MANUAL'}</div>
                  {xfadeStats.direction && <div>Dirección: {xfadeStats.direction}</div>}
                </div>
              ) : (
                <div style={{ color: 'var(--ink-mute)', fontSize: 12 }}>
                  Abrí el proyector y hacé un check-in para ver el desfase medido en vivo.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Evento */}
        <div className="section-2col">
          <div>
            <div className="section-2col__label">05 · Datos del evento</div>
            <div className="section-2col__title">Nombre y datos</div>
            <div className="section-2col__desc">
              El nombre se proyecta en la pantalla idle.
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="card">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <label>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Nombre del evento</div>
                  <Field value={cfg.event_name} onChange={(v) => set('event_name', v)} placeholder="Nombre del evento" />
                </label>
                <label>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Sede / Salón</div>
                  <Field value={cfg.event_venue} onChange={(v) => set('event_venue', v)} placeholder="Hotel y salón" />
                </label>
                <label>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Fecha</div>
                  <Field value={cfg.event_date} onChange={(v) => set('event_date', v)} placeholder="DD/MM/AAAA" />
                </label>
                <label>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Capacidad</div>
                  <Field value={cfg.event_capacity} onChange={(v) => set('event_capacity', v)} placeholder="2000" />
                </label>
              </div>
            </div>

            <div className="card card--danger" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--danger-500)' }}>⚠ Zona peligrosa</div>
              <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5 }}>
                Estas acciones son irreversibles. Úsalas para reutilizar el sistema en otro evento.
              </div>
              <Btn variant="danger-ghost" size="sm" onClick={resetAll} style={{ width: '100%', justifyContent: 'center' }}>
                Reset check-ins de todos los invitados
              </Btn>
              <Btn variant="danger-ghost" size="sm" onClick={clearUIDs} style={{ width: '100%', justifyContent: 'center' }}>
                Borrar todos los UIDs asignados
              </Btn>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
