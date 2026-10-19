#region Using declarations
using System;
using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using NinjaTrader.Cbi;
using NinjaTrader.Data;
using NinjaTrader.NinjaScript;
using NinjaTrader.NinjaScript.Indicators;
#endregion

// ============================================================================
//  GoatPro - EMA Pullback (M5)
//  Senal al cierre de vela:
//   COMPRA: tendencia EMA rapida > EMA disparo > EMA lenta (opcional),
//           vela verde con cuerpo >= min, open por encima de la EMA disparo
//           al menos N ticks, la mecha baja toca la EMA (Low <= EMA + toque),
//           y cierra por encima de la EMA.
//   VENTA:  espejo.
//   Espera "Velas espera tras cierre" despues de cada salida.
//  Valores por defecto = bots.json (b_core_ema).
// ============================================================================
namespace NinjaTrader.NinjaScript.Strategies
{
	public class CCGoatPro : CCBase
	{
		private EMA emaFast;
		private EMA emaMid;
		private EMA emaSlow;

		protected override void OnStateChange()
		{
			if (State == State.SetDefaults)
			{
				Description = "Clon GoatPro - EMA pullback M5 (Command Pro)";
				Name        = "CCGoatPro";
				ApplyBaseDefaults();
				BarsRequiredToTrade = 200;
				SessionOn   = true;     // bots.json: sessionOn = true (18:00 -> 16:00 NY)

				EmaFastPeriod  = 20;
				EmaMidPeriod   = 95;
				EmaSlowPeriod  = 200;
				UseTrendFilter = true;
				TouchLongTicks   = 10;
				TouchShortTicks  = 9;
				MinOpenLongTicks  = 1;
				MinOpenShortTicks = 1;
				MinBodyTicks   = 1;
				BarsCooldown   = 1;
			}
			else if (State == State.DataLoaded)
			{
				emaFast = EMA(EmaFastPeriod);
				emaMid  = EMA(EmaMidPeriod);
				emaSlow = EMA(EmaSlowPeriod);
				AddChartIndicator(emaFast);
				AddChartIndicator(emaMid);
				AddChartIndicator(emaSlow);
			}
			base.OnStateChange();
		}

		protected override int GetSignal()
		{
			int since = BarsSinceExitExecution();
			if (since >= 0 && since < BarsCooldown) return 0;

			double ema  = emaMid[0];
			double body = Math.Abs(Close[0] - Open[0]);
			if (body < MinBodyTicks * TickSize) return 0;

			bool trendUp   = !UseTrendFilter || (emaFast[0] > emaMid[0] && emaMid[0] > emaSlow[0]);
			bool trendDown = !UseTrendFilter || (emaFast[0] < emaMid[0] && emaMid[0] < emaSlow[0]);

			bool longSig = trendUp
				&& Close[0] > Open[0]
				&& Open[0]  >= ema + MinOpenLongTicks * TickSize
				&& Low[0]   <= ema + TouchLongTicks * TickSize
				&& Close[0] >  ema;

			bool shortSig = trendDown
				&& Close[0] < Open[0]
				&& Open[0]  <= ema - MinOpenShortTicks * TickSize
				&& High[0]  >= ema - TouchShortTicks * TickSize
				&& Close[0] <  ema;

			if (longSig)  return 1;
			if (shortSig) return -1;
			return 0;
		}

		#region Propiedades

		[NinjaScriptProperty]
		[Range(1, int.MaxValue)]
		[Display(Name = "EMA rapida", Order = 1, GroupName = "4. Senal EMA")]
		public int EmaFastPeriod { get; set; }

		[NinjaScriptProperty]
		[Range(2, int.MaxValue)]
		[Display(Name = "EMA disparo", Order = 2, GroupName = "4. Senal EMA")]
		public int EmaMidPeriod { get; set; }

		[NinjaScriptProperty]
		[Range(1, int.MaxValue)]
		[Display(Name = "EMA lenta", Order = 3, GroupName = "4. Senal EMA")]
		public int EmaSlowPeriod { get; set; }

		[NinjaScriptProperty]
		[Display(Name = "Filtro tendencia (20>95>200)", Order = 4, GroupName = "4. Senal EMA")]
		public bool UseTrendFilter { get; set; }

		[NinjaScriptProperty]
		[Range(0, int.MaxValue)]
		[Display(Name = "COMPRA toque mecha (ticks)", Order = 5, GroupName = "4. Senal EMA")]
		public int TouchLongTicks { get; set; }

		[NinjaScriptProperty]
		[Range(0, int.MaxValue)]
		[Display(Name = "COMPRA open vs EMA min (ticks)", Order = 6, GroupName = "4. Senal EMA")]
		public int MinOpenLongTicks { get; set; }

		[NinjaScriptProperty]
		[Range(0, int.MaxValue)]
		[Display(Name = "VENTA toque mecha (ticks)", Order = 7, GroupName = "4. Senal EMA")]
		public int TouchShortTicks { get; set; }

		[NinjaScriptProperty]
		[Range(0, int.MaxValue)]
		[Display(Name = "VENTA open vs EMA min (ticks)", Order = 8, GroupName = "4. Senal EMA")]
		public int MinOpenShortTicks { get; set; }

		[NinjaScriptProperty]
		[Range(0, int.MaxValue)]
		[Display(Name = "Cuerpo minimo (ticks)", Order = 9, GroupName = "4. Senal EMA")]
		public int MinBodyTicks { get; set; }

		[NinjaScriptProperty]
		[Range(1, int.MaxValue)]
		[Display(Name = "Velas espera tras cierre", Order = 10, GroupName = "4. Senal EMA")]
		public int BarsCooldown { get; set; }

		#endregion
	}
}
