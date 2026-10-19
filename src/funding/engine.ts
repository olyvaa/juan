// Motor de Juanitos Funding: cuentas simuladas tipo LucidFlex, grupos y ejecución del bot
// sobre el precio del MNQ. Todo es simulado y se guarda en el navegador (localStorage).
import { Market, aggregate, type Bar, type SourceId } from './market';
import { MNQ, PLANS, RULES, fmtNy, hm, ny, planById, tradingDay, type Plan } from './plans';
import { JET_TICKS, goatProSignal, gyrSignal, isJetAnchorBar, rangOpenSignal, type StrategyKey } from './strategies';

export type AccountStatus = 'evaluacion' | 'superada' | 'fondeada' | 'quemada';
export type Direction = 'ambas' | 'largos' | 'cortos';

export type Position = {
  side: 1 | -1; qty: number; entry: number; sl: number; tp: number;
  entryT: number; groupId: string; strategy: StrategyKey;
  source?: SourceId;   // fuente de precio con la que se abrió: nunca se valora con otra
};

export type Trade = {
  id: number; accountId: string; groupId: string; strategy: StrategyKey;
  side: 1 | -1; qty: number; entry: number; exit: number; entryT: number; exitT: number;
  pnl: number; reason: string;
};

export type Account = {
  id: string; planId: string; createdAt: number; status: AccountStatus;
  start: number; balance: number; floor: number; highEod: number; lastDay: string;
  daily: Record<string, number>; position: Position | null; trades: Trade[]; fees: number;
};

/** Configuración de cada cuenta dentro de un grupo (editable en la tabla del grupo). */
export type Member = {
  qty: number; tpUsd: number; slUsd: number;
  pdll: number;      // pérdida máxima del día ($, 0 = sin límite): al llegar, cierra y para hasta mañana
  pdpt: number;      // objetivo del día ($, 0 = sin objetivo): al llegar, cierra y para hasta mañana
  enabled: boolean;  // OPS: si está apagado, esta cuenta no abre operaciones
  stopDay: string; stopReason: string;
};

export const newMember = (qty: number, tpUsd: number, slUsd: number): Member =>
  ({ qty, tpUsd, slUsd, pdll: 0, pdpt: 0, enabled: true, stopDay: '', stopReason: '' });

export type Group = {
  id: string; name: string; strategy: StrategyKey; accountIds: string[];
  qty: number; tpUsd: number; slUsd: number; direction: Direction;   // valores por defecto para cuentas nuevas
  members: Record<string, Member>;
  tf: number;         // minutos por vela de la estrategia (JetF1 siempre 1)
  batch: number;      // 0 = todas las cuentas a la vez; N = solo N a la vez (en orden): cuando una supera o se quema, entra la siguiente
  running: boolean; startedAt: number; trades: number; pnl: number;
  lastExitT: number; lastNyorDay: string;
  jet: { day: string; up: number; down: number; expires: number } | null;
};

/** Cuenta de examen REAL de NinjaTrader que el panel sigue (el PnL viene de NinjaTrader). */
export type RealTrack = { planId: string; start: number; highEod: number; floor: number; lastDay: string };

type State = {
  version: 1; seq: number; spent: number; source: SourceId; processedT: number;
  accounts: Account[]; groups: Group[]; log: string[];
  real: Record<string, RealTrack>;
};

const KEY = 'jf-state-v1';
const tick = MNQ.tick;
const roundTick = (p: number) => Math.round(p / tick) * tick;
const usdToPts = (usd: number, qty: number) => Math.max(tick, roundTick(usd / (qty * MNQ.pointValue)));

function emptyState(): State {
  return { version: 1, seq: 0, spent: 0, source: 'nt', processedT: 0, accounts: [], groups: [], log: [], real: {} };
}

