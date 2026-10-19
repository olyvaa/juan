#region Using declarations
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using NinjaTrader.Cbi;
using NinjaTrader.Data;
using NinjaTrader.NinjaScript;
using NinjaTrader.NinjaScript.DrawingTools;
#endregion

// ============================================================================
//  RangOpenNY - Rango de apertura de Nueva York (M5)
//   1. Caja = maximo/minimo de las velas entre "Caja desde" y "Caja hasta" (NY).
//   2. La caja solo es valida si:
//        - numero de velas entre Min y Max
//        - solape medio de cuerpos entre velas consecutivas >= % solape
//        - tamano en ticks dentro de [Min ticks, Max ticks] (0 = sin limite)
//   3. Desde "Ruptura desde" hasta "Operar hasta": si una vela CIERRA
//      por encima de maximo + N ticks -> COMPRA a mercado; por debajo de
//      minimo - N ticks -> VENTA a mercado.
//   4. Una sola operacion por dia (las falsas rupturas no se reintentan).
//  Las horas son NY siempre (se convierte desde la zona horaria de NT).
//  Valores por defecto = bots.json (b_core_nyor).
// ============================================================================
namespace NinjaTrader.NinjaScript.Strategies
{
	public class CCRangOpenNY : CCBase
	{
		private double boxHigh;
		private double boxLow;
		private readonly List<double[]> bodies = new List<double[]>();
		private bool boxReady;
		private bool boxValid;
		private bool tradedToday;
		private DateTime firstBarNy;   // diagnostico: primera vela del dia en hora NY
		private bool warned;

		protected override void OnStateChange()
		{
			if (State == State.SetDefaults)
			{
				Description = "Clon RangOpenNY - ruptura del rango de apertura NY (Command Pro)";
				Name        = "CCRangOpenNY";
				ApplyBaseDefaults();
				BarsRequiredToTrade = 1;

				BoxFrom      = "09:00";
				BoxTo        = "09:30";
				BreakFrom    = "09:30";
				TradeUntil   = "10:00";
				BreakTicks   = 10;
				MinBars      = 4;
				MaxBars      = 8;
				OverlapPct   = 40;
				MinBoxTicks  = 0;
				MaxBoxTicks  = 0;
				FlattenAtUntil = false;
			}
			base.OnStateChange();
		}

		protected override void OnNewNyDay(DateTime nyDate)
		{
			boxHigh = double.MinValue;
			boxLow  = double.MaxValue;
			bodies.Clear();
			boxReady    = false;
			boxValid    = false;
			tradedToday = false;
			firstBarNy  = DateTime.MinValue;
		}

		protected override int GetSignal()
		{
			// Una operacion por dia: cuenta entradas ya ejecutadas (aunque ya se cerraran).
			if (Position.MarketPosition != MarketPosition.Flat || TradesToday > 0)
				tradedToday = true;

			// En NinjaTrader la hora de la vela es la de CIERRE.
			DateTime nyClose = ToNy(Time[0]);
			TimeSpan close   = nyClose.TimeOfDay;
			TimeSpan open    = close - BarDuration();
			if (firstBarNy == DateTime.MinValue) firstBarNy = nyClose;

			TimeSpan from  = ParseHm(BoxFrom,    new TimeSpan(9, 0, 0));
			TimeSpan to    = ParseHm(BoxTo,      new TimeSpan(9, 30, 0));
			TimeSpan bFrom = ParseHm(BreakFrom,  new TimeSpan(9, 30, 0));
			TimeSpan until = ParseHm(TradeUntil, new TimeSpan(10, 0, 0));

			// 1. Construir la caja
			if (!boxReady && open >= from && close <= to)
			{
				boxHigh = Math.Max(boxHigh, High[0]);
				boxLow  = Math.Min(boxLow,  Low[0]);
				bodies.Add(new[] { Math.Min(Open[0], Close[0]), Math.Max(Open[0], Close[0]) });
			}

			if (!boxReady && close >= to && close < until && bodies.Count == 0)
			{
				boxReady = true;
				string msg = string.Format("{0}: caja VACIA el {1:dd/MM} - no hay velas entre {2} y {3} NY (primera vela del dia: {4:HH:mm} NY). "
					+ "Seguramente el horario es RTH (empieza 09:30). Cambia 'Trading hours' a 'CME US Index Futures ETH'.",
					Name, nyClose, BoxFrom, BoxTo, firstBarNy);
				Print(msg);
				if (!warned) { warned = true; Log(msg, LogLevel.Warning); }
			}

			if (!boxReady && close >= to && bodies.Count > 0)
			{
				boxReady = true;
				boxValid = ValidateBox();
				Print(string.Format("{0} {1}: caja {2}-{3} | velas {4} | solape {5:0}% | {6}",
					Time[0], Name, boxLow, boxHigh, bodies.Count, AvgOverlap(), boxValid ? "VALIDA" : "NO valida"));
				if (boxValid)
				{
					string tag = "CCbox" + nyClose.ToString("yyyyMMdd");
					Draw.Rectangle(this, tag, false, BarsAgo(from, nyClose), boxHigh, 0, boxLow,
						System.Windows.Media.Brushes.DodgerBlue, System.Windows.Media.Brushes.DodgerBlue, 15);
				}
			}

			if (FlattenAtUntil && close > until && Position.MarketPosition != MarketPosition.Flat)
				FlattenAll("CC_Until");

			// 2. Ruptura
			if (!boxReady || !boxValid || tradedToday) return 0;
			if (close <= bFrom || close > until) return 0;

			double n = BreakTicks * TickSize;
			if (Close[0] >= boxHigh + n) return 1;
			if (Close[0] <= boxLow  - n) return -1;
			return 0;
		}

