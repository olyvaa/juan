import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Activity, AlertTriangle, BarChart3, CheckCircle2, ChevronRight, Copy, Gauge, Layers, Minus, XOctagon,
  Pause, Play, Plus, RefreshCw, Wallet, XCircle, Info,
} from 'lucide-react';
import {
  BRIDGE_URL, demoApply, demoState, fetchState, sendCommand,
  type AccountInfo, type BridgeState, type Follower, type StrategyRun,
} from './api';
import { CATALOG, GOATPRO_RESULTS, VERDICT_LABEL, type StrategyInfo } from './catalog';

type View = 'resumen' | 'estrategias' | 'copiador' | 'cuentas' | 'resultados';
type Theme = 'auto' | 'light' | 'dark';
type Confirm = { title: string; message: ReactNode; action: string; destructive?: boolean; onConfirm: () => void };

const NAV: { id: View; label: string; icon: ReactNode }[] = [
  { id: 'resumen', label: 'Resumen', icon: <Gauge size={18} /> },
  { id: 'estrategias', label: 'Estrategias', icon: <Layers size={18} /> },
  { id: 'copiador', label: 'Copiador', icon: <Copy size={18} /> },
  { id: 'cuentas', label: 'Cuentas', icon: <Wallet size={18} /> },
  { id: 'resultados', label: 'Resultados', icon: <BarChart3 size={18} /> },
];

// Formato español con separador de miles siempre (es-ES no agrupa los números de 4 cifras).
const amount = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = (n: number) => `${n < 0 ? '−' : ''}${amount.format(Math.abs(n))} $`;
const signedUsd = (n: number) => (n > 0 ? '+' : '') + usd(n);
const tone = (n: number) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');

function readLocal<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeLocal(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* navegador sin almacenamiento */ }
}

// ------------------------------------------------------------------ estado + puente
function useBridge() {
  const [state, setState] = useState<BridgeState>(demoState);
  const [connected, setConnected] = useState(false);
  const [checked, setChecked] = useState(false);
  const connectedRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const s = await fetchState();
      connectedRef.current = true;
      setConnected(true);
      setState(s);
    } catch {
      if (connectedRef.current) setState(demoState());
      connectedRef.current = false;
      setConnected(false);
    } finally {
      setChecked(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), 1500);
    return () => window.clearInterval(t);
  }, [refresh]);

  const run = useCallback(async (path: string, body: unknown = {}): Promise<string> => {
    if (!connectedRef.current) {
      setState(s => demoApply(s, path, body));
      return 'Demo: no se ha enviado nada a NinjaTrader';
    }
    const msg = await sendCommand(path, body);
    void refresh();
    return msg;
  }, [refresh]);

  return { state, connected, checked, run };
}

// ------------------------------------------------------------------ piezas
function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled}
      className={`switch${on ? ' on' : ''}`} onClick={() => onChange(!on)}
    >
      <span className="knob" />
    </button>
  );
}

function StatusPill({ kind, children }: { kind: 'good' | 'warn' | 'bad' | 'neutral'; children: ReactNode }) {
  const icon = kind === 'good' ? <CheckCircle2 size={13} /> : kind === 'bad' ? <XCircle size={13} /> : kind === 'warn' ? <AlertTriangle size={13} /> : <Info size={13} />;
  return <span className={`pill ${kind}`}>{icon}{children}</span>;
}

function Tile({ label, value, sub, valueTone }: { label: string; value: ReactNode; sub?: ReactNode; valueTone?: string }) {
  return (
    <div className="tile">
      <span className="tile-label">{label}</span>
      <strong className={`tile-value ${valueTone || ''}`}>{value}</strong>
      {sub && <span className="tile-sub">{sub}</span>}
    </div>
  );
}

function Section({ title, footer, children, action }: { title?: string; footer?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="group">
      {(title || action) && <div className="group-head">{title && <h2>{title}</h2>}{action}</div>}
      <div className="group-card">{children}</div>
      {footer && <p className="group-foot">{footer}</p>}
    </section>
  );
}