function loadState(): State {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null') as State | null;
    if (s && s.version === 1 && Array.isArray(s.accounts) && Array.isArray(s.groups)) {
      // Datos guardados por versiones anteriores del panel
      s.real = s.real || {};
      for (const g of s.groups) {
        g.members = g.members || {};
        g.batch = g.batch || 0;
        g.tf = g.tf || (g.strategy === 'jetf1' ? 1 : 5);
        for (const id of g.accountIds) g.members[id] = g.members[id] || newMember(g.qty, g.tpUsd, g.slUsd);
      }
      return s;
    }
  } catch { /* datos corruptos o navegador sin almacenamiento */ }
  return emptyState();
}

export class Engine {
  state: State = loadState();
  market: Market;
  version = 0;
  private listeners = new Set<() => void>();
  private saveTimer = 0;
  private freshStart = true;          // primer lote de datos tras abrir la página

  constructor() {
    this.market = new Market(this.state.source);
    this.market.subscribe(() => this.process());
    this.market.start();
  }

  // -------------------------------------------------------------- suscripción (React)
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getVersion = () => this.version;
  private changed() {
    this.version++;
    this.listeners.forEach(f => f());
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch { /* sin almacenamiento */ }
    }, 400);
  }

  private log(msg: string, t?: number) {
    this.state.log.unshift(`${t ? fmtNy(t) + ' NY · ' : ''}${msg}`);
    if (this.state.log.length > 200) this.state.log.length = 200;
  }

  // -------------------------------------------------------------- tienda
  buy(plan: Plan, count: number) {
    for (let i = 0; i < count; i++) {
      this.state.seq++;
      const id = `JF-${plan.name.replace(/\D/g, '')}K-${String(this.state.seq).padStart(4, '0')}`;
      this.state.accounts.push({
        id, planId: plan.id, createdAt: Date.now(), status: 'evaluacion',
        start: plan.size, balance: plan.size, floor: plan.size - plan.maxLoss, highEod: plan.size,
        lastDay: '', daily: {}, position: null, trades: [], fees: 0,
      });
      this.state.spent += plan.price;
    }
    this.log(`Compradas ${count} cuenta(s) ${plan.name} por ${plan.price * count} $ ficticios`);
    this.changed();
  }

  deleteAccount(id: string) {
    this.state.accounts = this.state.accounts.filter(a => a.id !== id);
    this.state.groups.forEach(g => { g.accountIds = g.accountIds.filter(x => x !== id); });
    this.changed();
  }

  activateFunded(id: string) {
    const a = this.acc(id);
    const plan = a && planById(a.planId);
    if (!a || !plan || a.status !== 'superada') return;
    Object.assign(a, { status: 'fondeada', balance: plan.size, start: plan.size, floor: plan.size - plan.maxLoss, highEod: plan.size, daily: {}, lastDay: '' });
    this.log(`${a.id}: cuenta FONDEADA activada`);
    this.changed();
  }

  // -------------------------------------------------------------- grupos
  createGroup(g: Omit<Group, 'id' | 'running' | 'startedAt' | 'trades' | 'pnl' | 'lastExitT' | 'lastNyorDay' | 'jet' | 'members'>) {
    this.state.seq++;
    const members: Record<string, Member> = {};
    for (const id of g.accountIds) members[id] = newMember(g.qty, g.tpUsd, g.slUsd);
    this.state.groups.push({ ...g, members, id: `G${this.state.seq}`, running: false, startedAt: 0, trades: 0, pnl: 0, lastExitT: 0, lastNyorDay: '', jet: null });
    this.changed();
  }

  /** Editar nombre, estrategia, dirección y cuentas (solo con el grupo detenido). */
  updateGroup(id: string, patch: { name: string; strategy: StrategyKey; direction: Direction; accountIds: string[]; batch: number; tf: number }) {
    const g = this.group(id);
    if (!g || g.running) return;
    const members: Record<string, Member> = {};
    for (const a of patch.accountIds) members[a] = g.members[a] || newMember(g.qty, g.tpUsd, g.slUsd);
    Object.assign(g, patch, { members });
    this.changed();
  }

  /** Mueve una cuenta en el orden del grupo (importa en el modo "una a una"). */
  moveMember(groupId: string, accountId: string, dir: -1 | 1) {
    const g = this.group(groupId);
    if (!g || g.running) return;
    const i = g.accountIds.indexOf(accountId), j = i + dir;
    if (i < 0 || j < 0 || j >= g.accountIds.length) return;
    [g.accountIds[i], g.accountIds[j]] = [g.accountIds[j], g.accountIds[i]];
    this.changed();
  }

  /** Cambiar CT / TP / SL / PDLL / PDPT / OPS de una cuenta del grupo. Se aplica a las siguientes entradas. */
  updateMember(groupId: string, accountId: string, patch: Partial<Member>) {
    const m = this.group(groupId)?.members[accountId];
    if (!m) return;
    const plan = planById(this.acc(accountId)?.planId || '');
    Object.assign(m, patch);
    if (plan) m.qty = Math.max(1, Math.min(Math.round(m.qty) || 1, plan.maxMicros));
    m.tpUsd = Math.max(1, m.tpUsd || 1);
    m.slUsd = Math.max(1, m.slUsd || 1);
    m.pdll = Math.max(0, m.pdll || 0);
    m.pdpt = Math.max(0, m.pdpt || 0);
    this.changed();
  }

  // -------------------------------------------------------------- cuentas reales (NinjaTrader)
  trackReal(name: string, planId: string, start: number) {
    const plan = planById(planId);
    if (!plan) return;
    this.state.real[name] = { planId, start, highEod: start, floor: start - plan.maxLoss, lastDay: '' };
    this.changed();
  }

  untrackReal(name: string) { delete this.state.real[name]; this.changed(); }

  /** Actualiza el suelo trailing de las cuentas reales con el saldo que da NinjaTrader. */
  observeReal(name: string, cash: number) {
    const r = this.state.real[name];
    const plan = r && planById(r.planId);
    if (!r || !plan) return;
    const day = tradingDay(Math.floor(Date.now() / 1000));
    if (r.lastDay && r.lastDay !== day) {
      r.highEod = Math.max(r.highEod, cash);
      r.floor = Math.min(r.start, Math.max(r.floor, r.highEod - plan.maxLoss));
    }
    if (r.lastDay !== day) { r.lastDay = day; this.changed(); }
  }

  deleteGroup(id: string) {
    this.state.groups = this.state.groups.filter(g => g.id !== id || g.running);
    this.changed();
  }

  /** Devuelve un error si no se puede lanzar. */
  launchGroup(id: string): string | null {
    const g = this.group(id);
    if (!g) return 'El grupo no existe.';
    const usable = g.accountIds.map(x => this.acc(x)).filter((a): a is Account => !!a && g.members[a.id]?.enabled !== false && (a.status === 'evaluacion' || a.status === 'fondeada'));
    if (usable.length === 0) return 'El grupo no tiene cuentas activas (en evaluación o fondeadas, con OPS encendido).';
    const busy = usable.find(a => this.state.groups.some(o => o.running && o.id !== g.id && o.accountIds.includes(a.id)));
    if (busy) return `${busy.id} ya está operando en otro grupo. Una cuenta solo puede estar en un grupo activo.`;
    g.running = true;
    g.startedAt = this.market.bars.length ? this.market.bars[this.market.bars.length - 1].t : 0;
    g.jet = null;
    this.log(`Grupo "${g.name}" LANZADO con ${usable.length} cuenta(s)`, g.startedAt || undefined);
    this.changed();
    return null;
  }

  stopGroup(id: string, flatten: boolean) {
    const g = this.group(id);
    if (!g) return;
    g.running = false;
    g.jet = null;
    if (flatten) this.state.accounts.forEach(a => { if (a.position?.groupId === id) this.close(a, this.market.last, this.nowT(), 'Cierre manual'); });
    this.log(`Grupo "${g.name}" detenido${flatten ? ' y posiciones cerradas' : ''}`);
    this.changed();
  }

  closeAccount(id: string) {
    const a = this.acc(id);
    if (a?.position) { this.close(a, this.market.last, this.nowT(), 'Cierre manual'); this.changed(); }
  }

  // -------------------------------------------------------------- fuente de datos
  setSource(source: SourceId) {
    if (source === this.state.source) return;
    this.state.accounts.forEach(a => { if (a.position) this.close(a, this.market.last, this.nowT(), 'Cambio de fuente de precio'); });
    this.state.groups.forEach(g => { g.startedAt = 0; g.jet = null; });
    this.state.source = source;
    this.state.processedT = 0;
    this.market.stop();
    this.market = new Market(source);
    this.market.subscribe(() => this.process());
    this.freshStart = true;
    this.market.start();
    this.log(`Fuente de precio: ${source}`);
    this.changed();
  }

  // -------------------------------------------------------------- utilidades
  acc(id: string) { return this.state.accounts.find(a => a.id === id); }
  group(id: string) { return this.state.groups.find(g => g.id === id); }
  groupOf(accountId: string) { return this.state.groups.find(g => g.running && g.accountIds.includes(accountId)); }
  private nowT() { const b = this.market.bars; return b.length ? b[b.length - 1].t + 60 : Math.floor(Date.now() / 1000); }

  /** ¿Hay precio válido para valorar esta posición? (fuente correcta y precio > 0) */
  priced(a: Account) {
    const p = a.position;
    return !!p && this.market.last > 0 && (p.source || this.state.source) === this.state.source;
  }

  unrealized(a: Account) {
    const p = a.position;
    return p && this.priced(a) ? p.side * (this.market.last - p.entry) * MNQ.pointValue * p.qty : 0;
  }

  /** Cuentas del grupo que pueden operar ahora (modo todas a la vez o N a la vez, en orden). */
  activeMembers(g: Group): string[] {
    const queue = g.accountIds.filter(id => {
      const a = this.acc(id), m = g.members[id];
      return !!a && !!m && m.enabled && (a.status === 'evaluacion' || a.status === 'fondeada');
    });
    return g.batch > 0 ? queue.slice(0, g.batch) : queue;
  }

  // -------------------------------------------------------------- limpiar
  /** Deja una cuenta como recién comprada: saldo inicial, sin historial, en evaluación. */
  resetAccount(id: string) {
    const a = this.acc(id);
    const plan = a && planById(a.planId);
    if (!a || !plan || this.groupOf(id)) return;
    Object.assign(a, { status: 'evaluacion', start: plan.size, balance: plan.size, floor: plan.size - plan.maxLoss, highEod: plan.size, lastDay: '', daily: {}, position: null, trades: [], fees: 0 });
    this.state.groups.forEach(g => { const m = g.members[id]; if (m) { m.stopDay = ''; m.stopReason = ''; } });
    this.log(`${a.id}: cuenta reiniciada`);
    this.changed();
  }

  /** Reinicia todas las cuentas (detiene los grupos) y borra el historial de actividad. */
  resetAllAccounts() {
    this.state.groups.forEach(g => { g.running = false; g.jet = null; g.trades = 0; g.pnl = 0; g.lastExitT = 0; g.lastNyorDay = ''; });
    this.state.accounts.forEach(a => this.resetAccount(a.id));
    this.state.log = ['Todas las cuentas reiniciadas'];
    this.changed();
  }

  /** Borra todo Juanitos Funding: cuentas, grupos, gasto e historial (las cuentas reales seguidas se mantienen). */
  wipeAll() {
    const keep = { real: this.state.real, source: this.state.source };
    this.state = { ...emptyState(), ...keep, processedT: this.state.processedT };
    this.changed();
  }

  /** Beneficio del mejor día y beneficio total (para la regla de consistencia). */
  consistency(a: Account) {
    const days = Object.values(a.daily);
    return { best: days.length ? Math.max(0, ...days) : 0, total: a.balance - a.start };
  }

  // -------------------------------------------------------------- simulación
  private process() {
    const bars = this.market.bars;
    if (bars.length === 0) { this.changed(); return; }
    const last = bars[bars.length - 1].t;
    if (this.freshStart) {
      this.freshStart = false;
      const sim = this.state.source === 'sim-live' || this.state.source === 'sim-fast';
      // En el simulador cada apertura genera un mercado nuevo: las posiciones anteriores se anulan.
      if (sim) {
        let voided = 0;
        this.state.accounts.forEach(a => { if (a.position) { a.position = null; voided++; } });
        if (voided) this.log(`${voided} posición(es) anuladas: el mercado simulado se ha reiniciado`);
        this.state.groups.forEach(g => { g.startedAt = Math.min(g.startedAt, last); g.jet = null; });
      }
      if (sim || this.state.processedT === 0 || this.state.processedT > last) this.state.processedT = last;
      // Con el panel cerrado el bot no operaba: en las velas atrasadas solo se revisan SL/TP de lo abierto,
      // sin entradas nuevas (las señales empiezan con la siguiente vela en directo).
      this.state.groups.forEach(g => { if (g.running) { g.startedAt = Math.max(g.startedAt, last); g.jet = null; } });
      // Posiciones de otra fuente de precio, o con un precio fuera de lugar (más de un 10 %): se anulan.
      const price = bars[bars.length - 1].c;
      let foreign = 0;
      this.state.accounts.forEach(a => {
        const p = a.position;
        if (!p) return;
        if ((p.source && p.source !== this.state.source) || Math.abs(p.entry / price - 1) > 0.1) { a.position = null; foreign++; }
        else p.source = this.state.source;
      });
      if (foreign) this.log(`${foreign} posición(es) anuladas: venían de otra fuente de precio`);
    }
    const start = bars.findIndex(b => b.t > this.state.processedT);
    if (start >= 0) {
      for (let i = start; i < bars.length; i++) this.onBar(bars, i);
      this.state.processedT = last;
    }
    this.changed();
  }

  private onBar(bars: Bar[], i: number) {
    const b = bars[i];
    const day = tradingDay(b.t);
    const closeMin = ny(b.t + 60).minutes;

    // 1. Cierre de día: el drawdown trailing se recalcula con el saldo al cierre
    for (const a of this.state.accounts) {
      if (a.lastDay && a.lastDay !== day) this.endOfDay(a, b.t);
      a.lastDay = day;
    }

    // 2. Salidas por SL / TP y liquidación por pérdida máxima
    for (const a of this.state.accounts) if (a.position) this.exitCheck(a, b, false);

    // 2b. Límites del día por cuenta (PDLL / PDPT) de los grupos en marcha
    for (const g of this.state.groups) {
      if (!g.running) continue;
      for (const id of g.accountIds) {
        const m = g.members[id], a = this.acc(id);
        if (!m || !a || (!m.pdll && !m.pdpt) || m.stopDay === day) continue;
        const open = a.position ? a.position.side * (b.c - a.position.entry) * MNQ.pointValue * a.position.qty : 0;
        const dayPnl = (a.daily[day] || 0) + open;
        const reason = m.pdll && dayPnl <= -m.pdll ? 'PDLL' : m.pdpt && dayPnl >= m.pdpt ? 'PDPT' : '';
        if (!reason) continue;
        if (a.position) this.close(a, b.c, b.t + 60, reason === 'PDLL' ? 'Pérdida del día (PDLL)' : 'Objetivo del día (PDPT)');
        m.stopDay = day; m.stopReason = reason;
        this.log(`${a.id}: ${reason} alcanzado (${Math.round(dayPnl)} $). Sin más operaciones hoy`, b.t + 60);
      }
    }

    // 3. Cierre obligatorio antes del cierre de sesión
    if (closeMin >= hm(RULES.flattenAt) && closeMin < hm('18:00'))
      for (const a of this.state.accounts) if (a.position) this.close(a, b.c, b.t + 60, 'Cierre de sesión');

    // 4. Señales
    const running = this.state.groups.filter(g => g.running && b.t > g.startedAt);
    if (running.length === 0) return;

    for (const g of running.filter(x => x.strategy === 'jetf1')) this.jetF1(g, b, day);

    // Estrategias de vela: cada grupo con su temporalidad (1, 3, 5 o 15 min)
    const byTf = new Map<number, Bar[]>();
    for (const g of running) {
      if (g.strategy === 'jetf1') continue;
      const tf = g.tf || 5;
      if ((b.t + 60) % (tf * 60) !== 0) continue;           // ¿se acaba de cerrar una vela de este grupo?
      let barsTf = byTf.get(tf);
      if (!barsTf) {
        barsTf = aggregate(bars.slice(Math.max(0, i - (tf * 210 + 60)), i + 1), tf);   // 200+ velas para la EMA 200
        byTf.set(tf, barsTf);
      }
      const bt = barsTf[barsTf.length - 1];
      if (bt.t <= g.startedAt) continue;
      if (g.lastExitT && bt.t < g.lastExitT) continue;       // 1 vela de espera tras cerrar
      let sig: 1 | -1 | 0 = 0;
      if (g.strategy === 'goatpro') sig = goatProSignal(barsTf, tf);
      else if (g.strategy === 'gyr') sig = gyrSignal(bt);
      else if (g.strategy === 'rangopenny' && g.lastNyorDay !== day) {
        sig = rangOpenSignal(barsTf, tf);
        if (sig) g.lastNyorDay = day;
      }
      if (sig) this.openGroup(g, sig, b.c, b.t + 60, day);
    }
  }

  private jetF1(g: Group, b: Bar, day: string) {
    if (isJetAnchorBar(b) && (!g.jet || g.jet.day !== day)) {
      g.jet = { day, up: roundTick(b.c + JET_TICKS * tick), down: roundTick(b.c - JET_TICKS * tick), expires: b.t + 120 };
      this.log(`${g.name}: ancla JetF1 @ ${b.c} → compra ${g.jet.up} / venta ${g.jet.down}`, b.t + 60);
      return;
    }
    const j = g.jet;
    if (!j || j.day !== day || j.up === 0) return;
    if (b.t >= j.expires) { j.up = 0; return; }     // caducan sin ejecutarse
    let hitUp = b.h >= j.up, hitDn = b.l <= j.down;
    if (hitUp && hitDn) { if (Math.abs(b.o - j.up) <= Math.abs(b.o - j.down)) hitDn = false; else hitUp = false; }
    if (!hitUp && !hitDn) return;
    const level = hitUp ? j.up : j.down;
    j.up = 0; j.down = 0;                           // OCO: solo una entrada por día
    this.openGroup(g, hitUp ? 1 : -1, level, b.t, day);
    // La entrada ocurre DENTRO de esta vela: se revisa ya su stop (supuesto conservador)
    for (const a of this.state.accounts) if (a.position?.groupId === g.id && a.position.entryT === b.t) this.exitCheck(a, b, true);
  }

  /** SL / TP con la vela b. Si ambos se tocan, cuenta el SL. En la vela de entrada, el TP solo si cierra más allá. */
  private exitCheck(a: Account, b: Bar, entryBar: boolean) {
    const p = a.position!;
    const slHit = p.side > 0 ? b.l <= p.sl : b.h >= p.sl;
    const tpHit = p.side > 0 ? b.h >= p.tp : b.l <= p.tp;
    if (slHit) this.close(a, p.sl - p.side * RULES.slippageTicks * tick, b.t + 60, 'Stop loss');
    else if (tpHit && (!entryBar || (p.side > 0 ? b.c >= p.tp : b.c <= p.tp))) this.close(a, p.tp, b.t + 60, 'Take profit');
    if (a.position) this.checkLiquidation(a, b);
  }

  private openGroup(g: Group, side: 1 | -1, price: number, t: number, day: string) {
    if (g.direction === 'largos' && side < 0) return;
    if (g.direction === 'cortos' && side > 0) return;
    let opened = 0;
    for (const id of this.activeMembers(g)) {
      const a = this.acc(id);
      const plan = a && planById(a.planId);
      const m = g.members[id];
      if (!a || !plan || !m || !m.enabled || m.stopDay === day || a.position || (a.status !== 'evaluacion' && a.status !== 'fondeada')) continue;
      const qty = Math.max(1, Math.min(m.qty, plan.maxMicros));
      const entry = roundTick(price + side * RULES.slippageTicks * tick);
      a.position = {
        side, qty, entry, entryT: t, groupId: g.id, strategy: g.strategy, source: this.state.source,
        sl: roundTick(entry - side * usdToPts(m.slUsd, qty)),
        tp: roundTick(entry + side * usdToPts(m.tpUsd, qty)),
      };
      opened++;
    }
    if (opened) this.log(`${g.name}: ${side > 0 ? 'COMPRA' : 'VENTA'} en ${opened} cuenta(s) @ ${roundTick(price)}`, t);
  }

  private close(a: Account, price: number, t: number, reason: string) {
    const p = a.position;
    if (!p) return;
    const exit = roundTick(price);
    const fees = RULES.commissionPerMicroRT * p.qty;
    const pnl = p.side * (exit - p.entry) * MNQ.pointValue * p.qty - fees;
    a.balance += pnl;
    a.fees += fees;
    const day = tradingDay(t - 60);
    a.daily[day] = (a.daily[day] || 0) + pnl;
    this.state.seq++;
    a.trades.unshift({ id: this.state.seq, accountId: a.id, groupId: p.groupId, strategy: p.strategy, side: p.side, qty: p.qty, entry: p.entry, exit, entryT: p.entryT, exitT: t, pnl, reason });
    if (a.trades.length > 150) a.trades.length = 150;
    a.position = null;
    const g = this.group(p.groupId);
    if (g) { g.trades++; g.pnl += pnl; g.lastExitT = t; }
    if (a.balance <= a.floor + 1e-9) this.burn(a, t);
    else this.checkPass(a, t);
  }

  /** Si el precio llega a la pérdida máxima dentro de la vela, se liquida en ese precio. */
  private checkLiquidation(a: Account, b: Bar) {
    const p = a.position!;
    const worst = p.side > 0 ? b.l : b.h;
    const eq = a.balance + p.side * (worst - p.entry) * MNQ.pointValue * p.qty - RULES.commissionPerMicroRT * p.qty;
    if (eq > a.floor) return;
    const liq = p.entry + p.side * ((a.floor - a.balance + RULES.commissionPerMicroRT * p.qty) / (MNQ.pointValue * p.qty));
    this.close(a, p.side > 0 ? Math.floor(liq / tick) * tick : Math.ceil(liq / tick) * tick, b.t + 60, 'Pérdida máxima');
  }

  private burn(a: Account, t: number) {
    if (a.status === 'quemada') return;
    a.status = 'quemada';
    this.log(`${a.id}: QUEMADA (pérdida máxima alcanzada)`, t);
  }

  private endOfDay(a: Account, t: number) {
    const plan = planById(a.planId);
    if (!plan || a.status === 'quemada') return;
    if (a.balance > a.highEod) a.highEod = a.balance;
    a.floor = Math.min(a.start, Math.max(a.floor, a.highEod - plan.maxLoss));   // se bloquea en el saldo inicial
    this.checkPass(a, t);
  }

  private checkPass(a: Account, t: number) {
    const plan = planById(a.planId);
    if (!plan || a.status !== 'evaluacion') return;
    const { best, total } = this.consistency(a);
    if (total >= plan.target && best <= total * RULES.consistency) {
      a.status = 'superada';
      this.log(`${a.id}: EVALUACIÓN SUPERADA (+${Math.round(total)} $)`, t);
    }
  }
}

export { PLANS };

// Un único motor por pestaña del navegador: sigue simulando aunque cambies de sección.
let instance: Engine | null = null;
export function getEngine() {
  if (!instance) instance = new Engine();
  return instance;
}
