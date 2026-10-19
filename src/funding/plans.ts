// Juanitos Funding: prop firm SIMULADA. Planes basados en las condiciones publicadas de LucidFlex
// (reseñas de 2026). Precios ficticios: aquí no se paga nada.

export type Plan = {
  id: string;
  name: string;
  size: number;        // capital de la cuenta
  price: number;       // precio ficticio de la evaluación
  target: number;      // objetivo de beneficio de la evaluación
  maxLoss: number;     // pérdida máxima (trailing al cierre del día)
  maxMicros: number;   // contratos máximos (MNQ)
};

export const PLANS: Plan[] = [
  { id: 'flex25', name: 'Flex 25K', size: 25000, price: 100, target: 1250, maxLoss: 1000, maxMicros: 20 },
  { id: 'flex50', name: 'Flex 50K', size: 50000, price: 130, target: 3000, maxLoss: 2000, maxMicros: 40 },
  { id: 'flex100', name: 'Flex 100K', size: 100000, price: 225, target: 6000, maxLoss: 3000, maxMicros: 60 },
  { id: 'flex150', name: 'Flex 150K', size: 150000, price: 340, target: 9000, maxLoss: 4500, maxMicros: 100 },
];

export const RULES = {
  consistency: 0.5,          // en evaluación, el mejor día no puede superar el 50 % del beneficio total
  commissionPerMicroRT: 1,   // $ por micro, ida y vuelta (simulado)
  slippageTicks: 1,          // en entradas a mercado y stops
  flattenAt: '16:55',        // hora NY a la que se cierran las posiciones
};

export const planById = (id: string) => PLANS.find(p => p.id === id);

// ------------------------------------------------------------------ MNQ
export const MNQ = { symbol: 'MNQ', tick: 0.25, pointValue: 2 };

// ------------------------------------------------------------------ hora de Nueva York
const nyFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', hour12: false,
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
});

export type NyParts = { date: string; minutes: number };   // minutes = minuto del día (0..1439)

const nyCache = new Map<number, NyParts>();
export function ny(tSec: number): NyParts {
  const hit = nyCache.get(tSec);
  if (hit) return hit;
  const p: Record<string, string> = {};
  for (const x of nyFmt.formatToParts(new Date(tSec * 1000))) p[x.type] = x.value;
  const h = Number(p.hour) % 24;
  const r = { date: `${p.year}-${p.month}-${p.day}`, minutes: h * 60 + Number(p.minute) };
  if (nyCache.size > 50000) nyCache.clear();
  nyCache.set(tSec, r);
  return r;
}

/** Día de trading CME: empieza a las 18:00 NY del día anterior. */
export const tradingDay = (tSec: number) => ny(tSec + 6 * 3600).date;

export const hm = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

export const fmtNy = (tSec: number) => {
  const p = ny(tSec);
  return `${p.date.slice(8, 10)}/${p.date.slice(5, 7)} ${String(Math.floor(p.minutes / 60)).padStart(2, '0')}:${String(p.minutes % 60).padStart(2, '0')}`;
};
