// Fuentes de precio del MNQ para Juanitos Funding.
//  - nt:       MNQ en TIEMPO REAL desde NinjaTrader (puente CCBridge, http://localhost:8793/api/market).
//  - yahoo:    MNQ=F de Yahoo Finance (gratis, con ~10 min de retraso). Pasa por el proxy de Vite (/yahoo).
//  - sim-live: mercado simulado, 1 vela por minuto real.
//  - sim-fast: mercado simulado acelerado 60× (1 vela de 1 min por segundo).
import { MNQ, ny } from './plans';
import { BRIDGE_URL } from '../panel/api';

export const NT_INSTRUMENT = 'MNQ 12-26';

export type Bar = { t: number; o: number; h: number; l: number; c: number };   // t = apertura (epoch s, UTC)
export type SourceId = 'nt' | 'yahoo' | 'sim-live' | 'sim-fast';

export const SOURCES: { id: SourceId; label: string; note: string }[] = [
  { id: 'nt', label: 'Tiempo real (NinjaTrader)', note: `Precio real de ${NT_INSTRUMENT} en tiempo real desde tu NinjaTrader. Necesita NinjaTrader abierto y conectado con el AddOn instalado.` },
  { id: 'yahoo', label: 'MNQ real (Yahoo)', note: 'Precio real del MNQ con unos 10 minutos de retraso.' },
  { id: 'sim-live', label: 'Simulado', note: 'Mercado inventado a velocidad real.' },
  { id: 'sim-fast', label: 'Simulado rápido', note: 'Mercado inventado 60× más rápido: un día en 24 minutos.' },
];

export type MarketStatus = { source: SourceId; ok: boolean; message: string; updated: number; warning?: string };
export type NtConnection = { name: string; status: string; price: string };

