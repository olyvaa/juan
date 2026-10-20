import { useEffect, useState, useSyncExternalStore } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Check, ChevronRight, Eye, EyeOff, Minus, Pause, Pencil, Play, Plus, RotateCcw, Rocket, ShoppingBag, Trash2, X } from 'lucide-react';
import { DEFAULT_SCHEDULE, getEngine, type Engine, type Account, type AccountStatus, type Direction, type Group, type GroupMode, type Member, type Schedule } from './engine';
import { SOURCES, connectionMatches, type SourceId } from './market';
import type { AccountInfo } from '../panel/api';
import { PLANS, RULES, fmtNy, planById, tradingDay, type Plan } from './plans';
import { STRATEGY_INFO, type StrategyKey } from './strategies';
import { Section, StatusPill, Tile, Toggle, type Confirm } from '../panel/ui';
import { signedUsd, tone, usd } from '../panel/format';

function useEngine() {
  const e = getEngine();
  useSyncExternalStore(e.subscribe, e.getVersion);
  return e;
}

type Props = { ask: (c: Confirm) => void; notify: (text: string, error?: boolean) => void };
/** Cuentas que da NinjaTrader por el puente (vacío si no está conectado). */
type NtProps = { ntAccounts: AccountInfo[]; ntConnected: boolean };

const STATUS: Record<AccountStatus, { label: string; kind: 'good' | 'warn' | 'bad' | 'neutral' }> = {
  evaluacion: { label: 'Evaluación', kind: 'neutral' },
  superada: { label: 'Superada', kind: 'good' },
  fondeada: { label: 'Fondeada', kind: 'good' },
  quemada: { label: 'Quemada', kind: 'bad' },
};

function Stepper({ value, min, max, step = 1, onChange, label, suffix = '' }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; label: string; suffix?: string }) {
  return (
    <div className="stepper" aria-label={label}>
      <button type="button" disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))} aria-label="Menos"><Minus size={14} /></button>
      <span>{value}{suffix}</span>
      <button type="button" disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))} aria-label="Más"><Plus size={14} /></button>
    </div>
  );
}

/** Etiqueta pequeña de "simulado", obligatoria en todo Juanitos Funding. */
export function JfBadge() {
  return <span className="jf-badge">Juanitos Funding · simulado</span>;
}

// ------------------------------------------------------------------ Tienda
export function Tienda({ ask }: Props) {
  const e = useEngine();
  const [qty, setQty] = useState<Record<string, number>>({});
  const bought = e.state.accounts.length;
  const buy = (p: Plan) => {
    const n = qty[p.id] || 1;
    ask({
      title: `Comprar ${n} × ${p.name}`,
      message: <>Total: <b>{usd(p.price * n)}</b> ficticios. Las cuentas se crean al momento en <b>Mis cuentas</b>, en fase de evaluación.</>,
      action: 'Comprar', onConfirm: () => e.buy(p, n),
    });
  };
  return (
    <>
      <div className="jf-hero">
        <div>
          <span className="jf-logo">JF</span>
          <h2>Juanitos Funding</h2>
          <p>Prop firm simulada. Cuentas con las reglas de LucidFlex para probar el bot sin arriesgar nada.</p>
        </div>
        <div className="jf-hero-stats">
          <Tile label="Cuentas compradas" value={bought} />
          <Tile label="Gastado (ficticio)" value={usd(e.state.spent)} />
        </div>
      </div>

      <div className="plans">
        {PLANS.map(p => (
          <article className="plan" key={p.id}>
            <header>
              <span className="plan-kicker">LucidFlex</span>
              <h3>{p.name}</h3>
              <p className="plan-price">{usd(p.price)} <small>ficticios</small></p>
            </header>
            <dl className="plan-rules">
              <div><dt>Capital</dt><dd>{usd(p.size)}</dd></div>
              <div><dt>Objetivo</dt><dd>{usd(p.target)}</dd></div>
              <div><dt>Pérdida máxima</dt><dd>{usd(p.maxLoss)} <small>trailing al cierre</small></dd></div>
              <div><dt>Pérdida diaria</dt><dd>Sin límite</dd></div>
              <div><dt>Consistencia</dt><dd>Mejor día ≤ 50 %</dd></div>
              <div><dt>Máx. contratos</dt><dd>{p.maxMicros} micros MNQ</dd></div>
            </dl>
            <div className="plan-buy">
              <Stepper label={`Cantidad de ${p.name}`} value={qty[p.id] || 1} min={1} max={20} onChange={v => setQty(q => ({ ...q, [p.id]: v }))} />
              <button type="button" className="btn primary" onClick={() => buy(p)}><ShoppingBag size={16} /> Comprar</button>
            </div>
          </article>
        ))}
      </div>
      <p className="group-foot">
        Condiciones según reseñas públicas de LucidFlex (2026); los precios son orientativos y ficticios.
        Supuestos de la simulación: comisión {RULES.commissionPerMicroRT} $ por micro, {RULES.slippageTicks} tick de deslizamiento,
        cierre obligatorio a las {RULES.flattenAt} NY y el trailing se bloquea en el saldo inicial.
      </p>
    </>
  );
}

// ------------------------------------------------------------------ Mis cuentas
function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)}>
      <div className="meter-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

