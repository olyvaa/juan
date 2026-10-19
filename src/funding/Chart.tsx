import { useEffect, useRef } from 'react';
import { createChart, CrosshairMode, type IChartApi, type ISeriesApi, type SeriesMarker, type UTCTimestamp } from 'lightweight-charts';
import { aggregate, type Bar } from './market';
import { fmtNy, ny } from './plans';

export type ChartMarker = { t: number; side: 1 | -1; kind: 'entry' | 'exit'; text: string; win?: boolean };

function themeColors() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  return { ink: v('--ink-2'), line: v('--line'), up: v('--good'), down: v('--bad'), accent: v('--accent') };
}

/** Gráfico de velas del MNQ (horas en NY). */
export default function Chart({ bars, tf, markers }: { bars: Bar[]; tf: 1 | 5; markers: ChartMarker[] }) {
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const fitted = useRef(false);

  useEffect(() => {
    if (!box.current) return;
    const c = createChart(box.current, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Segoe UI", sans-serif', fontSize: 11 },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderVisible: false },
      timeScale: {
        borderVisible: false, timeVisible: true, secondsVisible: false, rightOffset: 6,
        tickMarkFormatter: (t: number) => { const m = ny(t).minutes; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; },
      },
      localization: { timeFormatter: (t: number) => `${fmtNy(t)} NY`, priceFormatter: (p: number) => p.toFixed(2) },
    });
    const s = c.addCandlestickSeries({ priceFormat: { type: 'price', precision: 2, minMove: 0.25 } });
    chart.current = c;
    series.current = s;

    const applyTheme = () => {
      const k = themeColors();
      c.applyOptions({
        layout: { textColor: k.ink },
        grid: { vertLines: { color: k.line }, horzLines: { color: k.line } },
      });
      s.applyOptions({ upColor: k.up, downColor: k.down, borderUpColor: k.up, borderDownColor: k.down, wickUpColor: k.up, wickDownColor: k.down });
    };
    applyTheme();
    const mo = new MutationObserver(applyTheme);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', applyTheme);
    return () => { mo.disconnect(); mq.removeEventListener('change', applyTheme); c.remove(); chart.current = null; series.current = null; };
  }, []);

  useEffect(() => { fitted.current = false; }, [tf]);

  useEffect(() => {
    const s = series.current, c = chart.current;
    if (!s || !c) return;
    const data = (tf === 1 ? bars : aggregate(bars, 5)).map(b => ({ time: b.t as UTCTimestamp, open: b.o, high: b.h, low: b.l, close: b.c }));
    s.setData(data);
    const size = tf * 60;
    const k = themeColors();
    const ms: SeriesMarker<UTCTimestamp>[] = markers
      .map(m => ({
        time: (m.t - (m.t % size)) as UTCTimestamp,
        position: m.kind === 'entry' ? (m.side > 0 ? 'belowBar' : 'aboveBar') : (m.side > 0 ? 'aboveBar' : 'belowBar'),
        shape: m.kind === 'entry' ? (m.side > 0 ? 'arrowUp' : 'arrowDown') : 'circle',
        color: m.kind === 'entry' ? k.accent : (m.win ? k.up : k.down),
        text: m.text,
      } as SeriesMarker<UTCTimestamp>))
      .filter(m => data.length && m.time >= data[0].time)
      .sort((a, b) => a.time - b.time);
    s.setMarkers(ms);
    if (!fitted.current && data.length) {
      c.timeScale().setVisibleLogicalRange({ from: Math.max(0, data.length - (tf === 1 ? 180 : 120)), to: data.length + 6 });
      fitted.current = true;
    }
  }, [bars, tf, markers]);

  return <div className="chart" ref={box} role="img" aria-label="Gráfico de velas del MNQ" />;
}
