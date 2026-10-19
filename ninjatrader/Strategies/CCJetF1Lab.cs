#region Using declarations
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using NinjaTrader.Cbi;
using NinjaTrader.Data;
using NinjaTrader.NinjaScript;
#endregion

// ============================================================================
//  JetF1 LAB - optimizador automatico de JetF1 (NO envia ordenes)
//  Ejecutalo como un backtest normal (Backtest type = Backtest) en un grafico
//  MNQ de 1 minuto, horario ETH. En una sola pasada prueba todas las
//  combinaciones de:
//      modo (Ruptura / Fade) x ticks de entrada x TP $ x SL $
//  y separa los resultados en:
//      IS  = muestra de optimizacion (antes de "Fecha de corte")
//      OOS = muestra de validacion  (desde "Fecha de corte")
//  El ranking sale en NinjaScript Output y el detalle completo en
//  Documents\NinjaTrader 8\CCJetF1Lab.csv
//
//  Supuestos CONSERVADORES (con velas de 1 min no se sabe el orden exacto):
//   - Si en la misma vela se tocan TP y SL -> cuenta como perdida.
//   - En la vela de entrada solo cuenta el TP si la vela cierra mas alla.
//   - Entradas stop (Ruptura) y SL con deslizamiento de "Slippage ticks".
//   - Entradas limit (Fade) solo se ejecutan si el precio atraviesa 1 tick.
//   - Comision por contrato ida y vuelta.
// ============================================================================
namespace NinjaTrader.NinjaScript.Strategies
{
	public class CCJetF1Lab : Strategy
	{
		private class LabBar { public double O, H, L, C; }

		private class LabStat
		{
			public int Trades, Wins;
			public double Net, GrossP, GrossL, Eq, Peak, MaxDD;
			public void Add(double pnl)
			{
				Trades++;
				if (pnl > 0) { Wins++; GrossP += pnl; } else GrossL -= pnl;
				Net += pnl; Eq += pnl;
				if (Eq > Peak) Peak = Eq;
				if (Peak - Eq > MaxDD) MaxDD = Peak - Eq;
			}
			public double PF { get { return GrossL > 0 ? GrossP / GrossL : (GrossP > 0 ? 99 : 0); } }
			public double WinPct { get { return Trades > 0 ? 100.0 * Wins / Trades : 0; } }
		}

		private class LabCombo
		{
			public bool Fade; public int Ticks; public double TpUsd, SlUsd;
			public LabStat IS = new LabStat(), OOS = new LabStat();
			public string Label
			{
				get { return string.Format("{0,-7} {1,2}t TP${2,5} SL${3,5}", Fade ? "FADE" : "RUPTURA", Ticks, TpUsd, SlUsd); }
			}
		}

		private List<LabCombo> combos;
		private readonly List<LabBar> dayBars = new List<LabBar>();
		private DateTime curDay = DateTime.MinValue;
		private DateTime splitDate;
		private DateTime firstDay = DateTime.MinValue, lastDay;
		private bool anchored, printed;
		private double anchorPrice;
		private int daysIS, daysOOS;

		protected override void OnStateChange()
		{
			if (State == State.SetDefaults)
			{
				Description = "Laboratorio JetF1: prueba todas las combinaciones Ruptura/Fade x ticks x TP x SL (no opera)";
				Name        = "CCJetF1Lab";
				Calculate   = Calculate.OnBarClose;
				BarsRequiredToTrade = 1;
				IsInstantiatedOnEachOptimizationIteration = true;

				AnchorTime   = "09:29:58";
				ExitTime     = "16:59";
				SplitDate    = "2026-07-01";
				TicksList    = "2,4,6,8,10,12,16,20";
				TpMin = 200;  TpMax = 3000; TpStep = 200;
				SlMin = 200;  SlMax = 3000; SlStep = 200;
				Qty          = 20;
				EntryBars    = 1;
				SlippageTicks = 1;
				CommissionRT = 1.0;
				MinTrades    = 40;
				TopN         = 20;
			}
			else if (State == State.DataLoaded)
			{
				if (!DateTime.TryParseExact(SplitDate, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out splitDate))
					splitDate = new DateTime(2026, 7, 1);

				combos = new List<LabCombo>();
				foreach (string part in TicksList.Split(new[] { ',', ';', ' ' }, StringSplitOptions.RemoveEmptyEntries))
				{
					int t;
					if (!int.TryParse(part, out t) || t <= 0) continue;
					for (int f = 0; f < 2; f++)
						for (double tp = TpMin; tp <= TpMax + 1e-9; tp += TpStep)
							for (double sl = SlMin; sl <= SlMax + 1e-9; sl += SlStep)
								combos.Add(new LabCombo { Fade = f == 1, Ticks = t, TpUsd = tp, SlUsd = sl });
				}
			}
			else if (State == State.Terminated)
			{
				if (combos != null && !printed && (daysIS + daysOOS) > 0) { FlushDay(); Report(); }
			}
		}