function AccountRow({ a, e, ask }: { a: Account; e: Engine; ask: (c: Confirm) => void }) {
  const plan = planById(a.planId)!;
  const unreal = e.unrealized(a);
  const equity = a.balance + unreal;
  const profit = a.balance - a.start;
  const { best, total } = e.consistency(a);
  const group = e.groupOf(a.id);
  const st = STATUS[a.status];
  return (
    <details className="acct">
      <summary className="row">
        <div className="row-main">
          <span className="row-title">{a.id} <StatusPill kind={st.kind}>{st.label}</StatusPill>{group && <span className="chip">{group.name}</span>}</span>
          <span className="row-sub">
            {plan.name} · {a.position ? `${a.position.side > 0 ? 'Largo' : 'Corto'} ${a.position.qty} @ ${a.position.entry}` : 'Sin posición'}
            {' · '}{a.trades.length} operaciones
          </span>
        </div>
        <div className="acct-nums">
          <span><small>Saldo</small>{usd(a.balance)}</span>
          <span className={tone(profit)}><small>Resultado</small>{signedUsd(profit)}</span>
          <span className={tone(unreal)}><small>Abierto</small>{a.position && !e.priced(a) ? 'sin precio' : signedUsd(unreal)}</span>
          <span><small>Margen hasta pérdida máx.</small>{usd(Math.max(0, equity - a.floor))}</span>
        </div>
      </summary>
      <div className="acct-detail">
        {a.status === 'evaluacion' && (
          <div className="progress">
            <div className="progress-head"><span>Objetivo {usd(plan.target)}</span><span>{signedUsd(profit)}</span></div>
            <Meter value={Math.max(0, profit)} max={plan.target} label="Progreso hacia el objetivo" />
            <span className="muted">Consistencia: mejor día {usd(best)} · máximo permitido {usd(Math.max(0, total) * RULES.consistency)}</span>
          </div>
        )}
        <dl className="facts">
          <div><dt>Suelo</dt><dd>{usd(a.floor)} (trailing al cierre del día)</dd></div>
          <div><dt>Comisiones</dt><dd>{usd(a.fees)}</dd></div>
        </dl>
        <div className="actions">
          {a.status === 'superada' && (
            <button type="button" className="btn primary" onClick={() => e.activateFunded(a.id)}><Rocket size={16} /> Activar cuenta fondeada</button>
          )}
          {a.position && <button type="button" className="btn" onClick={() => e.closeAccount(a.id)}>Cerrar posición</button>}
          <button
            type="button" className="btn" disabled={!!group}
            title={group ? 'Detén antes su grupo' : undefined}
            onClick={() => ask({ title: `Reiniciar ${a.id}`, message: 'Vuelve al saldo inicial, en evaluación y sin historial de operaciones.', action: 'Reiniciar', onConfirm: () => e.resetAccount(a.id) })}
          ><RotateCcw size={15} /> Reiniciar</button>
          <button
            type="button" className="btn danger-ghost" disabled={!!group}
            title={group ? 'Quítala antes del grupo activo' : undefined}
            onClick={() => ask({ title: `Eliminar ${a.id}`, message: 'Se borra la cuenta y su historial.', action: 'Eliminar', destructive: true, onConfirm: () => e.deleteAccount(a.id) })}
          ><Trash2 size={15} /> Eliminar</button>
        </div>
        {a.trades.length > 0 && (
          <table className="table compact">
            <thead><tr><th>Cierre (NY)</th><th>Estrategia</th><th>Lado</th><th>Ct</th><th>Entrada</th><th>Salida</th><th>Motivo</th><th>Resultado</th></tr></thead>
            <tbody>
              {a.trades.slice(0, 15).map(t => (
                <tr key={t.id}>
                  <td>{fmtNy(t.exitT)}</td><td>{STRATEGY_INFO[t.strategy].name}</td><td>{t.side > 0 ? 'Largo' : 'Corto'}</td>
                  <td>{t.qty}</td><td>{t.entry}</td><td>{t.exit}</td><td>{t.reason}</td>
                  <td className={tone(t.pnl)}>{signedUsd(t.pnl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </details>
  );
}

// ---- cuentas de examen REALES: el PnL lo da NinjaTrader
function RealAccounts({ ntAccounts, ntConnected, ask }: NtProps & { ask: Props['ask'] }) {
  const e = useEngine();
  const [pick, setPick] = useState('');
  const [planId, setPlanId] = useState(PLANS[1].id);
  const tracked = Object.keys(e.state.real);
  const available = ntAccounts.filter(a => !a.sim && !e.state.real[a.name]);

  useEffect(() => { for (const a of ntAccounts) if (e.state.real[a.name]) e.observeReal(a.name, a.cash); }, [ntAccounts, e]);

  return (
    <Section
      title="Cuentas reales (NinjaTrader)"
      footer="Saldo, PnL y posiciones vienen de NinjaTrader en directo. El objetivo y el suelo de pérdida los calcula el panel con las reglas del plan; la cifra oficial es la de tu prop firm."
    >
      {!ntConnected && <div className="empty">Abre NinjaTrader con el AddOn para ver aquí el PnL de tus cuentas de examen reales.</div>}
      {tracked.map(name => {
        const r = e.state.real[name];
        const plan = planById(r.planId)!;
        const nt = ntAccounts.find(a => a.name === name);
        const profit = nt ? nt.cash - r.start : 0;
        const equity = nt ? nt.cash + nt.unrealized : 0;
        const st = !nt ? { label: 'Sin datos', kind: 'neutral' as const }
          : equity <= r.floor ? { label: 'Límite superado', kind: 'bad' as const }
          : profit >= plan.target ? { label: 'Objetivo alcanzado', kind: 'good' as const }
          : { label: 'Evaluación', kind: 'neutral' as const };
        return (
          <div className="row account" key={name}>
            <div className="row-main">
              <span className="row-title">{name} <span className="chip real">Real · NinjaTrader</span> <StatusPill kind={st.kind}>{st.label}</StatusPill></span>
              <span className="row-sub">
                {plan.name} · {nt ? (nt.positions.length ? nt.positions.map(p => `${p.instrument} ${p.qty > 0 ? '+' : ''}${p.qty} @ ${p.avgPrice}`).join(' · ') : 'Sin posición') : 'NinjaTrader no conectado'}
              </span>
              {nt && <Meter value={Math.max(0, profit)} max={plan.target} label={`Progreso de ${name} hacia el objetivo`} />}
            </div>
            <div className="acct-nums">
              <span><small>Saldo</small>{nt ? usd(nt.cash) : '—'}</span>
              <span className={tone(profit)}><small>Resultado</small>{nt ? signedUsd(profit) : '—'}</span>
              <span className={tone(nt?.realized || 0)}><small>PnL día</small>{nt ? signedUsd(nt.realized) : '—'}</span>
              <span className={tone(nt?.unrealized || 0)}><small>Abierto</small>{nt ? signedUsd(nt.unrealized) : '—'}</span>
              <span><small>Margen hasta pérdida máx.</small>{nt ? usd(Math.max(0, equity - r.floor)) : '—'}</span>
            </div>
            <button type="button" className="icon-btn" aria-label={`Dejar de seguir ${name}`} title="Dejar de seguir"
              onClick={() => ask({ title: `Dejar de seguir ${name}`, message: 'Solo se quita del panel. La cuenta de NinjaTrader no se toca.', action: 'Quitar', onConfirm: () => e.untrackReal(name) })}
            ><X size={16} /></button>
          </div>
        );
      })}
      {ntConnected && available.length > 0 && (
        <div className="row add-real">
          <span className="row-sub">Seguir una cuenta de examen:</span>
          <select className="select" value={pick} onChange={ev => setPick(ev.target.value)} aria-label="Cuenta de NinjaTrader">
            <option value="">Elige cuenta…</option>
            {available.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
          </select>
          <select className="select" value={planId} onChange={ev => setPlanId(ev.target.value)} aria-label="Plan">
            {PLANS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button type="button" className="btn primary" disabled={!pick} onClick={() => { e.trackReal(pick, planId, planById(planId)!.size); setPick(''); }}>Añadir</button>
        </div>
      )}
      {ntConnected && tracked.length === 0 && available.length === 0 && <div className="empty">NinjaTrader no tiene cuentas reales (todas son Sim).</div>}
    </Section>
  );
}

export function MisCuentas({ ask, ntAccounts, ntConnected }: Props & NtProps) {
  const e = useEngine();
  const accts = e.state.accounts;
  const totalProfit = accts.reduce((s, a) => s + (a.balance - a.start) + e.unrealized(a), 0);
  const count = (s: AccountStatus) => accts.filter(a => a.status === s).length;
  const real = <RealAccounts ntAccounts={ntAccounts} ntConnected={ntConnected} ask={ask} />;
  if (accts.length === 0) return <>{real}<Section title="Cuentas simuladas (Juanitos Funding)"><div className="empty">Aún no tienes cuentas simuladas. Cómpralas en la <b>Tienda</b>.</div></Section></>;
  return (
    <>
      {real}
      <div className="tiles">
        <Tile label="Resultado total" value={signedUsd(totalProfit)} valueTone={tone(totalProfit)} sub="Incluye posiciones abiertas" />
        <Tile label="En evaluación" value={count('evaluacion')} sub={`${count('superada')} superadas`} />
        <Tile label="Fondeadas" value={count('fondeada')} />
        <Tile label="Quemadas" value={count('quemada')} />
      </div>
      <Section
        title="Cuentas simuladas (Juanitos Funding)"
        footer="Pulsa una cuenta para ver su progreso, el suelo de pérdida y sus operaciones."
        action={
          <div className="actions tight">
            <button type="button" className="btn small" onClick={() => ask({ title: 'Reiniciar todas las cuentas', message: 'Se detienen los grupos y todas las cuentas vuelven al saldo inicial, en evaluación y sin historial.', action: 'Reiniciar todas', destructive: true, onConfirm: () => e.resetAllAccounts() })}><RotateCcw size={14} /> Reiniciar todas</button>
            <button type="button" className="btn small danger-ghost" onClick={() => ask({ title: 'Borrar todo Juanitos Funding', message: 'Se borran todas las cuentas simuladas, los grupos, el gasto y el historial. Las cuentas reales de NinjaTrader que sigues no se tocan.', action: 'Borrar todo', destructive: true, onConfirm: () => e.wipeAll() })}><Trash2 size={14} /> Borrar todo</button>
          </div>
        }
      >
        {accts.map(a => <AccountRow key={a.id} a={a} e={e} ask={ask} />)}
      </Section>
    </>
  );
}


// ------------------------------------------------------------------ Grupos
const DIRECTIONS: { id: Direction; label: string }[] = [
  { id: 'ambas', label: 'Ambas' }, { id: 'largos', label: 'Solo largos' }, { id: 'cortos', label: 'Solo cortos' },
];

const TIMEFRAMES = [1, 3, 5, 10, 15];
const ASSETS = [{ id: 'MNQ', ok: true }, { id: 'MES', ok: false }, { id: 'MYM', ok: false }];

/** Tipos de rotación del asistente (modo + bucle del motor). */
type RotKind = 'simple' | 'bucle' | 'cuenta' | 'todas';
const ROTATIONS: { id: RotKind; label: string; note: string }[] = [
  { id: 'simple', label: 'Rotación simple (parar al terminar)', note: 'Cada operación la hace la siguiente cuenta de la lista. Al llegar a la última, el grupo se detiene hasta que lo vuelvas a activar.' },
  { id: 'bucle', label: 'Rotación en el grupo (BUCLE)', note: 'Igual que la simple, pero al terminar la lista vuelve a empezar por la primera.' },
  { id: 'cuenta', label: 'Rotación en la cuenta', note: 'Opera solo la primera cuenta, en todas las señales, hasta que supera la evaluación o se quema; entonces entra la siguiente.' },
  { id: 'todas', label: 'Todas a la vez', note: 'Todas las cuentas del grupo reciben cada señal.' },
];
const rotOf = (mode: GroupMode, loop: boolean): RotKind => (mode === 'rot' ? (loop ? 'bucle' : 'simple') : mode === 'eval' ? 'cuenta' : 'todas');
const modeOf = (r: RotKind): { mode: GroupMode; loop: boolean } =>
  r === 'simple' ? { mode: 'rot', loop: false } : r === 'bucle' ? { mode: 'rot', loop: true } : r === 'cuenta' ? { mode: 'eval', loop: false } : { mode: 'all', loop: false };

const modeLabel = (g: Group) => {
  const n = Math.max(1, g.batch || 1);
  const base = ROTATIONS.find(r => r.id === rotOf(g.mode, g.loop))!.label;
  return g.mode !== 'all' && n > 1 ? `${base} · ${n} por operación` : base;
};

type Cell = { qty: string; tp: string; sl: string };
type WizardValues = {
  name: string; source: SourceId; strategy: StrategyKey; direction: Direction; tf: number;
  rot: RotKind; batch: number; schedule: Schedule; accountIds: string[]; cells: Record<string, Cell>;
};

const STEPS = ['Nombre', 'Conexión', 'Estrategia', 'Rotación', 'Cuentas', 'Confirmar'];
const num = (s: string) => { const n = Number(String(s).replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : 0; };

function initialValues(e: Engine, g?: Group): WizardValues {
  if (!g) return { name: '', source: e.state.source, strategy: 'gyr', direction: 'ambas', tf: 3, rot: 'simple', batch: 1, schedule: { ...DEFAULT_SCHEDULE }, accountIds: [], cells: {} };
  const cells: Record<string, Cell> = {};
  for (const id of g.accountIds) { const m = g.members[id]; cells[id] = { qty: String(m?.qty ?? g.qty), tp: String(m?.tpUsd ?? g.tpUsd), sl: String(m?.slUsd ?? g.slUsd) }; }
  return { name: g.name, source: e.state.source, strategy: g.strategy, direction: g.direction, tf: g.tf, rot: rotOf(g.mode, g.loop), batch: Math.max(1, g.batch || 1), schedule: g.schedule || { ...DEFAULT_SCHEDULE }, accountIds: [...g.accountIds], cells };
}

/** Ventana de configuración de la estrategia: activo, temporalidad y dirección (obligatorio). */
function StrategyConfig({ v, onDone, onCancel }: { v: WizardValues; onDone: (p: Partial<WizardValues>) => void; onCancel: () => void }) {
  const jet = v.strategy === 'jetf1';
  const [tf, setTf] = useState(jet ? 1 : v.tf);
  const [dir, setDir] = useState<Direction>(v.direction);
  useEffect(() => {
    const k = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { ev.stopPropagation(); onCancel(); } };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [onCancel]);
  return (
    <div className="sheet-backdrop top" onMouseDown={ev => { if (ev.target === ev.currentTarget) onCancel(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="cfg-title">
        <h3 id="cfg-title">Configurar {STRATEGY_INFO[v.strategy].name}</h3>
        <p className="sheet-body">Elige activo y temporalidad. Sin esto no se puede continuar.</p>
        <span className="wz-label">Activo</span>
        <div className="chip-pick">
          {ASSETS.map(a => <button key={a.id} type="button" className={a.id === 'MNQ' ? 'on' : ''} disabled={!a.ok} title={a.ok ? undefined : 'Por ahora el simulador solo tiene el MNQ'}>{a.id}</button>)}
        </div>
        <span className="wz-label">Temporalidad</span>
        <div className="chip-pick">
          {(jet ? [1] : TIMEFRAMES).map(m => <button key={m} type="button" aria-pressed={tf === m} className={tf === m ? 'on' : ''} onClick={() => setTf(m)}>M{m}</button>)}
        </div>
        {jet && <span className="muted small">JetF1 funciona siempre con velas de 1 minuto.</span>}
        {v.strategy === 'goatpro' && tf !== 5 && <span className="muted small">GoatPro se validó con velas de 5 minutos.</span>}
        <span className="wz-label">Dirección</span>
        <div className="chip-pick">
          {DIRECTIONS.map(d => <button key={d.id} type="button" aria-pressed={dir === d.id} className={dir === d.id ? 'on' : ''} onClick={() => setDir(d.id)}>{d.label}</button>)}
        </div>
        <div className="sheet-actions">
          <button type="button" className="btn" onClick={onCancel}>Cancelar</button>
          <button type="button" className="btn primary" onClick={() => onDone({ tf, direction: dir })}>Listo</button>
        </div>
      </div>
    </div>
  );
}

/** Asistente de 6 pasos para crear o editar un grupo. */
function GroupWizard({ e, editing, onClose, notify }: { e: Engine; editing?: Group; onClose: () => void; notify: Props['notify'] }) {
  const [v, setV] = useState<WizardValues>(() => initialValues(e, editing));
  const [step, setStep] = useState(0);
  const [configured, setConfigured] = useState(!!editing);
  const [config, setConfig] = useState(false);
  const [fill, setFill] = useState<Cell>({ qty: '', tp: '', sl: '' });
  const set = (p: Partial<WizardValues>) => setV(x => ({ ...x, ...p }));
  const setCell = (id: string, p: Partial<Cell>) => setV(x => ({ ...x, cells: { ...x.cells, [id]: { ...x.cells[id], ...p } } }));

  useEffect(() => {
    const k = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && !config) onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose, config]);

  const usable = e.state.accounts.filter(a => a.status === 'evaluacion' || a.status === 'fondeada');
  const available = usable.filter(a => !v.accountIds.includes(a.id));
  const add = (id: string) => setV(x => ({ ...x, accountIds: [...x.accountIds, id], cells: { ...x.cells, [id]: x.cells[id] || { qty: '', tp: '', sl: '' } } }));
  const remove = (id: string) => set({ accountIds: v.accountIds.filter(x => x !== id) });
  const move = (id: string, d: -1 | 1) => {
    const ids = [...v.accountIds]; const i = ids.indexOf(id), j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]]; set({ accountIds: ids });
  };
  const missing = v.accountIds
    .map(id => ({ id, f: (['qty', 'tp', 'sl'] as const).filter(k => !num(v.cells[id]?.[k] ?? '')).map(k => (k === 'qty' ? 'Ct' : k.toUpperCase())) }))
    .filter(x => x.f.length);

  const ntLive = e.market.ntConnections.some(c => c.price === 'Connected' && connectionMatches(c.name, e.state.ntConnection));
  const openPositions = e.state.accounts.some(a => a.position);
  const conns: { id: SourceId; title: string; sub: string; ok: boolean }[] = [
    { id: 'nt', title: `NinjaTrader · ${e.state.ntConnection || 'sin conexión elegida'}`, sub: ntLive ? 'Precio del MNQ en tiempo real · Enlace establecido' : 'Precio del MNQ en tiempo real · No conectada ahora', ok: ntLive },
    { id: 'yahoo', title: 'MNQ real (Yahoo)', sub: 'Unos 10 minutos de retraso · para pruebas', ok: true },
    { id: 'sim-live', title: 'Mercado simulado', sub: 'Precio inventado a velocidad real', ok: true },
    { id: 'sim-fast', title: 'Mercado simulado rápido', sub: 'Precio inventado 60× más rápido', ok: true },
  ];
  const conn = conns.find(c => c.id === v.source)!;
  const info = STRATEGY_INFO[v.strategy];
  const rot = ROTATIONS.find(r => r.id === v.rot)!;

  const valid = [
    v.name.trim().length > 0,
    true,
    configured,
    true,
    v.accountIds.length > 0 && missing.length === 0,
    true,
  ];
  const why = ['Ponle un nombre al grupo', '', 'Configura la estrategia (activo y temporalidad)', '', v.accountIds.length === 0 ? 'Añade al menos una cuenta' : 'Completa Ct, TP y SL de todas las cuentas', ''];
  const next = () => {
    if (!valid[step]) { notify(why[step], true); return; }
    if (step < STEPS.length - 1) setStep(step + 1); else save();
  };
  const canJump = (i: number) => i <= step || valid.slice(0, i).every(Boolean);

  const save = () => {
    const { mode, loop } = modeOf(v.rot);
    const first = v.cells[v.accountIds[0]];
    const tf = v.strategy === 'jetf1' ? 1 : v.tf;
    const common = { name: v.name.trim(), strategy: v.strategy, direction: v.direction, accountIds: v.accountIds, mode, batch: Math.max(1, v.batch), loop, tf, schedule: v.schedule };
    let gid = editing?.id;
    if (editing) e.updateGroup(editing.id, common);
    else gid = e.createGroup({ ...common, qty: num(first.qty), tpUsd: num(first.tp), slUsd: num(first.sl) });
    for (const id of v.accountIds) e.updateMember(gid!, id, { qty: num(v.cells[id].qty), tpUsd: num(v.cells[id].tp), slUsd: num(v.cells[id].sl) });
    if (v.source !== e.state.source) e.setSource(v.source);
    notify(editing ? `Grupo "${common.name}" actualizado` : `Grupo "${common.name}" creado. Pulsa Activar para que empiece a operar.`);
    onClose();
  };

  const same = (k: keyof Cell) => { const vals = new Set(v.accountIds.map(id => v.cells[id]?.[k])); return vals.size === 1 ? [...vals][0] : null; };
  const sameLabel = (k: keyof Cell, unit: string) => { const s = same(k); return s === null ? 'Distinto en cada cuenta' : s ? `${s}${unit}` : '—'; };

  return (
    <div className="sheet-backdrop" onMouseDown={ev => { if (ev.target === ev.currentTarget) onClose(); }}>
      <div className="wizard" role="dialog" aria-modal="true" aria-labelledby="wz-title">
        <header className="wz-head">
          <h3 id="wz-title">{editing ? 'Editar grupo' : 'Nuevo grupo'} · {STEPS[step]}</h3>
          <button type="button" className="icon-btn" aria-label="Cerrar" onClick={onClose}><X size={16} /></button>
        </header>
        <nav className="wz-steps" aria-label="Pasos">
          {STEPS.map((s, i) => (
            <button key={s} type="button" disabled={!canJump(i)} aria-current={i === step ? 'step' : undefined}
              className={`wz-step${i === step ? ' current' : i < step ? ' done' : ''}`} onClick={() => setStep(i)}>
              <span className="wz-num">{i < step ? <Check size={12} /> : i + 1}</span>{s}
            </button>
          ))}
        </nav>

        <div className="wz-body">
          {step === 0 && (
            <div className="wz-card">
              <label className="field"><span className="wz-label">Nombre <i>*</i></span>
                <input className="input" autoFocus value={v.name} placeholder="Cómo quieres llamar al grupo"
                  onChange={ev => set({ name: ev.target.value })} onKeyDown={ev => { if (ev.key === 'Enter') next(); }} />
              </label>
              <p className="muted small">Paso 1 · Identifica el grupo en Operaciones y en Grupos.</p>
            </div>
          )}

          {step === 1 && (
            <div className="wz-card">
              <span className="wz-label">Conexión <i>*</i></span>
              <p className="muted small">De dónde lee el bot el precio del MNQ. Es la misma para todos los grupos de Juanitos Funding.</p>
              <div className="wz-options">
                {conns.map(c => (
                  <button key={c.id} type="button" aria-pressed={v.source === c.id} className={`wz-option${v.source === c.id ? ' on' : ''}`} onClick={() => set({ source: c.id })}>
                    <span className={`wz-dot ${c.ok ? 'good' : 'bad'}`} />
                    <span><b>{c.title}</b><small>{c.sub}</small></span>
                  </button>
                ))}
              </div>
              {v.source !== e.state.source && openPositions && (
                <div className="callout"><AlertTriangle size={18} /><div>Al guardar se cambia la fuente de precio y <b>se cierran las posiciones abiertas</b> de todos los grupos.</div></div>
              )}
              {v.source === 'nt' && !ntLive && <p className="muted small">Puedes crear el grupo igualmente: el bot no abrirá operaciones hasta que la conexión esté activa (míralo en Mercado).</p>}
            </div>
          )}

          {step === 2 && (
            <div className="wz-card">
              <span className="wz-label">Estrategia <i>*</i></span>
              <p className="muted small">Todas validadas. Al elegir una, configura activo y temporalidad.</p>
              <div className="wz-options">
                {(Object.keys(STRATEGY_INFO) as StrategyKey[]).map(k => (
                  <button key={k} type="button" aria-pressed={v.strategy === k} className={`wz-option tall${v.strategy === k ? ' on' : ''}`}
                    onClick={() => { set({ strategy: k, tf: k === 'jetf1' ? 1 : v.strategy === 'jetf1' ? 3 : v.tf }); if (k !== v.strategy) setConfigured(false); setConfig(true); }}>
                    <span>
                      <b>{STRATEGY_INFO[k].name} · MNQ{v.strategy === k && configured ? ` · M${k === 'jetf1' ? 1 : v.tf} · ${DIRECTIONS.find(d => d.id === v.direction)?.label}` : ''}</b>
                      <small>{STRATEGY_INFO[k].note}</small>
                    </span>
                  </button>
                ))}
              </div>
              {configured
                ? <button type="button" className="btn small" onClick={() => setConfig(true)}><Pencil size={14} /> Cambiar activo, temporalidad o dirección</button>
                : <p className="warn-text small">Falta configurar la estrategia: pulsa sobre ella.</p>}
            </div>
          )}

          {step === 3 && (
            <div className="wz-card">
              <span className="wz-label">Tipo de rotación <i>*</i></span>
              <p className="muted small">Cómo se reparten las operaciones entre las cuentas del grupo.</p>
              <div className="wz-options">
                {ROTATIONS.map(r => (
                  <button key={r.id} type="button" aria-pressed={v.rot === r.id} className={`wz-option tall${v.rot === r.id ? ' on' : ''}`} onClick={() => set({ rot: r.id })}>
                    <span><b>{r.label}</b>{v.rot === r.id && <small>{r.note}</small>}</span>
                  </button>
                ))}
              </div>
              {v.rot !== 'todas' && (
                <div className="wz-sub">
                  <span className="wz-label">Cuentas por operación</span>
                  <Stepper label="Cuentas por operación" value={Math.max(1, v.batch)} min={1} max={10} onChange={n => set({ batch: n })} />
                </div>
              )}
              <div className="wz-sub">
                <span className="wz-label">Horario (hora de Nueva York)</span>
                <div className="schedule-row">
                  <label className="inline-check">
                    <Toggle on={v.schedule.on} label="Usar horario" onChange={on => set({ schedule: { ...v.schedule, on } })} />
                    <span>{v.schedule.on ? 'Con horario' : 'Sin horario (opera siempre)'}</span>
                  </label>
                  {v.schedule.on && (
                    <>
                      <label className="inline-check"><span>De</span>
                        <input className="input time" type="time" aria-label="Hora de inicio (NY)" value={v.schedule.start} onChange={ev => set({ schedule: { ...v.schedule, start: ev.target.value || '09:30' } })} />
                      </label>
                      <label className="inline-check"><span>a</span>
                        <input className="input time" type="time" aria-label="Hora de fin (NY)" value={v.schedule.end} onChange={ev => set({ schedule: { ...v.schedule, end: ev.target.value || '16:00' } })} />
                      </label>
                      <label className="inline-check">
                        <Toggle on={v.schedule.flatten} label="Cerrar posiciones al terminar el horario" onChange={flatten => set({ schedule: { ...v.schedule, flatten } })} />
                        <span>Cerrar al terminar</span>
                      </label>
                    </>
                  )}
                </div>
                <span className="muted small">{v.schedule.on ? 'En España normalmente son 6 horas más.' : 'Siempre cierra lo abierto a las 16:55 NY.'}</span>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="wz-card">
              <span className="wz-label">Cuentas</span>
              <p className="muted small">Cuentas de Juanitos Funding en evaluación o fondeadas. Ct = contratos MNQ (10 Ct = 1 lote de NQ). TP y SL en $ por operación.</p>
              <div className="wz-sub">
                <div className="wz-sub-head"><span className="wz-label">Cuentas disponibles</span>{available.length > 1 && <button type="button" className="btn small" onClick={() => available.forEach(a => add(a.id))}>Añadir todas</button>}</div>
                {available.length === 0
                  ? <div className="empty">{usable.length === 0 ? 'No tienes cuentas activas. Cómpralas en la Tienda.' : 'Todas las cuentas operables ya están en el ciclo.'}</div>
                  : <div className="wz-avail">
                    {available.map(a => {
                      const busy = e.state.groups.find(g => g.id !== editing?.id && g.accountIds.includes(a.id));
                      return (
                        <button key={a.id} type="button" className="wz-acct" onClick={() => add(a.id)}>
                          <Plus size={14} /><b>{a.id}</b><span className={`phase ${a.status}`}>{STATUS[a.status].label}</span>
                          <small>{usd(a.balance)}{busy ? ` · también en ${busy.name}` : ''}</small>
                        </button>
                      );
                    })}
                  </div>}
              </div>
              <div className="wz-sub">
                <div className="wz-sub-head"><span className="wz-label">Cuentas del ciclo ({v.accountIds.length})</span></div>
                {v.accountIds.length > 1 && (
                  <div className="wz-fill">
                    <span className="muted small">Rellenar todas:</span>
                    <label className="cell-field"><span>Ct</span><input inputMode="numeric" value={fill.qty} onChange={ev => setFill({ ...fill, qty: ev.target.value })} /></label>
                    <label className="cell-field tp"><span>TP</span><input inputMode="decimal" value={fill.tp} onChange={ev => setFill({ ...fill, tp: ev.target.value })} /></label>
                    <label className="cell-field sl"><span>SL</span><input inputMode="decimal" value={fill.sl} onChange={ev => setFill({ ...fill, sl: ev.target.value })} /></label>
                    <button type="button" className="btn small" disabled={!fill.qty && !fill.tp && !fill.sl}
                      onClick={() => setV(x => ({ ...x, cells: Object.fromEntries(x.accountIds.map(id => [id, { qty: fill.qty || x.cells[id]?.qty || '', tp: fill.tp || x.cells[id]?.tp || '', sl: fill.sl || x.cells[id]?.sl || '' }])) }))}>Aplicar</button>
                  </div>
                )}
                {missing.length > 0 && (
                  <div className="callout"><AlertTriangle size={18} /><div><b>Falta completar:</b> {missing.map(m => `${m.id}: ${m.f.join(', ')}`).join(' · ')}</div></div>
                )}
                {v.accountIds.length === 0 && <div className="empty">Pulsa una cuenta disponible para añadirla.</div>}
                <div className="wz-cycle">
                  {v.accountIds.map((id, i) => {
                    const a = e.acc(id);
                    if (!a) return null;
                    const plan = planById(a.planId)!;
                    const c = v.cells[id] || { qty: '', tp: '', sl: '' };
                    const over = num(c.qty) > plan.maxMicros;
                    const risk = num(c.sl) >= plan.maxLoss;
                    const pnl = a.balance - a.start;
                    return (
                      <div key={id} className={`wz-row${missing.some(m => m.id === id) ? ' incomplete' : ''}`}>
                        {v.rot !== 'todas' && (
                          <span className="order-btns">
                            <button type="button" aria-label={`Subir ${id}`} disabled={i === 0} onClick={() => move(id, -1)}><ArrowUp size={12} /></button>
                            <button type="button" aria-label={`Bajar ${id}`} disabled={i === v.accountIds.length - 1} onClick={() => move(id, 1)}><ArrowDown size={12} /></button>
                          </span>
                        )}
                        <span className="wz-row-name"><b>{id}</b><span className={`phase ${a.status}`}>{STATUS[a.status].label}</span></span>
                        <span className="wz-row-money" title={`PnL total ${signedUsd(pnl)}`}>{usd(a.balance)}</span>
                        <span className="wz-row-cells">
                          <label className={`cell-field${over ? ' bad' : ''}`} title={over ? `Máximo ${plan.maxMicros} Ct en ${plan.name}` : undefined}><span>Ct</span><input inputMode="numeric" aria-label={`Ct de ${id}`} placeholder="—" value={c.qty} onChange={ev => setCell(id, { qty: ev.target.value })} /></label>
                          <label className="cell-field tp"><span>TP</span><input inputMode="decimal" aria-label={`TP de ${id}`} placeholder="—" value={c.tp} onChange={ev => setCell(id, { tp: ev.target.value })} /></label>
                          <label className={`cell-field sl${risk ? ' bad' : ''}`} title={risk ? `Un SL de ${usd(num(c.sl))} quema la cuenta (pérdida máxima ${usd(plan.maxLoss)})` : undefined}><span>SL</span><input inputMode="decimal" aria-label={`SL de ${id}`} placeholder="—" value={c.sl} onChange={ev => setCell(id, { sl: ev.target.value })} /></label>
                        </span>
                        <button type="button" className="icon-btn" aria-label={`Quitar ${id}`} onClick={() => remove(id)}><X size={14} /></button>
                      </div>
                    );
                  })}
                </div>
                {v.accountIds.some(id => { const a = e.acc(id); return a && num(v.cells[id]?.qty ?? '') > (planById(a.planId)?.maxMicros ?? 99); }) && <p className="warn-text small">Un Ct en rojo supera el máximo del plan: se guardará con el máximo permitido.</p>}
                {v.accountIds.some(id => { const a = e.acc(id); return a && num(v.cells[id]?.sl ?? '') >= (planById(a.planId)?.maxLoss ?? Infinity); }) && <p className="warn-text small">Un SL en rojo es igual o mayor que la pérdida máxima de la cuenta: un solo stop la quemaría.</p>}
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="wz-card">
              <p className="muted small">Revisa y pulsa {editing ? 'Guardar cambios' : 'Crear grupo'}. El grupo se guarda detenido: después pulsa Activar.</p>
              <dl className="wz-summary">
                <div><dt>Nombre</dt><dd>{v.name.trim()}</dd></div>
                <div><dt>Conexión</dt><dd>{conn.title}</dd></div>
                <div><dt>Estrategia</dt><dd>{info.name} · MNQ · M{v.strategy === 'jetf1' ? 1 : v.tf} · {DIRECTIONS.find(d => d.id === v.direction)?.label}</dd></div>
                <div><dt>Rotación</dt><dd>{rot.label}{v.rot !== 'todas' && v.batch > 1 ? ` · ${v.batch} por operación` : ''}</dd></div>
                <div><dt>Horario</dt><dd>{v.schedule.on ? `${v.schedule.start}–${v.schedule.end} NY${v.schedule.flatten ? ' · cierra al terminar' : ''}` : 'Sin horario'}</dd></div>
                <div><dt>Ct</dt><dd>{sameLabel('qty', ' Ct')}</dd></div>
                <div><dt>TP $</dt><dd>{sameLabel('tp', ' $')}</dd></div>
                <div><dt>SL $</dt><dd>{sameLabel('sl', ' $')}</dd></div>
                <div><dt>Cuentas</dt><dd>{v.accountIds.length}</dd></div>
              </dl>
            </div>
          )}
        </div>

        <footer className="wz-foot">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          {step > 0 && <button type="button" className="btn" onClick={() => setStep(step - 1)}>Atrás</button>}
          <button type="button" className="btn primary" onClick={next}>{step < STEPS.length - 1 ? 'Siguiente' : editing ? 'Guardar cambios' : 'Crear grupo'}</button>
        </footer>
      </div>
      {config && <StrategyConfig v={v} onCancel={() => setConfig(false)} onDone={p => { set(p); setConfigured(true); setConfig(false); }} />}
    </div>
  );
}

/** Celda numérica editable: guarda al salir del campo o con Enter. */
function NumCell({ value, onCommit, disabled, label, placeholder }: { value: number; onCommit: (n: number) => void; disabled?: boolean; label: string; placeholder?: string }) {
  const [text, setText] = useState(value ? String(value) : '');
  useEffect(() => { setText(value ? String(value) : ''); }, [value]);
  const commit = () => { const n = Number(text.replace(',', '.')); if (Number.isFinite(n) && n !== value) onCommit(n); else setText(value ? String(value) : ''); };
  return (
    <input
      className="cell-input" inputMode="decimal" aria-label={label} disabled={disabled} placeholder={placeholder}
      value={text} onChange={ev => setText(ev.target.value)} onBlur={commit}
      onKeyDown={ev => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur(); }}
    />
  );
}

/** Estado de una cuenta dentro del grupo (columna ESTADO). */
function memberState(a: Account, m: Member, today: string, queuePos: number): { label: string; kind: 'good' | 'warn' | 'bad' | 'neutral' | 'live' } {
  if (a.status === 'quemada') return { label: 'MLL', kind: 'bad' };
  if (a.status === 'superada') return { label: 'OBJETIVO', kind: 'good' };
  if (a.position) return { label: a.position.side > 0 ? 'EN LARGO' : 'EN CORTO', kind: 'live' };
  if (m.stopDay === today) return { label: m.stopReason, kind: m.stopReason === 'PDPT' ? 'good' : 'bad' };
  if (!m.enabled) return { label: 'OFF', kind: 'neutral' };
  if (queuePos > 0) return { label: `EN COLA ${queuePos}`, kind: 'warn' };
  if (queuePos < 0) return { label: 'YA OPERÓ', kind: 'neutral' };
  const last = a.trades[0];
  if (last && tradingDay(last.exitT - 60) === today) {
    if (last.reason === 'Take profit') return { label: 'SALIDA TP', kind: 'good' };
    if (last.reason === 'Stop loss') return { label: 'SALIDA SL', kind: 'bad' };
    return { label: 'CERRADA', kind: 'neutral' };
  }
  return { label: 'ESPERANDO', kind: 'neutral' };
}

/** Hora del ordenador (España) para mostrar junto a la de Nueva York. */
const fmtLocal = (t: number) => new Date(t * 1000).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

function GroupMonitor({ g, e, ask, notify }: { g: Group; e: Engine; ask: Props['ask']; notify: Props['notify'] }) {
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const bars = e.market.bars;
  const today = tradingDay(bars.length ? bars[bars.length - 1].t + 60 : Math.floor(Date.now() / 1000));
  const launch = () => { const err = e.launchGroup(g.id); notify(err || `"${g.name}" operando con ${STRATEGY_INFO[g.strategy].name}`, !!err); };
  const tfSec = (g.strategy === 'jetf1' ? 1 : g.tf || 5) * 60;
  const lastClose = bars.length ? bars[bars.length - 1].t + 60 : 0;
  const nextClose = lastClose ? lastClose - (lastClose % tfSec) + tfSec : 0;
  const test = (side: 1 | -1) => ask({
    title: `Operación de prueba: ${side > 0 ? 'compra' : 'venta'}`,
    message: <>Abre ahora una {side > 0 ? 'compra' : 'venta'} a mercado (precio actual) en las cuentas activas de <b>{g.name}</b>, con el CT, TP y SL de cada cuenta. Es simulada: no envía nada a NinjaTrader.</>,
    action: side > 0 ? 'Comprar' : 'Vender',
    onConfirm: () => { const r = e.testTrade(g.id, side); notify(r, r.includes('no abre') || r.includes('ignorada') || r.includes('no hay')); },
  });
  const info = STRATEGY_INFO[g.strategy];
  const active = e.activeMembers(g);
  const waiting = e.queueOf(g);

  return (
    <section className="monitor">
      <header className="monitor-head">
        <div className="monitor-title">
          <span className="monitor-avatar">{g.name.slice(0, 1).toUpperCase()}</span>
          <h3>{g.name}</h3>
          <button type="button" className="icon-btn" aria-label={open ? 'Ocultar cuentas' : 'Mostrar cuentas'} onClick={() => setOpen(!open)}>{open ? <Eye size={16} /> : <EyeOff size={16} />}</button>
        </div>
        <div className="monitor-meta">
          {g.running ? <StatusPill kind="good">ACTIVO</StatusPill> : <StatusPill kind="neutral">INACTIVO</StatusPill>}
          <span>{info.name} · MNQ · M{g.tf}</span>
          <span>{DIRECTIONS.find(d => d.id === g.direction)?.label}</span>
          <span>{modeLabel(g)}</span>
          <span>{g.schedule?.on ? `${g.schedule.start}–${g.schedule.end} NY${g.schedule.flatten ? ' · cierra al final' : ''}` : 'Sin horario'}</span>
          <span>{g.accountIds.length} ctas</span>
          <span className={tone(g.pnl)}>{g.trades} ops · {signedUsd(g.pnl)}</span>
        </div>
        <div className="monitor-check">
          <span><b>Última vela revisada:</b> {g.lastCheck ? `${fmtLocal(g.lastCheck.t)} (${fmtNy(g.lastCheck.t).slice(6)} NY) · ${g.lastCheck.text}` : g.running ? 'esperando el cierre de la primera vela…' : 'el grupo no está activo'}</span>
          {g.running && nextClose > 0 && <span className="muted">Próxima vela: {fmtLocal(nextClose)} ({fmtNy(nextClose).slice(6)} NY)</span>}
        </div>
        <div className="actions tight">
          {g.running
            ? <>
              <button type="button" className="btn warn" onClick={() => e.stopGroup(g.id, false)}><Pause size={16} /> Detener</button>
              <button type="button" className="btn danger-ghost" onClick={() => ask({ title: `Detener y cerrar "${g.name}"`, message: 'Se detiene el grupo y se cierran a mercado sus posiciones abiertas.', action: 'Detener y cerrar', destructive: true, onConfirm: () => e.stopGroup(g.id, true) })}>Detener y cerrar</button>
            </>
            : <button type="button" className="btn primary" onClick={launch}><Play size={16} /> Activar</button>}
          <button type="button" className="btn" disabled={g.running} title={g.running ? 'Detén el grupo para editarlo' : undefined} onClick={() => setEditing(true)}><Pencil size={15} /> Editar</button>
          <button type="button" className="btn" onClick={() => test(1)}>Probar compra</button>
          <button type="button" className="btn" onClick={() => test(-1)}>Probar venta</button>
          <button type="button" className="btn danger-ghost" disabled={g.running}
            onClick={() => ask({ title: `Eliminar "${g.name}"`, message: 'Se borra el grupo. Las cuentas no se tocan.', action: 'Eliminar', destructive: true, onConfirm: () => e.deleteGroup(g.id) })}
          ><Trash2 size={15} /> Eliminar</button>
        </div>
      </header>

      {editing && !g.running && <GroupWizard e={e} editing={g} notify={notify} onClose={() => setEditing(false)} />}

      {open && (
        <div className="monitor-table-wrap">
          <table className="monitor-table">
            <thead>
              <tr>
                <th>Estado</th><th className="left">Cuenta</th><th>Símbolo</th><th>Pos</th><th>Balance</th><th>PnL día</th>
                <th>Último PnL</th><th>Open</th><th title="Contratos MNQ (micros). 10 CT = 1 lote de NQ">CT</th><th>PDLL</th><th>PDPT</th><th>TP $</th><th>SL $</th><th>OPS</th>
              </tr>
            </thead>
            <tbody>
              {g.accountIds.map(id => {
                const a = e.acc(id), m = g.members[id];
                if (!a || !m) return null;
                const unreal = e.unrealized(a);
                const dayPnl = (a.daily[today] || 0) + unreal;
                const last = a.trades[0];
                const qp = waiting.indexOf(id) + 1;
                const st = memberState(a, m, today, g.mode === 'rot' && !active.includes(id) && qp === 0 && m.enabled ? -1 : qp);
                const priced = !a.position || e.priced(a);
                const plan = planById(a.planId)!;
                const slRisk = m.slUsd >= plan.maxLoss;
                const lock = g.running;
                const upd = (patch: Partial<Member>) => e.updateMember(g.id, id, patch);
                return (
                  <tr key={id} className={m.enabled ? '' : 'off'}>
                    <td><span className={`state ${st.kind}`}>{st.label}</span></td>
                    <td className="left">
                      {g.mode !== 'all' && !lock && (
                        <span className="order-btns">
                          <button type="button" aria-label={`Subir ${a.id}`} onClick={() => e.moveMember(g.id, id, -1)}><ArrowUp size={12} /></button>
                          <button type="button" aria-label={`Bajar ${a.id}`} onClick={() => e.moveMember(g.id, id, 1)}><ArrowDown size={12} /></button>
                        </span>
                      )}
                      <span className="acct-name">{a.id}</span>
                      <span className={`phase ${a.status}`}>{STATUS[a.status].label}</span>
                    </td>
                    <td>{a.position ? 'MNQ' : '—'}</td>
                    <td>{a.position ? `${a.position.side > 0 ? '+' : '−'}${a.position.qty}` : '—'}</td>
                    <td>{usd(a.balance)}</td>
                    <td className={tone(dayPnl)}>{priced ? signedUsd(dayPnl) : '—'}</td>
                    <td className={`strong ${tone(last?.pnl || 0)}`}>{last ? signedUsd(last.pnl) : '—'}</td>
                    <td className={tone(unreal)} title={priced ? undefined : 'Sin precio de mercado ahora mismo'}>{priced ? signedUsd(unreal) : '—'}</td>
                    <td><NumCell label={`CT de ${id}`} value={m.qty} disabled={lock} onCommit={n => upd({ qty: n })} /></td>
                    <td><NumCell label={`PDLL de ${id}`} value={m.pdll} disabled={lock} placeholder="—" onCommit={n => upd({ pdll: n })} /></td>
                    <td><NumCell label={`PDPT de ${id}`} value={m.pdpt} disabled={lock} placeholder="—" onCommit={n => upd({ pdpt: n })} /></td>
                    <td><NumCell label={`TP de ${id}`} value={m.tpUsd} disabled={lock} onCommit={n => upd({ tpUsd: n })} /></td>
                    <td className={slRisk ? 'risk' : ''} title={slRisk ? `El SL (${usd(m.slUsd)}) es igual o mayor que la pérdida máxima de la cuenta (${usd(plan.maxLoss)}): un solo stop la quema` : undefined}>
                      <NumCell label={`SL de ${id}`} value={m.slUsd} disabled={lock} onCommit={n => upd({ slUsd: n })} />
                    </td>
                    <td><Toggle on={m.enabled} label={`OPS de ${id}`} onChange={x => upd({ enabled: x })} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function Grupos({ ask, notify }: Props) {
  const e = useEngine();
  const [creating, setCreating] = useState(false);
  const untrusted = e.state.source === 'nt' && !e.market.trusted;
  return (
    <>
      {untrusted && (
        <div className="callout"><AlertTriangle size={18} /><div>
          <b>El bot no está abriendo operaciones: el precio de NinjaTrader no es fiable.</b> {e.market.status.warning || e.market.status.message} Míralo en <b>Mercado</b>.
        </div></div>
      )}
      <div className="groups-intro">
        <button type="button" className="btn primary" onClick={() => setCreating(true)}><Plus size={16} /> Nuevo grupo</button>
        <p className="muted">
          Estrategia + cuentas. En la tabla ajustas cada cuenta: CT (contratos MNQ; 10 CT = 1 lote de NQ), TP $, SL $, PDLL (pérdida del día) y PDPT (objetivo del día).
          Un SL en rojo es igual o mayor que la pérdida máxima de la cuenta: un solo stop la quemaría.
          OPS apaga una cuenta sin sacarla del grupo. Con el grupo activo, Editar y la tabla quedan bloqueados.
        </p>
      </div>
      {creating && <GroupWizard e={e} notify={notify} onClose={() => setCreating(false)} />}
      {e.state.groups.map(g => <GroupMonitor key={g.id} g={g} e={e} ask={ask} notify={notify} />)}
      {e.state.groups.length === 0 && <Section><div className="empty">Aún no hay grupos.</div></Section>}
    </>
  );
}

// ------------------------------------------------------------------ Mercado
function NtConnectionSetting({ e }: { e: Engine }) {
  const [name, setName] = useState(e.state.ntConnection);
  const conns = e.market.ntConnections;
  const live = conns.filter(c => c.price === 'Connected');
  const ok = !!e.state.ntConnection && live.some(c => connectionMatches(c.name, e.state.ntConnection));
  const use = (n: string) => { setName(n); e.setNtConnection(n); };
  return (
    <Section
      title="Conexión de datos de NinjaTrader"
      footer="El bot solo acepta el precio cuando esta conexión (tu cuenta de Lucid) está conectada en NinjaTrader y no hay otras conexiones de datos. Así nunca opera con precios del Simulated Data Feed ni de otra cuenta."
    >
      <div className="row add-real">
        <label className="field grow"><span>Leer el precio solo de</span>
          <input className="input" value={name} onChange={ev => setName(ev.target.value)} placeholder="LTTK7X97T4U" />
        </label>
        <button type="button" className="btn primary" disabled={name.trim() === e.state.ntConnection} onClick={() => e.setNtConnection(name)}>Guardar</button>
        {ok ? <StatusPill kind="good">Conectada</StatusPill> : <StatusPill kind="bad">No conectada</StatusPill>}
      </div>
      {conns.length === 0
        ? <div className="empty">NinjaTrader no informa de sus conexiones. Instala el último <b>CCMarketFeed.cs</b>, pulsa F5 y reinicia NinjaTrader.</div>
        : conns.map(c => {
          const chosen = connectionMatches(c.name, e.state.ntConnection);
          return (
            <div className="row" key={c.name}>
              <div className="row-main">
                <span className="row-title">{c.name || '(sin nombre)'} {chosen && <span className="chip real">Elegida</span>}</span>
                <span className="row-sub">Conexión: {c.status || '—'} · Datos de precio: {c.price || '—'}</span>
              </div>
              {c.price === 'Connected'
                ? <StatusPill kind={/simulat|playback|replay/i.test(c.name) ? 'bad' : 'good'}>{/simulat|playback|replay/i.test(c.name) ? 'Precios simulados' : 'Datos conectados'}</StatusPill>
                : <StatusPill kind="neutral">Sin datos</StatusPill>}
              {!chosen && c.name && <button type="button" className="btn small" onClick={() => use(c.name)}>Usar esta</button>}
            </div>
          );
        })}
    </Section>
  );
}

export function Mercado() {
  const e = useEngine();
  const m = e.market;
  const bars = m.bars;
  const lastBar = bars[bars.length - 1];
  const dayAgo = lastBar ? bars.find(b => b.t >= lastBar.t - 86400) : undefined;
  const change = dayAgo && m.last ? m.last - dayAgo.o : 0;
  const source = SOURCES.find(s => s.id === e.state.source) || SOURCES[0];

  return (
    <>
      <div className="market-head">
        <div>
          <span className="tile-label">MNQ · Micro E-mini Nasdaq-100</span>
          <div className="market-price">
            <strong>{m.last ? m.last.toFixed(2) : '—'}</strong>
            {dayAgo && <span className={tone(change)}>{change > 0 ? '+' : ''}{change.toFixed(2)} ({((change / dayAgo.o) * 100).toFixed(2)} %) 24 h</span>}
          </div>
          <span className="muted">{lastBar ? `Última vela cerrada: ${fmtNy(lastBar.t)} NY` : 'Esperando datos…'}</span>
        </div>
        <div className="market-controls">
          {m.status.ok
            ? <StatusPill kind={m.status.warning ? 'bad' : e.state.source === 'nt' ? 'good' : e.state.source === 'yahoo' ? 'warn' : 'neutral'}>{m.status.message}</StatusPill>
            : <StatusPill kind="bad">{m.status.message}</StatusPill>}
        </div>
      </div>

      {e.state.source === 'nt' && m.status.warning && (
        <div className="callout"><AlertTriangle size={18} /><div><b>Precio no fiable: el bot no abre operaciones.</b> {m.status.warning}</div></div>
      )}
      {e.state.source === 'nt' && m.ntConnections.length > 0 && (
        <p className="muted conn-line">
          Conexiones de NinjaTrader: {m.ntConnections.map(c => `${c.name || '(sin nombre)'} · datos ${c.price === 'Connected' ? 'conectados' : c.price.toLowerCase() || '—'}`).join(' | ')}
        </p>
      )}

      <p className="muted conn-line">
        Para comparar: <a href="https://es.tradingview.com/symbols/CME_MINI-MNQ1%21/" target="_blank" rel="noreferrer">MNQ1! en TradingView</a> (TradingView no permite mostrar los futuros del CME dentro de otras webs; en su versión gratuita van con unos 10 minutos de retraso).
      </p>

      {e.state.source === 'nt' && <NtConnectionSetting e={e} />}

      <Section title="Fuente de precio del bot" footer={source.note}>
        <div className="row">
          <div className="segmented wide" role="radiogroup" aria-label="Fuente de precio">
            {SOURCES.map(s => (
              <button key={s.id} type="button" role="radio" aria-checked={e.state.source === s.id} className={e.state.source === s.id ? 'on' : ''} onClick={() => e.setSource(s.id)}>{s.label}</button>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Actividad del bot">
        <div className="log" role="log">
          {e.state.log.length === 0 ? <div className="empty">Sin actividad todavía.</div> : e.state.log.slice(0, 80).map((l, i) => <div key={i} className="log-line">{l}</div>)}
        </div>
      </Section>
    </>
  );
}

// ------------------------------------------------------------------ Operaciones
const zoneCity = () => { try { return (Intl.DateTimeFormat().resolvedOptions().timeZone || '').split('/').pop()?.replace(/_/g, ' ') || 'Local'; } catch { return 'Local'; } };
const fmtClock = (d: Date, timeZone?: string) => d.toLocaleString('es-ES', { timeZone, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: timeZone ? undefined : '2-digit' });

/** Resumen de lo que está pasando ahora: dinero del día, grupos activos y rendimiento. */
export function Operaciones({ go }: { go: (view: 'jf-grupos' | 'jf-mercado' | 'jf-tienda') => void }) {
  const e = useEngine();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = window.setInterval(() => setNow(new Date()), 1000); return () => window.clearInterval(t); }, []);

  const bars = e.market.bars;
  const today = tradingDay(bars.length ? bars[bars.length - 1].t + 60 : Math.floor(Date.now() / 1000));
  const accts = e.state.accounts;
  const open = accts.filter(a => a.position);
  const openPnl = open.reduce((s, a) => s + e.unrealized(a), 0);
  const realized = accts.reduce((s, a) => s + (a.daily[today] || 0), 0);
  const todays = accts.flatMap(a => a.trades.filter(t => tradingDay(t.exitT - 60) === today));
  const wins = todays.filter(t => t.pnl > 0).length, losses = todays.filter(t => t.pnl <= 0).length;
  const running = e.state.groups.filter(g => g.running);
  const inRunning = new Set(running.flatMap(g => g.accountIds));
  const capital = accts.filter(a => inRunning.has(a.id) && (a.status === 'evaluacion' || a.status === 'fondeada')).reduce((s, a) => s + (planById(a.planId)?.size ?? 0), 0);
  const solo = running.filter(g => g.accountIds.length === 1).length;
  const hour = now.getHours();
  const m = e.market;
  const ntOk = e.state.source !== 'nt' || (m.status.ok && m.trusted);
  const srcLabel = SOURCES.find(s => s.id === e.state.source)?.label ?? '';
  const groupDay = (g: Group) => g.accountIds.reduce((s, id) => { const a = e.acc(id); return a ? s + (a.daily[today] || 0) + e.unrealized(a) : s; }, 0);

  return (
    <>
      <div className="clock-bar">
        <span className="tile-label">Ahora</span>
        <b>{zoneCity()}</b> <span>{fmtClock(now)}</span>
        <span className="muted">· CME {fmtClock(now, 'America/New_York')} ET</span>
      </div>
      <div className="ops-greet">
        <p className="muted">{hour < 14 ? 'Buenos días' : hour < 21 ? 'Buenas tardes' : 'Buenas noches'}</p>
        <div className="conn-chips">
          <button type="button" className={`conn-chip ${ntOk ? 'good' : 'bad'}`} onClick={() => go('jf-mercado')} title="Ver Mercado">
            <span className="wz-dot" />{e.state.source === 'nt' ? `NT · ${e.state.ntConnection}` : srcLabel}
            <span className="muted">{m.last ? m.last.toFixed(2) : '—'}</span>
          </button>
        </div>
      </div>

      <div className="tiles">
        <Tile label="Open ahora" value={signedUsd(openPnl)} valueTone={tone(openPnl)} sub={`${open.length} cuenta${open.length === 1 ? '' : 's'} operando`} />
        <Tile label="PnL del día" value={signedUsd(realized + openPnl)} valueTone={tone(realized + openPnl)} sub="Open + realizado" />
        <Tile label="Realizado" value={signedUsd(realized)} valueTone={tone(realized)} sub="Cerrado hoy" />
        <Tile label="Capital" value={usd(capital)} sub="En operativa" />
      </div>

      <Section title="Grupos en operativa" action={<button type="button" className="btn small" onClick={() => go('jf-grupos')}>Ver todos <ChevronRight size={14} /></button>}>
        {running.length === 0
          ? <div className="empty">Ningún grupo operando. Actívalo en <button type="button" className="link" onClick={() => go('jf-grupos')}>Grupos</button>.</div>
          : running.map(g => {
            const pnl = groupDay(g);
            const live = g.accountIds.filter(id => e.acc(id)?.position).length;
            return (
              <button key={g.id} type="button" className="row row-btn" onClick={() => go('jf-grupos')}>
                <span className="monitor-avatar">{g.name.slice(0, 1).toUpperCase()}</span>
                <div className="row-main">
                  <span className="row-title">{g.name}</span>
                  <span className="row-sub">{STRATEGY_INFO[g.strategy].name} · MNQ · M{g.tf} · {modeLabel(g)} · {g.accountIds.length} ctas{g.lastCheck ? ` · ${g.lastCheck.text}` : ''}</span>
                </div>
                {live > 0 ? <StatusPill kind="good">{live} en posición</StatusPill> : <StatusPill kind="neutral">Esperando señal</StatusPill>}
                <span className={`row-amount ${tone(pnl)}`}>{signedUsd(pnl)}</span>
              </button>
            );
          })}
      </Section>

      <div className="ops-grid">
        <Section title="Rendimiento de hoy">
          <div className="tiles inset mini">
            <Tile label="Posiciones" value={open.length} />
            <Tile label="Ganadoras" value={wins} valueTone={wins ? 'pos' : ''} />
            <Tile label="Perdedoras" value={losses} valueTone={losses ? 'neg' : ''} />
            <Tile label="Win rate" value={todays.length ? `${Math.round((wins / todays.length) * 100)} %` : '—'} />
            <Tile label="Grupos activos" value={running.length} />
            <Tile label="Solo (1 cuenta)" value={solo} />
            <Tile label="Cuentas" value={accts.filter(a => a.status === 'evaluacion' || a.status === 'fondeada').length} sub="operables" />
            <Tile label="W / L" value={`${wins} / ${losses}`} />
          </div>
        </Section>
        <Section title="Estado">
          <div className="ops-state">
            <p className="muted small">{e.state.source === 'nt' ? (ntOk ? `Precio de NinjaTrader (${e.state.ntConnection}) correcto.` : `El bot no abre operaciones: ${m.status.warning || m.status.message}`) : `Fuente de precio: ${srcLabel}.`}</p>
            {running.length ? <StatusPill kind="good">{running.length} grupo{running.length === 1 ? '' : 's'} activo{running.length === 1 ? '' : 's'}</StatusPill> : <StatusPill kind="neutral">Bot en reposo</StatusPill>}
            <div className="log compact">
              {e.state.log.slice(0, 4).map((l, i) => <div key={i} className="log-line">{l}</div>)}
              {e.state.log.length === 0 && <div className="empty">Sin actividad todavía.</div>}
            </div>
            {accts.length === 0 && <button type="button" className="btn primary small" onClick={() => go('jf-tienda')}>Comprar cuentas</button>}
          </div>
        </Section>
      </div>
    </>
  );
}