/** ¿La conexión de NinjaTrader es la elegida? Sin distinguir mayúsculas; vale si un nombre contiene al otro. */
export function connectionMatches(name: string, wanted: string) {
  const a = name.trim().toLowerCase(), b = wanted.trim().toLowerCase();
  return !!a && !!b && (a === b || a.includes(b) || b.includes(a));
}

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
  ntConnections: NtConnection[] = [];
  /** Precio de referencia del MNQ real (Yahoo, con retraso) para comprobar que NinjaTrader no da precios inventados. */
  reference: { price: number; at: number } | null = null;
  /** false = el precio de NinjaTrader no es fiable: el bot no abre operaciones. */
  trusted = true;
  private refAsked = 0;
  private ntGen = -1;
  private lastPriceSeen = 0;
  private lastPriceChangeAt = 0;
  /** Única conexión de NinjaTrader de la que se acepta el precio (p. ej. la cuenta de Lucid). */
  requiredConnection = '';
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
    if (this.source === 'nt') {
      void this.pollNt(gen);
      this.timer = window.setInterval(() => void this.pollNt(gen), 1000);
    } else if (this.source === 'yahoo') {
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

  private setStatus(ok: boolean, message: string, warning?: string) {
    this.status = { source: this.source, ok, message, updated: Date.now(), warning };
    this.emit();
  }

  private ntBusy = false;
  private async pollNt(gen: number) {
    if (this.ntBusy) return;
    this.ntBusy = true;
    try {
      const since = this.ntGen >= 0 && this.bars.length ? this.bars[this.bars.length - 1].t : 0;
      const res = await fetch(`${BRIDGE_URL}/api/market?instrument=${encodeURIComponent(NT_INSTRUMENT)}&since=${since}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json() as { gen?: number; loaded: boolean; error: string | null; last: number; bars: number[][]; connections?: NtConnection[] };
      if (gen !== this.generation) return;
      // NinjaTrader ha vuelto a descargar las velas (p. ej. al cambiar de conexión): se descartan las antiguas
      if (typeof d.gen === 'number' && d.gen !== this.ntGen) {
        const fresh = this.ntGen >= 0 || since > 0;
        this.ntGen = d.gen;
        if (fresh) { this.bars = []; this.last = 0; return; }   // la siguiente consulta trae todo el historial nuevo
      }
      this.ntConnections = d.connections || [];
      const live = this.ntConnections.filter(c => c.price === 'Connected');
      const simulated = live.filter(c => /simulat|playback|replay/i.test(c.name));
      const req = this.requiredConnection.trim();
      const reqLive = !req || live.some(c => connectionMatches(c.name, req));
      const others = live.filter(c => !connectionMatches(c.name, req));
      const warning = live.length === 0
        ? 'NinjaTrader no tiene ninguna conexión de datos activa: el precio puede estar parado o ser antiguo.'
        : !reqLive
          ? `El precio solo se acepta de la conexión "${req}", y en NinjaTrader no está conectada (ahora: ${live.map(c => c.name).join(', ')}).`
          : req && others.length
            ? `Además de "${req}" hay otras conexiones de datos (${others.map(c => c.name).join(', ')}): NinjaTrader podría sacar el precio de ellas. Desconéctalas.`
            : simulated.length === live.length
              ? `NinjaTrader está conectado a "${simulated.map(c => c.name).join(', ')}": esos precios son INVENTADOS por NinjaTrader, no el MNQ real.`
              : undefined;
      if (d.error) { this.trusted = false; this.setStatus(false, d.error); return; }
      if (!d.loaded) { this.setStatus(false, 'Cargando datos de NinjaTrader…'); return; }
      const lastT = this.bars.length ? this.bars[this.bars.length - 1].t : 0;
      for (const [t, o, h, l, c] of d.bars) if (t > lastT) this.bars.push({ t, o, h, l, c });
      if (this.bars.length > 8000) this.bars.splice(0, this.bars.length - 8000);
      if (d.last) {
        if (d.last !== this.lastPriceSeen) { this.lastPriceSeen = d.last; this.lastPriceChangeAt = Date.now(); }
        this.last = d.last;
      }
      void this.checkReference(gen);
      let w = warning;
      // El precio se mueve pero no llegan velas cerradas: sin velas nuevas no hay señales
      const lastClose = this.bars.length ? (this.bars[this.bars.length - 1].t + 60) * 1000 : 0;
      if (!w && lastClose && Date.now() - this.lastPriceChangeAt < 90000 && Date.now() - lastClose > 180000) {
        w = `NinjaTrader actualiza el precio pero no cierra velas de 1 minuto (la última cerró hace ${Math.round((Date.now() - lastClose) / 60000)} min). Sin velas nuevas el bot no recibe señales.`;
      }
      const ref = this.reference;
      if (!w && ref && this.last > 0 && Math.abs(this.last / ref.price - 1) > 0.02) {
        w = `El precio de NinjaTrader (${this.last.toFixed(2)}) no se parece al del MNQ real (~${ref.price.toFixed(2)} según Yahoo). NinjaTrader no está recibiendo datos reales.`;
      }
      this.trusted = !w;
      this.setStatus(true, `${NT_INSTRUMENT} en tiempo real · NinjaTrader`, w);
    } catch {
      if (gen === this.generation) { this.trusted = false; this.setStatus(false, 'NinjaTrader no está abierto o no tiene el AddOn (localhost:8793)'); }
    } finally {
      this.ntBusy = false;
    }
  }

  /** Cada minuto: último precio del MNQ en Yahoo como referencia (si el proxy /yahoo funciona). */
  private async checkReference(gen: number) {
    if (Date.now() - this.refAsked < 60000) return;
    this.refAsked = Date.now();
    try {
      const res = await fetch('/yahoo/v8/finance/chart/MNQ=F?interval=1m&range=1d', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const closes: (number | null)[] = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];
      const last = [...closes].reverse().find((v): v is number => typeof v === 'number');
      if (gen === this.generation && last) this.reference = { price: last, at: Date.now() };
    } catch { /* sin referencia: se usa solo la comprobación de conexiones */ }
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
