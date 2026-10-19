// Señales de las 4 estrategias, traducidas de ninjatrader/Strategies (CCGoatPro, CCGYR, CCRangOpenNY, CCJetF1).
// Las velas llevan la hora de APERTURA (en NinjaTrader es la de cierre): por eso los horarios se calculan
// sobre la apertura + duración.
import type { Bar } from './market';
import { MNQ, hm, ny } from './plans';

export type StrategyKey = 'goatpro' | 'gyr' | 'rangopenny' | 'jetf1';

export const STRATEGY_INFO: Record<StrategyKey, { name: string; tf: 1 | 5; note: string }> = {
  goatpro: { name: 'GoatPro', tf: 5, note: 'Retroceso a la EMA 95 en tendencia (M5) · validada en backtest' },
  gyr: { name: 'GYR', tf: 5, note: 'Color de la vela cerrada (M5) · sin validar' },
  rangopenny: { name: 'RangOpenNY', tf: 5, note: 'Ruptura de la caja 09:00–09:30 NY (M5) · sin validar' },
  jetf1: { name: 'JetF1', tf: 1, note: 'Stop arriba/abajo a las 09:29:58 NY (M1) · no recomendada' },
};

export function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  values.forEach((v, i) => out.push(i === 0 ? v : v * k + out[i - 1] * (1 - k)));
  return out;
}

const T = MNQ.tick;

/** GoatPro sobre la última vela de 5 min (bars5 ya cerradas). */
export function goatProSignal(bars5: Bar[]): 1 | -1 | 0 {
  if (bars5.length < 200) return 0;
  const closes = bars5.map(b => b.c);
  const f = ema(closes, 20), m = ema(closes, 95), s = ema(closes, 200);
  const i = bars5.length - 1, b = bars5[i];
  // Sesión 18:00 → 16:00 NY (sobre la hora de cierre de la vela)
  const closeMin = ny(b.t + 300).minutes;
  if (closeMin > hm('16:00') && closeMin < hm('18:00')) return 0;
  const body = Math.abs(b.c - b.o);
  if (body < 1 * T) return 0;
  const e = m[i];
  const up = f[i] > m[i] && m[i] > s[i];
  const down = f[i] < m[i] && m[i] < s[i];
  if (up && b.c > b.o && b.o >= e + 1 * T && b.l <= e + 10 * T && b.c > e) return 1;
  if (down && b.c < b.o && b.o <= e - 1 * T && b.h >= e - 9 * T && b.c < e) return -1;
  return 0;
}

/** GYR: verde compra, roja vende, doji nada. */
export function gyrSignal(b: Bar): 1 | -1 | 0 {
  if (b.c > b.o) return 1;
  if (b.c < b.o) return -1;
  return 0;
}

/** RangOpenNY: caja 09:00–09:30 NY y ruptura con cierre ±10 ticks entre 09:30 y 10:00. */
export function rangOpenSignal(bars5: Bar[]): 1 | -1 | 0 {
  const b = bars5[bars5.length - 1];
  if (!b) return 0;
  const p = ny(b.t);
  const closeMin = p.minutes + 5;
  if (closeMin <= hm('09:30') || closeMin > hm('10:00')) return 0;
  const box = bars5.filter(x => { const q = ny(x.t); return q.date === p.date && q.minutes >= hm('09:00') && q.minutes + 5 <= hm('09:30'); });
  if (box.length < 4 || box.length > 8) return 0;
  // Solape medio de cuerpos entre velas consecutivas >= 40 %
  let sum = 0;
  for (let i = 1; i < box.length; i++) {
    const a0 = Math.min(box[i - 1].o, box[i - 1].c), a1 = Math.max(box[i - 1].o, box[i - 1].c);
    const b0 = Math.min(box[i].o, box[i].c), b1 = Math.max(box[i].o, box[i].c);
    const inter = Math.min(a1, b1) - Math.max(a0, b0);
    const minBody = Math.min(a1 - a0, b1 - b0);
    sum += minBody <= 0 ? (inter >= 0 ? 100 : 0) : Math.max(0, inter) / minBody * 100;
  }
  if (sum / (box.length - 1) < 40) return 0;
  const hi = Math.max(...box.map(x => x.h)), lo = Math.min(...box.map(x => x.l));
  if (b.c >= hi + 10 * T) return 1;
  if (b.c <= lo - 10 * T) return -1;
  return 0;
}

/** JetF1: ¿esta vela de 1 min contiene la hora ancla 09:29:58 NY? (vela de las 09:29). */
export const isJetAnchorBar = (b: Bar) => ny(b.t).minutes === hm('09:29');
export const JET_TICKS = 4;
