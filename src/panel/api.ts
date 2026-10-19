// Conexión con el puente local de NinjaTrader (AddOn CCBridge, http://localhost:8793).
// Si NinjaTrader no está abierto, el panel usa datos de ejemplo y no envía nada.

export const BRIDGE_URL = 'http://localhost:8793';

export type StrategyRun = {
  id: string;
  strategy: string;
  account: string;
  instrument: string;
  position: string;
  dayPnl: number;
  lastEvent: string;
  paused: boolean;
  started: string;
};

export type Follower = { account: string; multiplier: number; inverse: boolean };

export type Copier = { running: boolean; master: string; followers: Follower[]; log: string[] };

export type AccountPosition = { instrument: string; qty: number; avgPrice: number };

export type AccountInfo = {
  name: string;
  sim: boolean;
  cash: number;
  realized: number;
  unrealized: number;
  positions: AccountPosition[];
};

export type BridgeState = {
  connected: boolean;
  time: string;
  strategies: StrategyRun[];
  copier: Copier;
  accounts: AccountInfo[];
};

export async function fetchState(signal?: AbortSignal): Promise<BridgeState> {
  const res = await fetch(`${BRIDGE_URL}/api/state`, { cache: 'no-store', signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as BridgeState;
}

export async function sendCommand(path: string, body: unknown = {}): Promise<string> {
  const res = await fetch(`${BRIDGE_URL}/api/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CC-Panel': '1' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data.message || 'Hecho';
}

// ---------------------------------------------------------------- modo demo
const now = () => new Date().toTimeString().slice(0, 8);

export function demoState(): BridgeState {
  return {
    connected: false,
    time: new Date().toISOString(),
    strategies: [
      { id: 'demo-goat', strategy: 'CCGoatPro', account: 'Sim101', instrument: 'MNQ 12-26', position: 'Largo 2', dayPnl: 182.5, lastEvent: '10:45 COMPRA 2 ct', paused: false, started: '' },
      { id: 'demo-jet', strategy: 'CCJetF1', account: 'Sim102', instrument: 'MNQ 12-26', position: 'Plano', dayPnl: -40, lastEvent: '09:29:58 ancla RUPTURA', paused: true, started: '' },
    ],
    copier: {
      running: false,
      master: '',
      followers: [],
      log: [`${now()}  Modo demo: el copiador no está conectado a NinjaTrader.`],
    },
    accounts: [
      { name: 'Sim101', sim: true, cash: 50182.5, realized: 0, unrealized: 182.5, positions: [{ instrument: 'MNQ 12-26', qty: 2, avgPrice: 21450.25 }] },
      { name: 'Sim102', sim: true, cash: 49960, realized: -40, unrealized: 0, positions: [] },
      { name: 'SimEval50K', sim: true, cash: 50000, realized: 0, unrealized: 0, positions: [] },
      { name: 'LUCID-4821', sim: false, cash: 51240, realized: 0, unrealized: 0, positions: [] },
    ],
  };
}

/** Aplica un comando sobre el estado de ejemplo (no se envía nada). */
export function demoApply(state: BridgeState, path: string, body: unknown): BridgeState {
  const s: BridgeState = JSON.parse(JSON.stringify(state));
  const log = (m: string) => s.copier.log.unshift(`${now()}  ${m}`);
  const [kind, id, action] = path.split('/');
  if (kind === 'strategies') {
    const run = s.strategies.find(r => r.id === id);
    if (run && action === 'pause') run.paused = true;
    if (run && action === 'resume') run.paused = false;
    if (run && action === 'flatten') { run.position = 'Plano'; run.lastEvent = 'Cierre desde panel'; }
  } else if (kind === 'killswitch') {
    s.strategies.forEach(r => { r.paused = true; r.position = 'Plano'; });
  } else if (kind === 'copier') {
    if (id === 'start') {
      const b = body as { master: string; followers: Follower[] };
      s.copier = { ...s.copier, running: true, master: b.master, followers: b.followers };
      log(`COPIADOR ACTIVO (demo): ${b.master} -> ${b.followers.map(f => `${f.account} x${f.multiplier}${f.inverse ? ' (inverso)' : ''}`).join(', ')}`);
    }
    if (id === 'stop') { s.copier = { ...s.copier, running: false, master: '', followers: [] }; log('Copiador DETENIDO (demo).'); }
    if (id === 'sync') log('Sincronización (demo).');
    if (id === 'flatten') log('Cierre de posiciones copiadas (demo).');
  }
  return s;
}