		private TimeSpan BarDuration()
		{
			if (BarsPeriod.BarsPeriodType == BarsPeriodType.Minute) return TimeSpan.FromMinutes(BarsPeriod.Value);
			if (BarsPeriod.BarsPeriodType == BarsPeriodType.Second) return TimeSpan.FromSeconds(BarsPeriod.Value);
			return CurrentBar > 0 ? Time[0] - Time[1] : TimeSpan.FromMinutes(1);
		}

		protected override void OnBarUpdate()
		{
			if (CurrentBar < 1 || combos == null) return;

			DateTime ny   = CCBase.ToNy(Time[0]);
			TimeSpan tod  = ny.TimeOfDay;
			TimeSpan anchor = CCBase.ParseHm(AnchorTime, new TimeSpan(9, 29, 58));
			TimeSpan exit   = CCBase.ParseHm(ExitTime,   new TimeSpan(16, 59, 0));

			if (ny.Date != curDay)
			{
				FlushDay();
				curDay   = ny.Date;
				anchored = false;
				dayBars.Clear();
			}

			if (!anchored)
			{
				if (tod >= anchor && tod - BarDuration() < anchor)
				{
					anchored    = true;
					anchorPrice = Close[0];
				}
			}
			else if (tod <= exit)
			{
				dayBars.Add(new LabBar { O = Open[0], H = High[0], L = Low[0], C = Close[0] });
				if (tod >= exit) FlushDay();
			}

			if (!printed && CurrentBar >= Count - 2)
			{
				FlushDay();
				Report();
			}
		}

		/// Evalua el dia acumulado para todas las combinaciones.
		private void FlushDay()
		{
			if (!anchored || dayBars.Count == 0) { anchored = false; dayBars.Clear(); return; }

			bool oos = curDay >= splitDate;
			if (oos) daysOOS++; else daysIS++;
			if (firstDay == DateTime.MinValue) firstDay = curDay;
			lastDay = curDay;

			double pv = Instrument.MasterInstrument.PointValue;
			foreach (LabCombo c in combos)
			{
				double pnl;
				if (Simulate(c, pv, out pnl))
				{
					if (oos) c.OOS.Add(pnl); else c.IS.Add(pnl);
				}
			}
			anchored = false;
			dayBars.Clear();
		}

		private double ToTicksPts(double usd, double pv)
		{
			double pts = usd / (Qty * pv);
			return Math.Max(TickSize, Math.Round(pts / TickSize) * TickSize);
		}

		private bool Simulate(LabCombo c, double pv, out double pnl)
		{
			pnl = 0;
			double tick = TickSize, slip = SlippageTicks * tick, pen = tick;
			double up = anchorPrice + c.Ticks * tick;
			double dn = anchorPrice - c.Ticks * tick;
			double tpPts = ToTicksPts(c.TpUsd, pv);
			double slPts = ToTicksPts(c.SlUsd, pv);

			int dir = 0, i = 0;
			double entry = 0;
			int maxEntry = Math.Min(dayBars.Count, Math.Max(1, EntryBars));
			for (; i < maxEntry; i++)
			{
				LabBar b = dayBars[i];
				bool hitUp = c.Fade ? b.H >= up + pen : b.H >= up;
				bool hitDn = c.Fade ? b.L <= dn - pen : b.L <= dn;
				if (hitUp && hitDn)
				{
					if (Math.Abs(b.O - up) <= Math.Abs(b.O - dn)) hitDn = false; else hitUp = false;
				}
				if (hitUp)      { dir = c.Fade ? -1 : 1;  entry = c.Fade ? up : up + slip; }
				else if (hitDn) { dir = c.Fade ? 1  : -1; entry = c.Fade ? dn : dn - slip; }
				if (dir != 0) break;
			}
			if (dir == 0) return false;

			double tpPx = entry + dir * tpPts;
			double slPx = entry - dir * slPts;
			double exitPx = double.NaN;
			for (int j = i; j < dayBars.Count; j++)
			{
				LabBar b = dayBars[j];
				bool slHit = dir > 0 ? b.L <= slPx : b.H >= slPx;
				bool tpHit = dir > 0 ? b.H >= tpPx : b.L <= tpPx;
				if (slHit) { exitPx = slPx - dir * slip; break; }      // SL primero si hay duda
				if (j == i)
				{
					if (dir > 0 ? b.C >= tpPx : b.C <= tpPx) { exitPx = tpPx; break; }
					continue;
				}
				if (tpHit) { exitPx = tpPx; break; }
			}
			if (double.IsNaN(exitPx)) exitPx = dayBars[dayBars.Count - 1].C;   // cierre a la hora de salida

			pnl = dir * (exitPx - entry) * pv * Qty - CommissionRT * Qty;
			return true;
		}

