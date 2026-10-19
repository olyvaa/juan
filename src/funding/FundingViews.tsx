import { useMemo, useState, useSyncExternalStore } from 'react';
import { Minus, Pause, Play, Plus, Rocket, ShoppingBag, Trash2, Users } from 'lucide-react';
import Chart, { type ChartMarker } from './Chart';
import { getEngine, type Engine, type Account, type AccountStatus, type Direction, type Group } from './engine';
import { SOURCES } from './market';
import { PLANS, RULES, fmtNy, planById, type Plan } from './plans';
import { STRATEGY_INFO, type StrategyKey } from './strategies';
import { Section, StatusPill, Tile, Toggle, type Confirm } from '../panel/ui';
import { signedUsd, tone, usd } from '../panel/format';

function useEngine() {
  const e = getEngine();
  useSyncExternalStore(e.subscribe, e.getVersion);
  return e;
}

type Props = { ask: (c: Confirm) => void; notify: (text: string, error?: boolean) => void };

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
          <span className={tone(unreal)}><small>Abierto</small>{signedUsd(unreal)}</span>
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

export function MisCuentas({ ask }: Props) {
  const e = useEngine();
  const accts = e.state.accounts;
  const totalProfit = accts.reduce((s, a) => s + (a.balance - a.start) + e.unrealized(a), 0);
  const count = (s: AccountStatus) => accts.filter(a => a.status === s).length;
  if (accts.length === 0) return <Section><div className="empty">Aún no tienes cuentas. Cómpralas en la <b>Tienda</b>.</div></Section>;
  return (
    <>
      <div className="tiles">
        <Tile label="Resultado total" value={signedUsd(totalProfit)} valueTone={tone(totalProfit)} sub="Incluye posiciones abiertas" />
        <Tile label="En evaluación" value={count('evaluacion')} sub={`${count('superada')} superadas`} />
        <Tile label="Fondeadas" value={count('fondeada')} />
        <Tile label="Quemadas" value={count('quemada')} />
      </div>
      <Section title="Cuentas" footer="Pulsa una cuenta para ver su progreso, el suelo de pérdida y sus operaciones.">
        {accts.map(a => <AccountRow key={a.id} a={a} e={e} ask={ask} />)}
      </Section>
    </>
  );
}

// ------------------------------------------------------------------ Grupos
const DIRECTIONS: { id: Direction; label: string }[] = [
  { id: 'ambas', label: 'Ambas' }, { id: 'largos', label: 'Solo largos' }, { id: 'cortos', label: 'Solo cortos' },
];