function ConfirmSheet({ c, onClose }: { c: Confirm; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="alertdialog" aria-modal="true" aria-labelledby="sheet-title">
        <h3 id="sheet-title">{c.title}</h3>
        <div className="sheet-body">{c.message}</div>
        <div className="sheet-actions">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button
            type="button" className={`btn ${c.destructive ? 'danger' : 'primary'}`} autoFocus
            onClick={() => { c.onConfirm(); onClose(); }}
          >{c.action}</button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ vistas
function RunRow({ r, onToggle, onClose }: { r: StrategyRun; onToggle: () => void; onClose: () => void }) {
  return (
    <div className="row run-row">
      <div className="row-main">
        <span className="row-title">{r.strategy.replace(/^CC/, '')} <span className={`num ${tone(r.dayPnl)}`}>{signedUsd(r.dayPnl)}</span></span>
        <span className="row-sub">{r.account} · {r.instrument} · {r.position}{r.lastEvent ? ` · ${r.lastEvent}` : ''}</span>
      </div>
      <div className="run-controls">
        {r.paused ? <StatusPill kind="warn">Pausada</StatusPill> : <StatusPill kind="good">Activa</StatusPill>}
        <Toggle on={!r.paused} onChange={onToggle} label={`${r.paused ? 'Reanudar' : 'Pausar'} ${r.strategy}`} />
        <button type="button" className="btn small" onClick={onClose}>Cerrar</button>
      </div>
    </div>
  );
}

function Resumen({ state, connected, go, ask, act }: ViewProps & { go: (v: View) => void }) {
  const runs = state.strategies;
  const day = runs.reduce((s, r) => s + r.dayPnl, 0);
  const active = runs.filter(r => !r.paused).length;
  const real = state.accounts.filter(a => !a.sim).length;
  return (
    <>
      <div className="tiles">
        <Tile label="Resultado del día" value={signedUsd(day)} valueTone={tone(day)} sub="Suma de todas las estrategias" />
        <Tile label="Estrategias" value={`${active} de ${runs.length}`} sub={runs.length ? 'activas · el resto en pausa' : 'ninguna en marcha'} />
        <Tile
          label="Copiador" value={state.copier.running ? 'Activo' : 'Detenido'}
          sub={state.copier.running ? `${state.copier.master} → ${state.copier.followers.length} seguidoras` : 'Sin copia en curso'}
        />
        <Tile label="Cuentas" value={state.accounts.length} sub={`${state.accounts.length - real} simuladas · ${real} ${real === 1 ? 'real' : 'reales'}`} />
      </div>

      <Section
        title="En marcha"
        action={<button type="button" className="link" onClick={() => go('estrategias')}>Ver estrategias <ChevronRight size={14} /></button>}
      >
        {runs.length === 0
          ? <div className="empty">No hay estrategias activas. Actívalas desde un gráfico de NinjaTrader.</div>
          : runs.map(r => (
            <RunRow
              key={r.id} r={r}
              onToggle={() => act(`strategies/${r.id}/${r.paused ? 'resume' : 'pause'}`)}
              onClose={() => ask({
                title: `Cerrar ${r.strategy.replace(/^CC/, '')}`,
                message: <>Se cerrará a mercado la posición en <b>{r.account}</b>.</>,
                action: 'Cerrar posición', destructive: true,
                onConfirm: () => act(`strategies/${r.id}/flatten`),
              })}
            />
          ))}
      </Section>

      <Section footer="Pausa todas las estrategias, cierra sus posiciones a mercado y cierra lo copiado en las seguidoras.">
        <div className="row kill-row">
          <span className="kill-icon"><XOctagon size={22} /></span>
          <div className="row-main">
            <span className="row-title">Kill switch</span>
            <span className="row-sub">{connected ? 'Actúa sobre NinjaTrader' : 'Modo demo: no envía nada'}</span>
          </div>
          <button
            type="button" className="btn danger"
            onClick={() => ask({
              title: 'Activar kill switch',
              message: 'Se pausarán TODAS las estrategias y se cerrarán sus posiciones a mercado, incluidas las copiadas.',
              action: 'Pausar y cerrar todo', destructive: true,
              onConfirm: () => act('killswitch'),
            })}
          >Pausar y cerrar todo</button>
        </div>
      </Section>
    </>
  );
}

function verdictKind(info: StrategyInfo): 'good' | 'warn' | 'bad' | 'neutral' {
  return info.verdict === 'validada' ? 'good' : info.verdict === 'no-recomendada' ? 'bad' : 'neutral';
}

function Estrategias({ state, ask, act }: ViewProps) {
  return (
    <>
      <div className="cards">
        {CATALOG.map(info => {
          const runs = state.strategies.filter(r => r.strategy === info.key);
          return (
            <article className="card" key={info.key}>
              <header className="card-head">
                <div>
                  <h3>{info.name}</h3>
                  <p className="card-tag">{info.tagline}</p>
                </div>
                <StatusPill kind={verdictKind(info)}>{VERDICT_LABEL[info.verdict]}</StatusPill>
              </header>
              <p className="card-text">{info.description}</p>
              <dl className="facts">
                <div><dt>Gráfico</dt><dd>{info.chart}</dd></div>
                <div><dt>Backtest</dt><dd>{info.verdictNote}</dd></div>
              </dl>
              <div className="card-runs">
                {runs.length === 0
                  ? <span className="muted">No está activa en ninguna cuenta.</span>
                  : runs.map(r => (
                    <RunRow
                      key={r.id} r={r}
                      onToggle={() => act(`strategies/${r.id}/${r.paused ? 'resume' : 'pause'}`)}
                      onClose={() => ask({
                        title: `Cerrar ${info.name}`,
                        message: <>Se cerrará a mercado la posición en <b>{r.account}</b>.</>,
                        action: 'Cerrar posición', destructive: true,
                        onConfirm: () => act(`strategies/${r.id}/flatten`),
                      })}
                    />
                  ))}
              </div>
            </article>
          );
        })}
      </div>
      <Section title="Cómo activar una estrategia">
        <ol className="steps">
          <li>En NinjaTrader abre un gráfico con la temporalidad indicada y horario ETH.</li>
          <li>Clic derecho → <b>Strategies</b> → elige la estrategia (CCGoatPro, CCGYR…).</li>
          <li>Elige la cuenta (<b>Sim101</b> para pruebas), ajusta contratos y TP/SL y marca <b>Enabled</b>.</li>
          <li>Aparece aquí al momento. Desde el panel la puedes pausar, reanudar o cerrar.</li>
        </ol>
      </Section>
    </>
  );
}

type Draft = { master: string; followers: Record<string, { on: boolean; multiplier: number; inverse: boolean }> };

function Copiador({ state, connected, ask, act }: ViewProps) {
  const [draft, setDraft] = useState<Draft>(() => readLocal<Draft>('cc-panel-copier', { master: '', followers: {} }));
  useEffect(() => writeLocal('cc-panel-copier', draft), [draft]);

  const names = state.accounts.map(a => a.name);
  // Por seguridad, la maestra por defecto es la primera cuenta simulada, nunca una real.
  const defaultMaster = state.accounts.find(a => a.sim)?.name || names[0] || '';
  const master = state.copier.running ? state.copier.master : (names.includes(draft.master) ? draft.master : defaultMaster);
  const running = state.copier.running;
  const isSim = (n: string) => state.accounts.find(a => a.name === n)?.sim ?? true;

  const followerCfg = (n: string) => {
    if (running) {
      const f = state.copier.followers.find(x => x.account === n);
      return { on: !!f, multiplier: f?.multiplier ?? 1, inverse: f?.inverse ?? false };
    }
    return draft.followers[n] || { on: false, multiplier: 1, inverse: false };
  };
  const setFollower = (n: string, patch: Partial<{ on: boolean; multiplier: number; inverse: boolean }>) =>
    setDraft(d => ({ ...d, followers: { ...d.followers, [n]: { ...followerCfg(n), ...patch } } }));

  const chosen: Follower[] = names
    .filter(n => n !== master && followerCfg(n).on)
    .map(n => ({ account: n, multiplier: followerCfg(n).multiplier, inverse: followerCfg(n).inverse }));

  const start = () => ask({
    title: 'Iniciar copiador',
    message: (
      <>
        <p>Maestra: <b>{master}</b>{!isSim(master) && <> <StatusPill kind="bad">Cuenta real</StatusPill></>}</p>
        <ul className="sheet-list">
          {chosen.map(f => (
            <li key={f.account}>
              {f.account} · ×{f.multiplier}{f.inverse ? ' · inverso' : ''}
              {!isSim(f.account) && <StatusPill kind="bad">Cuenta real</StatusPill>}
            </li>
          ))}
        </ul>
        <p>Cada operación de la maestra se copiará a mercado.</p>
      </>
    ),
    action: 'Iniciar', destructive: !isSim(master) || chosen.some(f => !isSim(f.account)),
    onConfirm: () => act('copier/start', { master, followers: chosen }),
  });

  return (
    <>
      <div className="callout">
        <AlertTriangle size={18} />
        <div>
          Copia la <b>posición</b> de la maestra (entradas, parciales, salidas y giros) con órdenes a mercado.
          <b> No copia los stops pendientes</b>: si NinjaTrader se cierra o se desconecta, las seguidoras quedan sin protección propia.
          No pongas la misma estrategia en la maestra y en las seguidoras.
        </div>
      </div>

      <Section title="Cuenta maestra">
        <div className="row">
          <div className="row-main"><span className="row-title">Maestra</span><span className="row-sub">Sus operaciones se copian</span></div>
          <select
            className="select" value={master} disabled={running} aria-label="Cuenta maestra"
            onChange={e => setDraft(d => ({ ...d, master: e.target.value }))}
          >
            {names.map(n => <option key={n} value={n}>{n}{isSim(n) ? '' : ' (real)'}</option>)}
          </select>
        </div>
      </Section>

      <Section title="Seguidoras" footer="Contratos de la seguidora = maestra × multiplicador, redondeando hacia abajo y con un mínimo de 1.">
        {names.filter(n => n !== master).map(n => {
          const f = followerCfg(n);
          return (
            <div className="row follower" key={n}>
              <Toggle on={f.on} disabled={running} onChange={v => setFollower(n, { on: v })} label={`Copiar a ${n}`} />
              <div className="row-main">
                <span className="row-title">{n}</span>
                <span className="row-sub">{isSim(n) ? 'Simulada' : 'Cuenta real'}</span>
              </div>
              <div className="stepper" aria-label={`Multiplicador de ${n}`}>
                <button type="button" disabled={running || f.multiplier <= 0.5} onClick={() => setFollower(n, { multiplier: Math.max(0.5, f.multiplier - 0.5) })} aria-label="Menos"><Minus size={14} /></button>
                <span>×{f.multiplier}</span>
                <button type="button" disabled={running || f.multiplier >= 10} onClick={() => setFollower(n, { multiplier: Math.min(10, f.multiplier + 0.5) })} aria-label="Más"><Plus size={14} /></button>
              </div>
              <label className="inline-check">
                <Toggle on={f.inverse} disabled={running} onChange={v => setFollower(n, { inverse: v })} label={`Inverso en ${n}`} />
                <span>Inverso</span>
              </label>
            </div>
          );
        })}
      </Section>

      <div className="actions">
        {running
          ? <button type="button" className="btn warn" onClick={() => act('copier/stop')}><Pause size={16} /> Detener copiador</button>
          : <button type="button" className="btn primary" disabled={!master || chosen.length === 0} onClick={start}><Play size={16} /> Iniciar copiador</button>}
        <button type="button" className="btn" disabled={!running} onClick={() => act('copier/sync')}><RefreshCw size={16} /> Sincronizar</button>
        <button
          type="button" className="btn danger-ghost" disabled={!running}
          onClick={() => ask({
            title: 'Cerrar posiciones copiadas',
            message: 'Se cerrarán a mercado, en todas las seguidoras, los instrumentos copiados en esta sesión.',
            action: 'Cerrar', destructive: true, onConfirm: () => act('copier/flatten'),
          })}
        >Cerrar copiadas</button>
        <span className="actions-status">
          {running ? <StatusPill kind="good">Activo · {state.copier.master}</StatusPill> : <StatusPill kind="neutral">Detenido</StatusPill>}
          {!connected && <StatusPill kind="warn">Demo</StatusPill>}
        </span>
      </div>

      <Section title="Actividad">
        <div className="log" role="log">
          {state.copier.log.length === 0
            ? <div className="empty">Sin actividad todavía.</div>
            : state.copier.log.map((l, i) => <div key={i} className="log-line">{l}</div>)}
        </div>
      </Section>
    </>
  );
}

function Cuentas({ state }: ViewProps) {
  return (
    <Section title="Cuentas de NinjaTrader">
      {state.accounts.map((a: AccountInfo) => (
        <div className="row account" key={a.name}>
          <div className="row-main">
            <span className="row-title">{a.name} {a.sim ? <StatusPill kind="neutral">Simulada</StatusPill> : <StatusPill kind="bad">Real</StatusPill>}</span>
            <span className="row-sub">
              {a.positions.length === 0 ? 'Sin posiciones'
                : a.positions.map(p => `${p.instrument} ${p.qty > 0 ? '+' : ''}${p.qty} @ ${p.avgPrice}`).join(' · ')}
            </span>
          </div>
          <div className="acct-nums">
            <span><small>Saldo</small>{usd(a.cash)}</span>
            <span className={tone(a.realized)}><small>Realizado</small>{signedUsd(a.realized)}</span>
            <span className={tone(a.unrealized)}><small>Abierto</small>{signedUsd(a.unrealized)}</span>
          </div>
        </div>
      ))}
    </Section>
  );
}

function Resultados() {
  const total = GOATPRO_RESULTS.reduce((s, r) => s + r.net, 0);
  return (
    <>
      <Section title="GoatPro · backtest 2026 (MNQ M5, 20/16 ct, TP 1.500 $ / SL 2.000 $)">
        <div className="tiles inset">
          {GOATPRO_RESULTS.map(r => <Tile key={r.period} label={r.period} value={signedUsd(r.net)} valueTone={tone(r.net)} />)}
          <Tile label="Total" value={signedUsd(total)} valueTone={tone(total)} sub="Gana en los dos periodos" />
        </div>
        <table className="table">
          <thead><tr><th>Periodo</th><th>Total</th><th>Largos</th><th>Cortos</th></tr></thead>
          <tbody>
            {GOATPRO_RESULTS.map(r => (
              <tr key={r.period}>
                <td>{r.period}</td>
                <td className={tone(r.net)}>{signedUsd(r.net)}</td>
                <td className={tone(r.long)}>{signedUsd(r.long)}</td>
                <td className={tone(r.short)}>{signedUsd(r.short)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title="JetF1 · laboratorio" footer="Resultados de backtest con datos de 2026. No garantizan resultados futuros.">
        <div className="row">
          <span className="kill-icon muted-icon"><Activity size={20} /></span>
          <div className="row-main">
            <span className="row-title">Ninguna combinación estable</span>
            <span className="row-sub">3.600 combinaciones Ruptura/Fade × ticks × TP × SL: ninguna con profit factor &gt; 1,2 en enero–junio y en julio–octubre.</span>
          </div>
          <StatusPill kind="bad">No recomendada</StatusPill>
        </div>
      </Section>
    </>
  );
}

type ViewProps = {
  state: BridgeState;
  connected: boolean;
  ask: (c: Confirm) => void;
  act: (path: string, body?: unknown) => void;
};

// ------------------------------------------------------------------ app
export default function Panel() {
  const { state, connected, checked, run } = useBridge();
  const [view, setView] = useState<View>(() => readLocal<View>('cc-panel-view', 'resumen'));
  const [theme, setTheme] = useState<Theme>(() => readLocal<Theme>('cc-panel-theme', 'auto'));
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);

  useEffect(() => writeLocal('cc-panel-view', view), [view]);
  useEffect(() => {
    writeLocal('cc-panel-theme', theme);
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const act = useCallback((path: string, body?: unknown) => {
    run(path, body)
      .then(text => setToast({ text }))
      .catch((e: unknown) => setToast({ text: e instanceof Error ? e.message : 'Error', error: true }));
  }, [run]);

  const props: ViewProps = { state, connected, ask: setConfirm, act };
  const title = useMemo(() => NAV.find(n => n.id === view)?.label ?? '', [view]);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">◆</span> Command</div>
        <nav className="nav" aria-label="Secciones">
          {NAV.map(n => (
            <button
              key={n.id} type="button" className={`nav-item${view === n.id ? ' active' : ''}`}
              aria-current={view === n.id ? 'page' : undefined} onClick={() => setView(n.id)}
            >{n.icon}<span>{n.label}</span></button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="segmented" role="radiogroup" aria-label="Apariencia">
            {(['auto', 'light', 'dark'] as Theme[]).map(t => (
              <button key={t} type="button" role="radio" aria-checked={theme === t} className={theme === t ? 'on' : ''} onClick={() => setTheme(t)}>
                {t === 'auto' ? 'Auto' : t === 'light' ? 'Claro' : 'Oscuro'}
              </button>
            ))}
          </div>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <h1>{title}</h1>
          {checked && (connected
            ? <StatusPill kind="good">NinjaTrader conectado</StatusPill>
            : <StatusPill kind="warn">Modo demo · sin conexión</StatusPill>)}
        </header>

        {checked && !connected && (
          <div className="callout demo">
            <Info size={18} />
            <div>
              <b>Datos de ejemplo.</b> No hay conexión con NinjaTrader en <code>{BRIDGE_URL}</code>, así que los botones no envían órdenes.
              Abre NinjaTrader con el AddOn <b>CCCommandCenter</b> instalado y el panel se conectará solo.
            </div>
          </div>
        )}

        {view === 'resumen' && <Resumen {...props} go={setView} />}
        {view === 'estrategias' && <Estrategias {...props} />}
        {view === 'copiador' && <Copiador {...props} />}
        {view === 'cuentas' && <Cuentas {...props} />}
        {view === 'resultados' && <Resultados />}
      </main>

      {confirm && <ConfirmSheet c={confirm} onClose={() => setConfirm(null)} />}
      {toast && <div className={`toast${toast.error ? ' error' : ''}`} role="status">{toast.text}</div>}
    </div>
  );
}