		private static string Row(string label, LabStat s)
		{
			return string.Format(CultureInfo.InvariantCulture, "{0} | ops {1,3} | acierto {2,5:0.0}% | neto {3,10:0} | PF {4,5:0.00} | maxDD {5,9:0}",
				label, s.Trades, s.WinPct, s.Net, s.PF, s.MaxDD);
		}

		private void Report()
		{
			printed = true;
			StringBuilder sb = new StringBuilder();
			sb.AppendLine("==================== CCJetF1Lab ====================");
			sb.AppendLine(string.Format("Periodo {0:dd/MM/yyyy} - {1:dd/MM/yyyy} | dias IS {2} (antes de {3:dd/MM}) | dias OOS {4} | {5} combinaciones | {6} ct | comision {7}$/ct | slippage {8} tick",
				firstDay, lastDay, daysIS, splitDate, daysOOS, combos.Count, Qty, CommissionRT, SlippageTicks));
			sb.AppendLine("Supuestos conservadores: TP y SL en la misma vela = perdida.");

			LabCombo baseC = combos.FirstOrDefault(c => !c.Fade && c.Ticks == 4 && Math.Abs(c.TpUsd - 1600) < 1e-6 && Math.Abs(c.SlUsd - 2000) < 1e-6);
			if (baseC != null)
			{
				sb.AppendLine("--- Referencia (parecida a la actual: RUPTURA 4t TP1600 SL2000) ---");
				sb.AppendLine("IS  " + Row(baseC.Label, baseC.IS));
				sb.AppendLine("OOS " + Row(baseC.Label, baseC.OOS));
			}

			foreach (bool? mode in new bool?[] { null, false, true })
			{
				IEnumerable<LabCombo> pool = combos.Where(c => c.IS.Trades >= MinTrades);
				if (mode.HasValue) pool = pool.Where(c => c.Fade == mode.Value);
				List<LabCombo> top = pool.OrderByDescending(c => c.IS.PF).ThenByDescending(c => c.IS.Net).Take(mode.HasValue ? 5 : TopN).ToList();
				sb.AppendLine(string.Format("--- TOP {0} por Profit Factor en IS {1} (debajo: su resultado en OOS) ---",
					top.Count, mode.HasValue ? (mode.Value ? "[solo FADE]" : "[solo RUPTURA]") : "[todos]"));
				int k = 1;
				foreach (LabCombo c in top)
				{
					sb.AppendLine(string.Format("{0,2}. IS  {1}", k, Row(c.Label, c.IS)));
					sb.AppendLine(string.Format("    OOS {0}", Row(c.Label, c.OOS)));
					k++;
				}
			}

			// Robustez: combinaciones rentables en IS y en OOS
			List<LabCombo> robust = combos.Where(c => c.IS.Trades >= MinTrades && c.OOS.Trades >= MinTrades / 2
					&& c.IS.PF > 1.2 && c.OOS.PF > 1.2)
				.OrderByDescending(c => Math.Min(c.IS.PF, c.OOS.PF)).Take(10).ToList();
			sb.AppendLine(string.Format("--- ROBUSTAS: PF > 1.2 en IS y en OOS ({0}) ---", robust.Count));
			foreach (LabCombo c in robust)
				sb.AppendLine(string.Format("{0} | IS PF {1:0.00} neto {2:0} | OOS PF {3:0.00} neto {4:0}",
					c.Label, c.IS.PF, c.IS.Net, c.OOS.PF, c.OOS.Net));
			if (robust.Count == 0) sb.AppendLine("Ninguna. No hay ventaja estable con estos supuestos.");

			string csv = "";
			try
			{
				csv = Path.Combine(Core.Globals.UserDataDir, "CCJetF1Lab.csv");
				using (StreamWriter w = new StreamWriter(csv, false))
				{
					w.WriteLine("modo;ticks;tp_usd;sl_usd;is_ops;is_win_pct;is_neto;is_pf;is_maxdd;oos_ops;oos_win_pct;oos_neto;oos_pf;oos_maxdd");
					foreach (LabCombo c in combos)
						w.WriteLine(string.Format(CultureInfo.InvariantCulture, "{0};{1};{2};{3};{4};{5:0.0};{6:0};{7:0.000};{8:0};{9};{10:0.0};{11:0};{12:0.000};{13:0}",
							c.Fade ? "FADE" : "RUPTURA", c.Ticks, c.TpUsd, c.SlUsd,
							c.IS.Trades, c.IS.WinPct, c.IS.Net, c.IS.PF, c.IS.MaxDD,
							c.OOS.Trades, c.OOS.WinPct, c.OOS.Net, c.OOS.PF, c.OOS.MaxDD));
				}
				sb.AppendLine("Detalle completo: " + csv);
			}
			catch (Exception ex) { sb.AppendLine("No se pudo escribir el CSV: " + ex.Message); }

			sb.AppendLine("====================================================");
			Print(sb.ToString());
		}

