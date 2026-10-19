import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Eye, EyeOff, Minus, Pause, Pencil, Play, Plus, RotateCcw, Rocket, ShoppingBag, Trash2, Users, X } from 'lucide-react';
import { getEngine, type Engine, type Account, type AccountStatus, type Direction, type Group, type Member } from './engine';
import { SOURCES } from './market';
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

type FormValues = { name: string; strategy: StrategyKey; direction: Direction; accountIds: string[]; qty: number; tp: number; sl: number; batch: number; tf: number };

const TIMEFRAMES = [1, 3, 5, 15];
const tfOf = (v: FormValues) => (v.strategy === 'jetf1' ? 1 : v.tf);

const BATCHES: { v: number; label: string }[] = [
  { v: 0, label: 'Todas a la vez' }, { v: 1, label: 'Una a una' }, { v: 2, label: '2 a la vez' }, { v: 3, label: '3 a la vez' },
];
const batchLabel = (n: number) => BATCHES.find(b => b.v === n)?.label || `${n} a la vez`;

/** Formulario para crear un grupo o editarlo (nombre, estrategia, dirección y cuentas). */
function GroupForm({ e, initial, editing, onDone, notify }: { e: Engine; initial: FormValues; editing?: Group; onDone: () => void; notify: Props['notify'] }) {
  const [v, setV] = useState<FormValues>(initial);
  const set = (patch: Partial<FormValues>) => setV(x => ({ ...x, ...patch }));
  const usable = e.state.accounts.filter(a => a.status === 'evaluacion' || a.status === 'fondeada' || v.accountIds.includes(a.id));
  const maxQty = Math.min(100, ...v.accountIds.map(id => planById(e.acc(id)?.planId || '')?.maxMicros ?? 100));

  const save = () => {
    if (!v.name.trim()) { notify('Ponle un nombre al grupo', true); return; }
    if (v.accountIds.length === 0) { notify('Elige al menos una cuenta', true); return; }
    if (editing) {
      e.updateGroup(editing.id, { name: v.name.trim(), strategy: v.strategy, direction: v.direction, accountIds: v.accountIds, batch: v.batch, tf: tfOf(v) });
      notify(`Grupo "${v.name.trim()}" actualizado`);
    } else {
      e.createGroup({ name: v.name.trim(), strategy: v.strategy, direction: v.direction, accountIds: v.accountIds, qty: Math.min(v.qty, maxQty), tpUsd: v.tp, slUsd: v.sl, batch: v.batch, tf: tfOf(v) });
      notify(`Grupo "${v.name.trim()}" creado. Ajusta cada cuenta en la tabla y pulsa Activar.`);
    }
    onDone();
  };

  return (
    <div className="form">
      <div className="field-row">
        <label className="field grow"><span>Nombre</span>
          <input className="input" value={v.name} placeholder="Ej. Evaluaciones 50K" onChange={ev => set({ name: ev.target.value })} />
        </label>
        <label className="field"><span>Estrategia</span>
          <select className="select" value={v.strategy} onChange={ev => set({ strategy: ev.target.value as StrategyKey, tf: ev.target.value === 'jetf1' ? 1 : (v.tf === 1 && v.strategy === 'jetf1' ? 5 : v.tf) })}>
            {(Object.keys(STRATEGY_INFO) as StrategyKey[]).map(k => <option key={k} value={k}>{STRATEGY_INFO[k].name}</option>)}
          </select>
        </label>
        <label className="field"><span>Dirección</span>
          <select className="select" value={v.direction} onChange={ev => set({ direction: ev.target.value as Direction })}>
            {DIRECTIONS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </label>
      </div>
      <p className="muted field-note">{STRATEGY_INFO[v.strategy].note}</p>
      {v.strategy !== 'jetf1' && (
        <div className="field"><span>Vela</span>
          <div className="segmented" role="radiogroup" aria-label="Vela" style={{ maxWidth: 320 }}>
            {TIMEFRAMES.map(tf => <button key={tf} type="button" role="radio" aria-checked={v.tf === tf} className={v.tf === tf ? 'on' : ''} onClick={() => set({ tf })}>{tf} min</button>)}
          </div>
          {v.strategy === 'goatpro' && v.tf !== 5 && <span className="muted">GoatPro se probó con velas de 5 minutos; con otra vela cambian sus resultados.</span>}
        </div>
      )}
      <div className="field"><span>Cómo operan las cuentas</span>
        <div className="segmented wide" role="radiogroup" aria-label="Cómo operan las cuentas">
          {BATCHES.map(b => <button key={b.v} type="button" role="radio" aria-checked={v.batch === b.v} className={v.batch === b.v ? 'on' : ''} onClick={() => set({ batch: b.v })}>{b.label}</button>)}
        </div>
        <span className="muted">
          {v.batch === 0 ? 'Todas las cuentas reciben cada señal.' : `Solo operan ${v.batch === 1 ? 'la primera cuenta' : `las ${v.batch} primeras`} de la lista. Cuando una supera la evaluación o se quema, entra la siguiente. El orden se cambia con las flechas de la tabla.`}
        </span>
      </div>
      {!editing && (
        <div className="field-row">
          <div className="field"><span>CT por defecto (MNQ)</span><Stepper label="Contratos" value={Math.min(v.qty, maxQty)} min={1} max={maxQty} onChange={q => set({ qty: q })} suffix=" ct" /><small className="muted">= {(Math.min(v.qty, maxQty) / 10).toLocaleString('es-ES')} lote(s) de NQ</small></div>
          <div className="field"><span>TP $ por defecto</span><Stepper label="Take profit" value={v.tp} min={25} max={5000} step={25} onChange={tp => set({ tp })} /></div>
          <div className="field"><span>SL $ por defecto</span><Stepper label="Stop loss" value={v.sl} min={25} max={5000} step={25} onChange={sl => set({ sl })} /></div>
        </div>
      )}
      <div className="field"><span>Cuentas ({v.accountIds.length})</span>
        {usable.length === 0
          ? <span className="muted">No tienes cuentas activas. Cómpralas en la Tienda.</span>
          : (
            <div className="pick-list">
              {usable.map(a => {
                const on = v.accountIds.includes(a.id);
                const busy = e.groupOf(a.id);
                return (
                  <label key={a.id} className={`pick${on ? ' on' : ''}`}>
                    <Toggle on={on} label={`Incluir ${a.id}`} onChange={x => set({ accountIds: x ? [...v.accountIds, a.id] : v.accountIds.filter(y => y !== a.id) })} />
                    <span><b>{a.id}</b><small>{planById(a.planId)?.name} · {STATUS[a.status].label}{busy && busy.id !== editing?.id ? ` · en ${busy.name}` : ''}</small></span>
                  </label>
                );
              })}
            </div>
          )}
      </div>
      <div className="actions tight">
        <button type="button" className="btn primary" onClick={save}>{editing ? 'Guardar cambios' : <><Users size={16} /> Crear grupo</>}</button>
        <button type="button" className="btn" onClick={onDone}>Cancelar</button>
      </div>
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
  const last = a.trades[0];
  if (last && tradingDay(last.exitT - 60) === today) {
    if (last.reason === 'Take profit') return { label: 'SALIDA TP', kind: 'good' };
    if (last.reason === 'Stop loss') return { label: 'SALIDA SL', kind: 'bad' };
    return { label: 'CERRADA', kind: 'neutral' };
  }
  return { label: 'ESPERANDO', kind: 'neutral' };
}

function GroupMonitor({ g, e, ask, notify }: { g: Group; e: Engine; ask: Props['ask']; notify: Props['notify'] }) {
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const bars = e.market.bars;
  const today = tradingDay(bars.length ? bars[bars.length - 1].t + 60 : Math.floor(Date.now() / 1000));
  const launch = () => { const err = e.launchGroup(g.id); notify(err || `"${g.name}" operando con ${STRATEGY_INFO[g.strategy].name}`, !!err); };
  const info = STRATEGY_INFO[g.strategy];
  const active = e.activeMembers(g);
  const waiting = g.batch > 0 ? g.accountIds.filter(id => !active.includes(id) && g.members[id]?.enabled && (e.acc(id)?.status === 'evaluacion' || e.acc(id)?.status === 'fondeada')) : [];

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
          <span>{batchLabel(g.batch)}</span>
          <span>{g.accountIds.length} ctas</span>
          <span className={tone(g.pnl)}>{g.trades} ops · {signedUsd(g.pnl)}</span>
        </div>
        <div className="actions tight">
          {g.running
            ? <>
              <button type="button" className="btn warn" onClick={() => e.stopGroup(g.id, false)}><Pause size={16} /> Detener</button>
              <button type="button" className="btn danger-ghost" onClick={() => ask({ title: `Detener y cerrar "${g.name}"`, message: 'Se detiene el grupo y se cierran a mercado sus posiciones abiertas.', action: 'Detener y cerrar', destructive: true, onConfirm: () => e.stopGroup(g.id, true) })}>Detener y cerrar</button>
            </>
            : <button type="button" className="btn primary" onClick={launch}><Play size={16} /> Activar</button>}
          <button type="button" className="btn" disabled={g.running} title={g.running ? 'Detén el grupo para editarlo' : undefined} onClick={() => setEditing(!editing)}><Pencil size={15} /> Editar</button>
          <button type="button" className="btn danger-ghost" disabled={g.running}
            onClick={() => ask({ title: `Eliminar "${g.name}"`, message: 'Se borra el grupo. Las cuentas no se tocan.', action: 'Eliminar', destructive: true, onConfirm: () => e.deleteGroup(g.id) })}
          ><Trash2 size={15} /> Eliminar</button>
        </div>
      </header>

      {editing && !g.running && (
        <GroupForm e={e} editing={g} notify={notify} onDone={() => setEditing(false)}
          initial={{ name: g.name, strategy: g.strategy, direction: g.direction, accountIds: g.accountIds, qty: g.qty, tp: g.tpUsd, sl: g.slUsd, batch: g.batch, tf: g.tf }} />
      )}

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
                const st = memberState(a, m, today, waiting.indexOf(id) + 1);
                const priced = !a.position || e.priced(a);
                const plan = planById(a.planId)!;
                const slRisk = m.slUsd >= plan.maxLoss;
                const lock = g.running;
                const upd = (patch: Partial<Member>) => e.updateMember(g.id, id, patch);
                return (
                  <tr key={id} className={m.enabled ? '' : 'off'}>
                    <td><span className={`state ${st.kind}`}>{st.label}</span></td>
                    <td className="left">
                      {g.batch > 0 && !lock && (
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
  const [creating, setCreating] = useState(e.state.groups.length === 0);
  return (
    <>
      <div className="groups-intro">
        <button type="button" className="btn primary" onClick={() => setCreating(!creating)}><Plus size={16} /> Nuevo grupo</button>
        <p className="muted">
          Estrategia + cuentas. En la tabla ajustas cada cuenta: CT (contratos MNQ; 10 CT = 1 lote de NQ), TP $, SL $, PDLL (pérdida del día) y PDPT (objetivo del día).
          Un SL en rojo es igual o mayor que la pérdida máxima de la cuenta: un solo stop la quemaría.
          OPS apaga una cuenta sin sacarla del grupo. Con el grupo activo, Editar y la tabla quedan bloqueados.
        </p>
      </div>
      {creating && (
        <Section title="Nuevo grupo">
          <GroupForm e={e} notify={notify} onDone={() => setCreating(false)}
            initial={{ name: '', strategy: 'goatpro', direction: 'ambas', accountIds: [], qty: 2, tp: 150, sl: 200, batch: 0, tf: 5 }} />
        </Section>
      )}
      {e.state.groups.map(g => <GroupMonitor key={g.id} g={g} e={e} ask={ask} notify={notify} />)}
      {e.state.groups.length === 0 && !creating && <Section><div className="empty">Aún no hay grupos.</div></Section>}
    </>
  );
}

// ------------------------------------------------------------------ Mercado
const isDark = () => {
  const t = document.documentElement.getAttribute('data-theme');
  return t ? t === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
};

/** Widget oficial de TradingView (solo para VER el precio; el bot no puede leerlo). */
function TradingViewQuote({ symbol }: { symbol: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [dark, setDark] = useState(isDark);
  useEffect(() => {
    const update = () => setDark(isDark());
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', update);
    return () => { mo.disconnect(); mq.removeEventListener('change', update); };
  }, []);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.innerHTML = '<div class="tradingview-widget-container__widget"></div>';
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-single-quote.js';
    script.async = true;
    script.innerHTML = JSON.stringify({ symbol, width: '100%', isTransparent: true, colorTheme: dark ? 'dark' : 'light', locale: 'es' });
    el.appendChild(script);
    return () => { el.innerHTML = ''; };
  }, [symbol, dark]);
  return <div className="tradingview-widget-container tv-quote" ref={box} />;
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
        <div className="callout"><AlertTriangle size={18} /><div><b>Precio no fiable.</b> {m.status.warning}</div></div>
      )}
      {e.state.source === 'nt' && m.ntConnections.length > 0 && (
        <p className="muted conn-line">
          Conexiones de NinjaTrader: {m.ntConnections.map(c => `${c.name || '(sin nombre)'} · datos ${c.price === 'Connected' ? 'conectados' : c.price.toLowerCase() || '—'}`).join(' | ')}
        </p>
      )}

      <Section
        title="TradingView · CME_MINI:MNQ1!"
        footer={<>Widget oficial de TradingView, solo para ver el precio: el bot no puede leerlo. En una cuenta gratuita de TradingView los futuros del CME van con unos 10 minutos de retraso. <a href="https://es.tradingview.com/symbols/CME_MINI-MNQ1%21/" target="_blank" rel="noreferrer">Abrir en TradingView</a></>}
      >
        <TradingViewQuote symbol="CME_MINI:MNQ1!" />
      </Section>

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
