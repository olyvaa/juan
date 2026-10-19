#region Using declarations
using System;
using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using NinjaTrader.Cbi;
using NinjaTrader.Data;
using NinjaTrader.NinjaScript;
#endregion

// ============================================================================
//  GYR - Cierre de vela (Green / Yellow / Red)
//  Al cierre de cada vela: verde -> COMPRA, roja -> VENTA (invertible),
//  doji -> ignorar / compra / venta. Solo entra si esta plano, asi que
//  nunca duplica ordenes con la misma vela. Una senal por vela cerrada.
//  Valores por defecto = bots.json (b_core_m5). Usar en grafico M5.
// ============================================================================
namespace NinjaTrader.NinjaScript.Strategies
{
	public enum CCDojiMode { Ignorar, Compra, Venta }

	public class CCGYR : CCBase
	{
		protected override void OnStateChange()
		{
			if (State == State.SetDefaults)
			{
				Description = "Clon GYR - senal por color de vela cerrada (Command Pro)";
				Name        = "CCGYR";
				ApplyBaseDefaults();
				BarsRequiredToTrade = 1;

				GreenIsBuy   = true;
				Doji         = CCDojiMode.Ignorar;
				DojiMaxTicks = 0;
				BarsCooldown = 1;
			}
			base.OnStateChange();
		}

		protected override int GetSignal()
		{
			int since = BarsSinceExitExecution();
			if (since >= 0 && since < BarsCooldown) return 0;

			double body = Close[0] - Open[0];
			if (Math.Abs(body) <= DojiMaxTicks * TickSize)
			{
				if (Doji == CCDojiMode.Compra) return 1;
				if (Doji == CCDojiMode.Venta)  return -1;
				return 0;
			}

			int dir = body > 0 ? 1 : -1;
			return GreenIsBuy ? dir : -dir;
		}

		#region Propiedades

		[NinjaScriptProperty]
		[Display(Name = "Verde = compra", Order = 1, GroupName = "4. Senal vela")]
		public bool GreenIsBuy { get; set; }

		[NinjaScriptProperty]
		[Display(Name = "Doji", Order = 2, GroupName = "4. Senal vela")]
		public CCDojiMode Doji { get; set; }

		[NinjaScriptProperty]
		[Range(0, int.MaxValue)]
		[Display(Name = "Cuerpo max. para doji (ticks)", Order = 3, GroupName = "4. Senal vela")]
		public int DojiMaxTicks { get; set; }

		[NinjaScriptProperty]
		[Range(0, int.MaxValue)]
		[Display(Name = "Velas espera tras cierre", Order = 4, GroupName = "4. Senal vela")]
		public int BarsCooldown { get; set; }

		#endregion
	}
}