		private TimeSpan BarDuration()
		{
			if (BarsPeriod.BarsPeriodType == BarsPeriodType.Minute) return TimeSpan.FromMinutes(BarsPeriod.Value);
			if (BarsPeriod.BarsPeriodType == BarsPeriodType.Second) return TimeSpan.FromSeconds(BarsPeriod.Value);
			return CurrentBar > 0 ? Time[0] - Time[1] : TimeSpan.FromMinutes(5);
		}

		private int BarsAgo(TimeSpan from, DateTime nyNow)
		{
			int n = 0;
			while (n < CurrentBar && ToNy(Time[n]).TimeOfDay - BarDuration() > from && ToNy(Time[n]).Date == nyNow.Date) n++;
			return n;
		}

		private bool ValidateBox()
		{
			if (bodies.Count < MinBars || bodies.Count > MaxBars) return false;
			double ticks = (boxHigh - boxLow) / TickSize;
			if (MinBoxTicks > 0 && ticks < MinBoxTicks) return false;
			if (MaxBoxTicks > 0 && ticks > MaxBoxTicks) return false;
			return AvgOverlap() >= OverlapPct;
		}

		/// Solape medio (%) de cuerpos entre velas consecutivas, sobre el cuerpo mas pequeno.
		private double AvgOverlap()
		{
			if (bodies.Count < 2) return 100;
			double sum = 0;
			for (int i = 1; i < bodies.Count; i++)
			{
				double[] a = bodies[i - 1], b = bodies[i];
				double inter = Math.Min(a[1], b[1]) - Math.Max(a[0], b[0]);
				double minBody = Math.Min(a[1] - a[0], b[1] - b[0]);
				if (minBody <= 0)
					sum += inter >= 0 ? 100 : 0;   // doji: cuenta si cae dentro del otro cuerpo
				else
					sum += Math.Max(0, inter) / minBody * 100;
			}
			return sum / (bodies.Count - 1);
		}

		#region Propiedades

		[NinjaScriptProperty]
		[Display(Name = "Caja desde (NY)", Order = 1, GroupName = "4. NY Open Range")]
		public string BoxFrom { get; set; }

		[NinjaScriptProperty]
		[Display(Name = "Caja hasta (NY)", Order = 2, GroupName = "4. NY Open Range")]
		public string BoxTo { get; set; }

		[NinjaScriptProperty]
		[Display(Name = "Ruptura desde (NY)", Order = 3, GroupName = "4. NY Open Range")]
		public string BreakFrom { get; set; }

		[NinjaScriptProperty]
		[Display(Name = "Operar hasta (NY)", Order = 4, GroupName = "4. NY Open Range")]
		public string TradeUntil { get; set; }

		[NinjaScriptProperty]
		[Range(1, int.MaxValue)]
		[Display(Name = "N ticks ruptura", Order = 5, GroupName = "4. NY Open Range")]
		public int BreakTicks { get; set; }

		[NinjaScriptProperty]
		[Range(1, int.MaxValue)]
		[Display(Name = "Min velas", Order = 6, GroupName = "4. NY Open Range")]
		public int MinBars { get; set; }

		[NinjaScriptProperty]
		[Range(1, int.MaxValue)]
		[Display(Name = "Max velas", Order = 7, GroupName = "4. NY Open Range")]
		public int MaxBars { get; set; }

		[NinjaScriptProperty]
		[Range(0, 100)]
		[Display(Name = "% solape cuerpos", Order = 8, GroupName = "4. NY Open Range")]
		public int OverlapPct { get; set; }

		[NinjaScriptProperty]
		[Range(0, int.MaxValue)]
		[Display(Name = "Min ticks caja (0=off)", Order = 9, GroupName = "4. NY Open Range")]
		public int MinBoxTicks { get; set; }

		[NinjaScriptProperty]
		[Range(0, int.MaxValue)]
		[Display(Name = "Max ticks caja (0=off)", Order = 10, GroupName = "4. NY Open Range")]
		public int MaxBoxTicks { get; set; }

		[NinjaScriptProperty]
		[Display(Name = "Cerrar posicion al pasar 'Operar hasta'", Order = 11, GroupName = "4. NY Open Range")]
		public bool FlattenAtUntil { get; set; }

		#endregion
	}
}