function NewGroup({ e, notify }: { e: Engine; notify: Props['notify'] }) {
  const [name, setName] = useState('');
  const [strategy, setStrategy] = useState<StrategyKey>('goatpro');
  const [ids, setIds] = useState<string[]>([]);
  const [qty, setQty] = useState(2);
  const [tp, setTp] = useState(150);
  const [sl, setSl] = useState(200);
  const [direction, setDirection] = useState<Direction>('ambas');
  const usable = e.state.accounts.filter(a => a.status === 'evaluacion' || a.status === 'fondeada');
  const maxQty = Math.min(100, ...ids.map(id => planById(e.acc(id)?.planId || '')?.maxMicros ?? 100));

  const create = () => {
    if (!name.trim()) { notify('Ponle un nombre al grupo', true); return; }
    if (ids.length === 0) { notify('Elige al menos una cuenta', true); return; }
    e.createGroup({ name: name.trim(), strategy, accountIds: ids, qty: Math.min(qty, maxQty), tpUsd: tp, slUsd: sl, direction });
    notify(`Grupo "${name.trim()}" creado. Lánzalo cuando quieras.`);
    setName(''); setIds([]);
  };

  return (
    <Section title="Nuevo grupo" footer="TP y SL en dólares por cuenta (para toda su posición). Con 2 micros, 150 $ = 37,5 puntos.">
      <div className="form">
        <label className="field"><span>Nombre</span>
          <input className="input" value={name} placeholder="Ej. Evaluaciones 50K" onChange={ev => setName(ev.target.value)} />
        </label>
        <label className="field"><span>Estrategia</span>
          <select className="select" value={strategy} onChange={ev => setStrategy(ev.target.value as StrategyKey)}>
            {(Object.keys(STRATEGY_INFO) as StrategyKey[]).map(k => <option key={k} value={k}>{STRATEGY_INFO[k].name}</option>)}
          </select>
        </label>
        <p className="muted field-note">{STRATEGY_INFO[strategy].note}</p>
        <div className="field-row">
          <div className="field"><span>Contratos por cuenta</span><Stepper label="Contratos" value={Math.min(qty, maxQty)} min={1} max={maxQty} onChange={setQty} suffix=" ct" /></div>
          <div className="field"><span>TP $</span><Stepper label="Take profit" value={tp} min={25} max={5000} step={25} onChange={setTp} /></div>
          <div className="field"><span>SL $</span><Stepper label="Stop loss" value={sl} min={25} max={5000} step={25} onChange={setSl} /></div>
          <label className="field"><span>Dirección</span>
            <select className="select" value={direction} onChange={ev => setDirection(ev.target.value as Direction)}>
              {DIRECTIONS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          </label>
        </div>
        <div className="field"><span>Cuentas ({ids.length})</span>
          {usable.length === 0
            ? <span className="muted">No tienes cuentas activas. Cómpralas en la Tienda.</span>
            : (
              <div className="pick-list">
                {usable.map(a => {
                  const on = ids.includes(a.id);
                  const busy = e.groupOf(a.id);
                  return (
                    <label key={a.id} className={`pick${on ? ' on' : ''}`}>
                      <Toggle on={on} label={`Incluir ${a.id}`} onChange={v => setIds(x => v ? [...x, a.id] : x.filter(y => y !== a.id))} />
                      <span><b>{a.id}</b><small>{planById(a.planId)?.name} · {STATUS[a.status].label}{busy ? ` · en ${busy.name}` : ''}</small></span>
                    </label>
                  );
                })}
              </div>
            )}
        </div>
        <div><button type="button" className="btn primary" onClick={create}><Users size={16} /> Crear grupo</button></div>
      </div>
    </Section>
  );
}

function GroupCard({ g, e, ask, notify }: { g: Group; e: Engine; ask: Props['ask']; notify: Props['notify'] }) {
  const open = e.state.accounts.filter(a => a.position?.groupId === g.id).length;
  const launch = () => { const err = e.launchGroup(g.id); notify(err || `"${g.name}" operando con ${STRATEGY_INFO[g.strategy].name}`, !!err); };
  return (
    <article className="card">
      <header className="card-head">
        <div><h3>{g.name}</h3><p className="card-tag">{STRATEGY_INFO[g.strategy].name} · {g.accountIds.length} cuentas · {g.qty} ct · TP {usd(g.tpUsd)} / SL {usd(g.slUsd)}</p></div>
        {g.running ? <StatusPill kind="good">Operando</StatusPill> : <StatusPill kind="neutral">Detenido</StatusPill>}
      </header>
      <div className="mini-stats">
        <span><small>Operaciones</small>{g.trades}</span>
        <span className={tone(g.pnl)}><small>Resultado</small>{signedUsd(g.pnl)}</span>
        <span><small>Posiciones abiertas</small>{open}</span>
        <span><small>Dirección</small>{DIRECTIONS.find(d => d.id === g.direction)?.label}</span>
      </div>
      <div className="chips">{g.accountIds.map(id => <span key={id} className="chip">{id}</span>)}</div>
      <div className="actions tight">
        {g.running
          ? <>
            <button type="button" className="btn warn" onClick={() => e.stopGroup(g.id, false)}><Pause size={16} /> Detener</button>
            <button type="button" className="btn danger-ghost" onClick={() => ask({ title: `Detener y cerrar "${g.name}"`, message: 'Se detiene el grupo y se cierran a mercado sus posiciones abiertas.', action: 'Detener y cerrar', destructive: true, onConfirm: () => e.stopGroup(g.id, true) })}>Detener y cerrar</button>
          </>
          : <>
            <button type="button" className="btn primary" onClick={launch}><Play size={16} /> Lanzar</button>
            <button type="button" className="btn danger-ghost" onClick={() => e.deleteGroup(g.id)}><Trash2 size={15} /> Eliminar</button>
          </>}
      </div>
    </article>
  );
}

export function Grupos({ ask, notify }: Props) {
  const e = useEngine();
  return (
    <>
      {e.state.groups.length > 0 && (
        <div className="cards">{e.state.groups.map(g => <GroupCard key={g.id} g={g} e={e} ask={ask} notify={notify} />)}</div>
      )}
      <NewGroup e={e} notify={notify} />
    </>
  );
}

// ------------------------------------------------------------------ Mercado
export function Mercado() {
  const e = useEngine();
  const [tf, setTf] = useState<1 | 5>(5);
  const [groupFilter, setGroupFilter] = useState('');
  const m = e.market;
  const version = e.version;
  const bars = useMemo(() => { void version; return m.bars.slice(-3000); }, [m, version]);
  const markers = useMemo<ChartMarker[]>(() => {
    void version;
    const out: ChartMarker[] = [];
    const seen = new Set<string>();
    for (const a of e.state.accounts) {
      for (const t of a.trades.slice(0, 60)) {
        if (groupFilter && t.groupId !== groupFilter) continue;
        const k = `${t.groupId}-${t.entryT}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ t: t.entryT, side: t.side, kind: 'entry', text: STRATEGY_INFO[t.strategy].name });
        out.push({ t: t.exitT - 60, side: t.side, kind: 'exit', text: t.reason, win: t.pnl > 0 });
      }
      const p = a.position;
      if (p && (!groupFilter || p.groupId === groupFilter) && !seen.has(`${p.groupId}-${p.entryT}`)) {
        seen.add(`${p.groupId}-${p.entryT}`);
        out.push({ t: p.entryT, side: p.side, kind: 'entry', text: `${STRATEGY_INFO[p.strategy].name} (abierta)` });
      }
    }
    return out;
  }, [e, version, groupFilter]);

  const lastBar = bars[bars.length - 1];
  const dayOpen = useMemo(() => {
    if (!lastBar) return 0;
    const first = bars.find(b => b.t >= lastBar.t - 86400);
    return first ? first.o : 0;
  }, [bars, lastBar]);
  const change = dayOpen ? m.last - dayOpen : 0;
  const source = SOURCES.find(s => s.id === e.state.source)!;

  return (
    <>
      <div className="market-head">
        <div>
          <span className="tile-label">MNQ · Micro E-mini Nasdaq-100</span>
          <div className="market-price">
            <strong>{m.last ? m.last.toFixed(2) : '—'}</strong>
            {dayOpen > 0 && <span className={tone(change)}>{change > 0 ? '+' : ''}{change.toFixed(2)} ({((change / dayOpen) * 100).toFixed(2)} %) 24 h</span>}
          </div>
          <span className="muted">{lastBar ? `Última vela cerrada: ${fmtNy(lastBar.t)} NY` : 'Esperando datos…'}</span>
        </div>
        <div className="market-controls">
          {m.status.ok ? <StatusPill kind={e.state.source === 'yahoo' ? 'warn' : 'neutral'}>{m.status.message}</StatusPill> : <StatusPill kind="bad">{m.status.message}</StatusPill>}
        </div>
      </div>

      <Section>
        <div className="chart-toolbar">
          <div className="segmented" role="radiogroup" aria-label="Temporalidad">
            {([1, 5] as const).map(x => <button key={x} type="button" role="radio" aria-checked={tf === x} className={tf === x ? 'on' : ''} onClick={() => setTf(x)}>{x} min</button>)}
          </div>
          <select className="select" value={groupFilter} onChange={ev => setGroupFilter(ev.target.value)} aria-label="Operaciones a mostrar">
            <option value="">Operaciones de todos los grupos</option>
            {e.state.groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
        <Chart bars={bars} tf={tf} markers={markers} />
      </Section>

      <Section title="Fuente de precio" footer={source.note}>
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
