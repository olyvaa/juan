// Ficha fija de cada estrategia de ninjatrader/Strategies.

export type Verdict = 'validada' | 'sin-validar' | 'no-recomendada' | 'herramienta';

export type StrategyInfo = {
  key: string;          // nombre de la estrategia en NinjaTrader
  name: string;
  tagline: string;
  description: string;
  chart: string;
  verdict: Verdict;
  verdictNote: string;
};

export const CATALOG: StrategyInfo[] = [
  {
    key: 'CCGoatPro',
    name: 'GoatPro',
    tagline: 'Retroceso a la EMA 95 en tendencia',
    description:
      'Con tendencia ordenada (EMA 20 > 95 > 200 o al revés), entra cuando la mecha toca la EMA 95 y la vela cierra rebotando a favor.',
    chart: 'MNQ · 5 min · ETH',
    verdict: 'validada',
    verdictNote: 'Gana en enero–junio y en julio–octubre de 2026.',
  },
  {
    key: 'CCGYR',
    name: 'GYR',
    tagline: 'Color de la vela cerrada',
    description: 'Vela verde → compra, roja → venta, doji → nada. Una posición a la vez.',
    chart: 'MNQ · 5 min · ETH',
    verdict: 'validada',
    verdictNote: 'Con TP 1.500 $ / SL 2.000 $ sale cerca de quedar en tablas.',
  },
  {
    key: 'CCRangOpenNY',
    name: 'RangOpenNY',
    tagline: 'Ruptura del rango de apertura de Nueva York',
    description:
      'Caja 09:00–09:30 NY validada por número de velas y solape. Entra si una vela cierra ±10 ticks fuera antes de las 10:00.',
    chart: 'MNQ · 5 min · ETH (obligatorio)',
    verdict: 'validada',
    verdictNote: 'Falta el backtest en dos periodos.',
  },
  {
    key: 'CCJetF1',
    name: 'JetF1',
    tagline: 'Coete: stop arriba y abajo a las 09:29:58 NY',
    description: 'Coloca compra y venta stop en OCO justo antes de la apertura. Modo Fade y runner opcionales.',
    chart: 'MNQ · 1 min · ETH (obligatorio)',
    verdict: 'validada',
    verdictNote: 'Ninguna de 3.600 combinaciones fue estable en los dos periodos.',
  },
];

export const VERDICT_LABEL: Record<Verdict, string> = {
  validada: 'Validada',
  'sin-validar': 'Sin validar',
  'no-recomendada': 'No recomendada',
  herramienta: 'Herramienta',
};

export const GOATPRO_RESULTS = [
  { period: 'Enero – junio 2026', net: 25779.2, long: 39096, short: -13316.8 },
  { period: 'Julio – octubre 2026', net: 26060.4, long: -6522, short: 32582.4 },
];