		#region Propiedades

		[NinjaScriptProperty]
		[Display(Name = "Hora ancla NY (HH:mm:ss)", Order = 1, GroupName = "Lab")]
		public string AnchorTime { get; set; }

		[NinjaScriptProperty]
		[Display(Name = "Hora salida NY (HH:mm)", Order = 2, GroupName = "Lab")]
		public string ExitTime { get; set; }

		[NinjaScriptProperty]
		[Display(Name = "Fecha de corte IS/OOS (yyyy-MM-dd)", Order = 3, GroupName = "Lab")]
		public string SplitDate { get; set; }

		[NinjaScriptProperty]
		[Display(Name = "Ticks de entrada a probar", Order = 4, GroupName = "Lab")]
		public string TicksList { get; set; }

		[NinjaScriptProperty]
		[Display(Name = "TP $ min", Order = 5, GroupName = "Lab")]
		public double TpMin { get; set; }

		[NinjaScriptProperty]
		[Display(Name = "TP $ max", Order = 6, GroupName = "Lab")]
		public double TpMax { get; set; }

		[NinjaScriptProperty]
		[Range(1, double.MaxValue)]
		[Display(Name = "TP $ salto", Order = 7, GroupName = "Lab")]
		public double TpStep { get; set; }

		[NinjaScriptProperty]
		[Display(Name = "SL $ min", Order = 8, GroupName = "Lab")]
		public double SlMin { get; set; }

		[NinjaScriptProperty]
		[Display(Name = "SL $ max", Order = 9, GroupName = "Lab")]
		public double SlMax { get; set; }

		[NinjaScriptProperty]
		[Range(1, double.MaxValue)]
		[Display(Name = "SL $ salto", Order = 10, GroupName = "Lab")]
		public double SlStep { get; set; }

		[NinjaScriptProperty]
		[Range(1, int.MaxValue)]
		[Display(Name = "Contratos", Order = 11, GroupName = "Lab")]
		public int Qty { get; set; }

		[NinjaScriptProperty]
		[Range(1, int.MaxValue)]
		[Display(Name = "Velas para entrar (caducidad)", Order = 12, GroupName = "Lab")]
		public int EntryBars { get; set; }

		[NinjaScriptProperty]
		[Range(0, int.MaxValue)]
		[Display(Name = "Slippage (ticks)", Order = 13, GroupName = "Lab")]
		public int SlippageTicks { get; set; }

		[NinjaScriptProperty]
		[Range(0, double.MaxValue)]
		[Display(Name = "Comision $ por contrato (ida+vuelta)", Order = 14, GroupName = "Lab")]
		public double CommissionRT { get; set; }

		[NinjaScriptProperty]
		[Range(1, int.MaxValue)]
		[Display(Name = "Min operaciones IS", Order = 15, GroupName = "Lab")]
		public int MinTrades { get; set; }

		[NinjaScriptProperty]
		[Range(1, int.MaxValue)]
		[Display(Name = "Top N", Order = 16, GroupName = "Lab")]
		public int TopN { get; set; }

		#endregion
	}
}
