// Fuentes de precio del MNQ para Juanitos Funding.
//  - yahoo:    MNQ=F de Yahoo Finance (gratis, con ~10 min de retraso). Pasa por el proxy de Vite (/yahoo).
//  - sim-live: mercado simulado, 1 vela por minuto real.
//  - sim-fast: mercado simulado acelerado 60× (1 vela de 1 min por segundo).
import { MNQ, ny } from './plans';

export type Bar = { t: number; o: number; h: number; l: number; c: number };   // t = apertura (epoch s, UTC)
export type SourceId = 'yahoo' | 'sim-live' | 'sim-fast';

export const SOURCES: { id: SourceId; label: string; note: string }[] = [
  { id: 'yahoo', label: 'MNQ real (Yahoo)', note: 'Precio real del MNQ con unos 10 minutos de retraso.' },
  { id: 'sim-live', label: 'Simulado', note: 'Mercado inventado a velocidad real.' },
  { id: 'sim-fast', label: 'Simulado rápido', note: 'Mercado inventado 60× más rápido: un día en 24 minutos.' },
];

export type MarketStatus = { source: SourceId; ok: boolean; message: string; updated: number };

type Listener = () => void;

const round = (p: number) => Math.round(p / MNQ.tick) * MNQ.tick;

// ------------------------------------------------------------------ simulador
class SimGenerator {
  private rnd: () => number;
  private price: number;
  private t: number;

  constructor(seed: number, startT: number, startPrice = 21500) {
    let s = seed >>> 0;
    this.rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    this.price = startPrice;
    this.t = startT;
  }

  private gauss() {
    const u = Math.max(this.rnd(), 1e-9), v = this.rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Siguiente vela de 1 minuto (salta la pausa 17:00–18:00 NY). */
  next(): Bar {
    let m = ny(this.t).minutes;
    while (m >= 17 * 60 && m < 18 * 60) { this.t += 60; m = ny(this.t).minutes; }
    // Más volatilidad en la apertura de NY, menos de noche
    const vol = m >= 570 && m < 630 ? 9 : m >= 630 && m < 960 ? 5 : 2.5;
    const o = this.price;
    let h = o, l = o, p = o;
    for (let i = 0; i < 6; i++) {
      p += this.gauss() * vol / 2.4 + 0.02;
      h = Math.max(h, p); l = Math.min(l, p);
    }
    const bar = { t: this.t, o: round(o), h: round(h + this.rnd() * vol * 0.3), l: round(l - this.rnd() * vol * 0.3), c: round(p) };
    bar.h = Math.max(bar.h, bar.o, bar.c);
    bar.l = Math.min(bar.l, bar.o, bar.c);
    this.price = bar.c;
    this.t += 60;
    return bar;
  }
}

// ------------------------------------------------------------------ mercado
export class Market {
  bars: Bar[] = [];          // velas de 1 min CERRADAS
  last = 0;                  // último precio (incluye la vela en formación)
  status: MarketStatus;
  private listeners = new Set<Listener>();
  private timer = 0;
  private sim: SimGenerator | null = null;
  private generation = 0;

  constructor(public source: SourceId) {
    this.status = { source, ok: false, message: 'Conectando…', updated: 0 };
  }

  subscribe(fn: Listener) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit() { this.listeners.forEach(f => f()); }

  start() {
    this.stop();
    const gen = ++this.generation;
    this.bars = [];
    if (this.source === 'yahoo') {
      void this.pollYahoo(gen, '5d');
      this.timer = window.setInterval(() => void this.pollYahoo(gen, '1d'), 15000);
    } else {
      const now = Math.floor(Date.now() / 60000) * 60;
      this.sim = new SimGenerator(now / 60, now - 4 * 86400);
      while (true) {
        const b = this.sim.next();
        this.bars.push(b);
        if (b.t >= now - 60) break;
      }
      this.last = this.bars[this.bars.length - 1].c;
      this.setStatus(true, 'Mercado simulado');
      this.timer = window.setInterval(() => {
        if (!this.sim) return;
        const b = this.sim.next();
        this.bars.push(b);
        if (this.bars.length > 8000) this.bars.splice(0, this.bars.length - 8000);
        this.last = b.c;
        this.setStatus(true, 'Mercado simulado');
      }, this.source === 'sim-fast' ? 1000 : 60000);
    }
  }

  stop() {
    window.clearInterval(this.timer);
    this.timer = 0;
    this.sim = null;
  }

  private setStatus(ok: boolean, message: string) {
    this.status = { source: this.source, ok, message, updated: Date.now() };
    this.emit();
  }

  private async pollYahoo(gen: number, range: string) {
    try {
      const res = await fetch(`/yahoo/v8/finance/chart/MNQ=F?interval=1m&range=${range}&includePrePost=true`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Yahoo respondió ${res.status}`);
      const data = await res.json();
      const r = data?.chart?.result?.[0];
      const ts: number[] = r?.timestamp || [];
      const q = r?.indicators?.quote?.[0] || {};
      const fresh: Bar[] = [];
      for (let i = 0; i < ts.length; i++) {
        const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
        if ([o, h, l, c].some(v => typeof v !== 'number')) continue;
        fresh.push({ t: ts[i] - (ts[i] % 60), o: round(o), h: round(h), l: round(l), c: round(c) });
      }
      if (gen !== this.generation) return;
      if (fresh.length === 0) throw new Error('Yahoo no devolvió velas (¿mercado cerrado?)');
      this.last = fresh[fresh.length - 1].c;
      const closed = fresh.slice(0, -1);              // la última vela aún se está formando
      const lastT = this.bars.length ? this.bars[this.bars.length - 1].t : 0;
      for (const b of closed) if (b.t > lastT) this.bars.push(b);
      if (this.bars.length > 8000) this.bars.splice(0, this.bars.length - 8000);
      this.setStatus(true, 'MNQ real · retraso aprox. 10 min');
    } catch (e) {
      if (gen !== this.generation) return;
      this.setStatus(false, `${e instanceof Error ? `Sin datos de Yahoo (${e.message})` : 'Sin datos de Yahoo'} · usa la fuente Simulado`);
    }
  }
}

/** Agrupa velas de 1 min en velas de N min (alineadas al reloj). */
export function aggregate(bars: Bar[], minutes: number): Bar[] {
  const out: Bar[] = [];
  const size = minutes * 60;
  for (const b of bars) {
    const t = b.t - (b.t % size);
    const cur = out[out.length - 1];
    if (cur && cur.t === t) {
      cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l); cur.c = b.c;
    } else out.push({ t, o: b.o, h: b.h, l: b.l, c: b.c });
  }
  return out;
}
