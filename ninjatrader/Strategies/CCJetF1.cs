#region Using declarations
using System;
using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using NinjaTrader.Cbi;
using NinjaTrader.Data;
using NinjaTrader.NinjaScript;
using NinjaTrader.NinjaScript.AddOns;
#endregion

// ============================================================================
//  JetF1 - motor "Coete" (sin temporalidad)
//   A la hora ancla (por defecto 09:29:58 NY) toma el ultimo precio y coloca
//   un BUY STOP N ticks arriba y un SELL STOP N ticks abajo, unidos en OCO:
//   cuando uno se ejecuta, el otro se cancela.
//   Al ejecutarse coloca SL$ y TP$ en el broker. Si nada se ejecuta en
//   "Caducidad entrada (s)" las dos ordenes se cancelan.
//   Runner (opcional): el TP solo cierra "Contratos al TP"; el resto pasa
//   a break even y, tras "Espera desde apertura (s)", sigue con trailing.
//   Un disparo por dia. Modo unmanaged (necesario para tener compra y venta
//   pendientes a la vez).
//  Valores por defecto = bots.json (b_core_coete).
//  Se puede aplicar a cualquier grafico (usa una serie interna de 1 tick).
// ============================================================================
namespace NinjaTrader.NinjaScript.Strategies
{
	public class CCJetF1 : Strategy
	{
		private const string BuyName    = "CCJ_Arriba";   // orden de entrada superior
		private const string SellName   = "CCJ_Abajo";    // orden de entrada inferior
		private const string StopName   = "CCJ_SL";
		private const string TargetName = "CCJ_TP";

		private Order buyEntry, sellEntry, stopOrder, targetOrder;

		private DateTime armedDay = DateTime.MinValue;
		private DateTime entryDeadline;
		private DateTime fillTime;
		private bool   isLong;
		private int    entryQty;       // contratos ejecutados en la entrada
		private int    targetQty;
		private double avgEntry;
		private double curStop;
		private bool   runnerActive;
		private bool   bracketPlaced;
		private bool   warned;
		private CCStrategyHandle hub;
		private DateTime pnlDay = DateTime.MinValue;
		private double   pnlStart;
		private int    seq;
		private int    bip;            // serie que ejecuta: 1 = ticks, 0 = grafico

		protected override void OnStateChange()
		{
			if (State == State.SetDefaults)
			{
				Description = "Clon JetF1 - Coete: stop arriba/abajo a la hora ancla (Command Pro)";
				Name        = "CCJetF1";
				IsUnmanaged = true;
				Calculate   = Calculate.OnBarClose;
				IsExitOnSessionCloseStrategy = true;
				ExitOnSessionCloseSeconds    = 30;
				StartBehavior         = StartBehavior.WaitUntilFlat;
				RealtimeErrorHandling = RealtimeErrorHandling.StopCancelClose;
				TimeInForce           = TimeInForce.Gtc;
				BarsRequiredToTrade   = 0;
				IsInstantiatedOnEachOptimizationIteration = true;

				AnchorTime      = "09:29:58";
				AnchorInNy      = true;
				BuyTicks        = 4;
				SellTicks       = 4;
				Direction       = CCDirection.Ambas;
				QtyLong         = 20;
				QtyShort        = 16;
				TargetUsd       = 1500;
				StopLossUsd     = 2000;
				EntryTimeoutSec = 60;
				RunnerOn        = false;
				RunnerTpQty     = 10;
				RunnerWaitSec   = 13;
				RunnerTrailUsd  = 10;
				UseTickData     = false;
				Fade            = false;
			}
			else if (State == State.Configure)
			{
				// Con ticks: hora ancla exacta tambien en backtest (necesita historico de ticks).
				// Sin ticks: en tiempo real cada tick del grafico; en backtest, al cierre de la vela
				// que cubre la hora ancla (usar grafico de 1 minuto).
				if (UseTickData)
				{
					AddDataSeries(BarsPeriodType.Tick, 1);
					bip = 1;
				}
				else
				{
					Calculate = Calculate.OnEachTick;
					bip = 0;
				}
			}
			else if (State == State.Realtime)
			{
				// Ordenes que venian del historico -> referencias en tiempo real
				if (buyEntry    != null) buyEntry    = GetRealtimeOrder(buyEntry);
				if (sellEntry   != null) sellEntry   = GetRealtimeOrder(sellEntry);
				if (stopOrder   != null) stopOrder   = GetRealtimeOrder(stopOrder);
				if (targetOrder != null) targetOrder = GetRealtimeOrder(targetOrder);

				hub = CCHub.Register(Name, Account.Name, Instrument.FullName,
					() => TriggerCustomEvent(o => PanelFlatten(), null));
			}
			else if (State == State.Terminated)
			{
				CCHub.Unregister(hub);
				hub = null;
			}
		}

		private double TickValue { get { return Instrument.MasterInstrument.PointValue * TickSize; } }

		private int UsdToTicks(double usd, int qty)
		{
			if (qty <= 0 || TickValue <= 0) return 1;
			return Math.Max(1, (int)Math.Round(usd / (qty * TickValue), MidpointRounding.AwayFromZero));
		}

		private TimeSpan BarDuration()
		{
			BarsPeriod bp = BarsPeriods[bip];
			if (bp.BarsPeriodType == BarsPeriodType.Minute) return TimeSpan.FromMinutes(bp.Value);
			if (bp.BarsPeriodType == BarsPeriodType.Second) return TimeSpan.FromSeconds(bp.Value);
			return CurrentBars[bip] > 0 ? Times[bip][0] - Times[bip][1] : TimeSpan.FromMinutes(1);
		}

		private double Rt(double p) { return Instrument.MasterInstrument.RoundToTickSize(p); }

		private static bool IsWorking(Order o)
		{
			return o != null && (o.OrderState == OrderState.Working || o.OrderState == OrderState.Accepted
				|| o.OrderState == OrderState.Submitted || o.OrderState == OrderState.ChangePending
				|| o.OrderState == OrderState.ChangeSubmitted || o.OrderState == OrderState.PartFilled
				|| o.OrderState == OrderState.TriggerPending);
		}

		protected override void OnBarUpdate()
		{
			if (BarsInProgress != bip || CurrentBars[bip] < 1) return;

			// En tiempo real Time[0] es la hora de cierre futura de la vela: usar el reloj de NT.
			DateTime now   = (State == State.Realtime && bip == 0) ? Core.Globals.Now : Times[bip][0];
			DateTime clock = AnchorInNy ? CCBase.ToNy(now) : now;
			double price   = Closes[bip][0];

			// 1. Disparo a la hora ancla
			TimeSpan anchor = CCBase.ParseHm(AnchorTime, new TimeSpan(9, 29, 58));
			TimeSpan tod    = clock.TimeOfDay;
			bool historicalBars = bip == 0 && State != State.Realtime;
			// Ticks / tiempo real: ventana de 5 s. Velas historicas: la vela que CONTIENE la hora ancla
			// (en NT la hora de la vela es la de cierre: vela 1 min de las 09:30:00 cubre 09:29:00-09:30:00).
			bool inWindow = historicalBars
				? (tod >= anchor && tod - BarDuration() < anchor)
				: (tod >= anchor && tod < anchor + TimeSpan.FromSeconds(5));

			if (armedDay != clock.Date && inWindow)
			{
				armedDay = clock.Date;
				if (hub != null && hub.Paused)
					Print(string.Format("{0} {1}: hora ancla, pero la estrategia esta PAUSADA desde el panel.", now, Name));
				else if (Position.MarketPosition == MarketPosition.Flat
					&& !IsWorking(buyEntry) && !IsWorking(sellEntry) && !IsWorking(stopOrder))
					Arm(price, now);
				else
					Print(string.Format("{0} {1}: hora ancla pero hay posicion u ordenes abiertas -> no se coloca nada hoy.", now, Name));
			}
			else if (armedDay != clock.Date && tod > anchor && tod < anchor + TimeSpan.FromMinutes(30))
			{
				// No hubo vela/tick que cubriera la hora ancla: no se dispara tarde.
				armedDay = clock.Date;
				string msg = string.Format("{0}: el {1:dd/MM} no hubo vela a la hora ancla {2} NY. Vela recibida: NT {3:HH:mm:ss} = NY {4:HH:mm:ss} | "
					+ "periodo {5} {6} | zona NT {7}. Usa Trading hours ETH y grafico de 1 minuto.",
					Name, clock, AnchorTime, now, clock, BarsPeriods[bip].Value, BarsPeriods[bip].BarsPeriodType,
					Core.Globals.GeneralOptions.TimeZoneInfo.Id);
				Print(msg);
				if (!warned) { warned = true; Log(msg, LogLevel.Warning); }
			}

			if (hub != null)
			{
				double cum = SystemPerformance.AllTrades.TradesPerformance.Currency.CumProfit;
				if (clock.Date != pnlDay) { pnlDay = clock.Date; pnlStart = cum; }
				hub.DayPnl = cum - pnlStart + (Position.MarketPosition != MarketPosition.Flat
					? Position.GetUnrealizedProfitLoss(PerformanceUnit.Currency, price) : 0);
			}
			if (hub != null)
				hub.Position = Position.MarketPosition == MarketPosition.Flat
					? (IsWorking(buyEntry) || IsWorking(sellEntry) ? "Ordenes pendientes" : "Plano")
					: (Position.MarketPosition == MarketPosition.Long ? "Largo " : "Corto ") + Position.Quantity;

			// 2. Caducidad de las entradas pendientes
			if (Position.MarketPosition == MarketPosition.Flat && now >= entryDeadline)
			{
				if (IsWorking(buyEntry))  CancelOrder(buyEntry);
				if (IsWorking(sellEntry)) CancelOrder(sellEntry);
			}

			// 3. Trailing del runner
			if (runnerActive && Position.MarketPosition != MarketPosition.Flat && IsWorking(stopOrder)
				&& now >= fillTime.AddSeconds(RunnerWaitSec) && RunnerTrailUsd > 0)
			{
				double dist = UsdToTicks(RunnerTrailUsd, 1) * TickSize;
				double ns   = Rt(isLong ? price - dist : price + dist);
				if (isLong ? ns > curStop : ns < curStop)
				{
					curStop = ns;
					ChangeOrder(stopOrder, stopOrder.Quantity, 0, curStop);
				}
			}
		}

		/// Llamado desde el panel (via TriggerCustomEvent): cancela entradas y cierra a mercado.
		private void PanelFlatten()
		{
			if (IsWorking(buyEntry))  CancelOrder(buyEntry);
			if (IsWorking(sellEntry)) CancelOrder(sellEntry);
			if (Position.MarketPosition == MarketPosition.Long)
				SubmitOrderUnmanaged(bip, OrderAction.Sell, OrderType.Market, Position.Quantity, 0, 0, string.Empty, "CCJ_Panel");
			else if (Position.MarketPosition == MarketPosition.Short)
				SubmitOrderUnmanaged(bip, OrderAction.BuyToCover, OrderType.Market, Position.Quantity, 0, 0, string.Empty, "CCJ_Panel");
			if (hub != null) hub.LastEvent = "Cierre desde panel";
		}

		private void Arm(double price, DateTime now)
		{
			seq++;
			// Ruptura: BUY STOP arriba / SELL STOP abajo.  Fade: SELL LIMIT arriba / BUY LIMIT abajo.
			bool longOk  = Direction != CCDirection.SoloCortos && QtyLong  > 0;
			bool shortOk = Direction != CCDirection.SoloLargos && QtyShort > 0;
			bool doUp    = Fade ? shortOk : longOk;
			bool doDown  = Fade ? longOk  : shortOk;
			double upPx  = Rt(price + BuyTicks  * TickSize);
			double dnPx  = Rt(price - SellTicks * TickSize);
			string oco   = (doUp && doDown) ? ("CCJin" + now.Ticks + "_" + seq) : string.Empty;

			if (doUp)
				buyEntry = Fade
					? SubmitOrderUnmanaged(bip, OrderAction.SellShort, OrderType.Limit, QtyShort, upPx, 0, oco, BuyName)
					: SubmitOrderUnmanaged(bip, OrderAction.Buy, OrderType.StopMarket, QtyLong, 0, upPx, oco, BuyName);
			if (doDown)
				sellEntry = Fade
					? SubmitOrderUnmanaged(bip, OrderAction.Buy, OrderType.Limit, QtyLong, dnPx, 0, oco, SellName)
					: SubmitOrderUnmanaged(bip, OrderAction.SellShort, OrderType.StopMarket, QtyShort, 0, dnPx, oco, SellName);

			entryDeadline = now.AddSeconds(EntryTimeoutSec);
			if (hub != null) hub.LastEvent = string.Format("{0:HH:mm:ss} ancla {1}", now, Fade ? "FADE" : "RUPTURA");
			Print(string.Format("{0} {1}: ancla @ {2} [{3}] -> arriba {4} {5} / abajo {6} {7}", now, Name, price,
				Fade ? "FADE" : "RUPTURA",
				doUp ? (Fade ? "SELL LMT" : "BUY STP") : "-", doUp ? upPx.ToString() : "",
				doDown ? (Fade ? "BUY LMT" : "SELL STP") : "-", doDown ? dnPx.ToString() : ""));
		}

		protected override void OnOrderUpdate(Order order, double limitPrice, double stopPrice, int quantity,
			int filled, double averageFillPrice, OrderState orderState, DateTime time, ErrorCode error, string comment)
		{
			if      (order.Name == BuyName)    buyEntry    = order;
			else if (order.Name == SellName)   sellEntry   = order;
			else if (order.Name == StopName)   stopOrder   = order;
			else if (order.Name == TargetName) targetOrder = order;
		}

		protected override void OnExecutionUpdate(Execution execution, string executionId, double price, int quantity,
			MarketPosition marketPosition, string orderId, DateTime time)
		{
			Order o = execution.Order;
			if (o == null) return;

			// --- Entrada (completa o parcial) ---
			if (o.Name == BuyName || o.Name == SellName)
			{
				isLong   = o.OrderAction == OrderAction.Buy;
				entryQty = o.Filled;
				avgEntry = o.AverageFillPrice;
				fillTime = time;

				int planned = o.Quantity;
				double sl = UsdToTicks(StopLossUsd, planned) * TickSize;
				double tp = UsdToTicks(TargetUsd,   planned) * TickSize;
				double stopPx = Rt(isLong ? avgEntry - sl : avgEntry + sl);
				double tpPx   = Rt(isLong ? avgEntry + tp : avgEntry - tp);
				targetQty = RunnerOn ? Math.Min(Math.Max(1, RunnerTpQty), entryQty) : entryQty;
				OrderAction exitAction = isLong ? OrderAction.Sell : OrderAction.BuyToCover;

				if (!bracketPlaced)
				{
					bracketPlaced = true;
					string oco = RunnerOn ? string.Empty : ("CCJout" + time.Ticks + "_" + seq);
					curStop     = stopPx;
					stopOrder   = SubmitOrderUnmanaged(bip, exitAction, OrderType.StopMarket, entryQty, 0, stopPx, oco, StopName);
					targetOrder = SubmitOrderUnmanaged(bip, exitAction, OrderType.Limit, targetQty, tpPx, 0, oco, TargetName);
				}
				else
				{
					curStop = stopPx;
					ChangeOrder(stopOrder, entryQty, 0, stopPx);
					if (IsWorking(targetOrder)) ChangeOrder(targetOrder, targetQty, tpPx, 0);
				}
				return;
			}

			// --- Take profit ---
			if (o.Name == TargetName)
			{
				int remaining = entryQty - o.Filled;
				if (!RunnerOn || remaining <= 0)
				{
					if (o.OrderState == OrderState.Filled && IsWorking(stopOrder) && remaining <= 0) CancelOrder(stopOrder);
					return;
				}
				// Runner: el stop cubre solo lo que queda y pasa a break even
				double be = Rt(avgEntry);
				if (isLong ? be > curStop : be < curStop) curStop = be;
				if (IsWorking(stopOrder)) ChangeOrder(stopOrder, remaining, 0, curStop);
				if (o.OrderState == OrderState.Filled) runnerActive = true;
				return;
			}

			// --- Stop loss ---
			if (o.Name == StopName && o.OrderState == OrderState.Filled)
			{
				if (IsWorking(targetOrder)) CancelOrder(targetOrder);
			}
		}

		protected override void OnPositionUpdate(Position position, double averagePrice, int quantity, MarketPosition marketPosition)
		{
			if (marketPosition != MarketPosition.Flat) return;
			// Plano (SL, TP, cierre de sesion o manual): no dejar ordenes huerfanas
			if (IsWorking(stopOrder))   CancelOrder(stopOrder);
			if (IsWorking(targetOrder)) CancelOrder(targetOrder);
			runnerActive  = false;
			bracketPlaced = false;
			entryQty      = 0;
		}

		#region Propiedades

		[NinjaScriptProperty]
		[Display(Name = "Hora ancla (HH:mm:ss)", Order = 1, GroupName = "1. Coete")]
		public string AnchorTime { get; set; }

		[NinjaScriptProperty]
		[Display(Name = "Hora ancla en hora NY (si no: hora de NT)", Order = 2, GroupName = "1. Coete")]
		public bool AnchorInNy { get; set; }

		[NinjaScriptProperty]
		[Range(1, int.MaxValue)]
		[Display(Name = "Ticks compra (arriba)", Order = 3, GroupName = "1. Coete")]
		public int BuyTicks { get; set; }

		[NinjaScriptProperty]
		[Range(1, int.MaxValue)]
		[Display(Name = "Ticks venta (abajo)", Order = 4, GroupName = "1. Coete")]
		public int SellTicks { get; set; }

		[NinjaScriptProperty]
		[Range(1, int.MaxValue)]
		[Display(Name = "Caducidad entrada (s)", Order = 5, GroupName = "1. Coete")]
		public int EntryTimeoutSec { get; set; }

		[NinjaScriptProperty]
		[Display(Name = "Fade (invertir: vender arriba / comprar abajo)", Order = 7, GroupName = "1. Coete")]
		public bool Fade { get; set; }

		[NinjaScriptProperty]
		[Display(Name = "Direccion", Order = 1, GroupName = "2. Grupo (dinero)")]
		public CCDirection Direction { get; set; }

		[NinjaScriptProperty]
		[Range(0, int.MaxValue)]
		[Display(Name = "Contratos COMPRA", Order = 2, GroupName = "2. Grupo (dinero)")]
		public int QtyLong { get; set; }

		[NinjaScriptProperty]
		[Range(0, int.MaxValue)]
		[Display(Name = "Contratos VENTA", Order = 3, GroupName = "2. Grupo (dinero)")]
		public int QtyShort { get; set; }

		[NinjaScriptProperty]
		[Range(1, double.MaxValue)]
		[Display(Name = "TP $ (por operacion)", Order = 4, GroupName = "2. Grupo (dinero)")]
		public double TargetUsd { get; set; }

		[NinjaScriptProperty]
		[Range(1, double.MaxValue)]
		[Display(Name = "SL $ (por operacion)", Order = 5, GroupName = "2. Grupo (dinero)")]
		public double StopLossUsd { get; set; }

		[NinjaScriptProperty]
		[Display(Name = "Usar runner", Order = 1, GroupName = "3. Runner")]
		public bool RunnerOn { get; set; }

		[NinjaScriptProperty]
		[Range(1, int.MaxValue)]
		[Display(Name = "Contratos al TP", Order = 2, GroupName = "3. Runner")]
		public int RunnerTpQty { get; set; }

		[NinjaScriptProperty]
		[Range(0, 300)]
		[Display(Name = "Espera desde apertura (s)", Order = 3, GroupName = "3. Runner")]
		public int RunnerWaitSec { get; set; }

		[NinjaScriptProperty]
		[Range(0, double.MaxValue)]
		[Display(Name = "Trail $ (por contrato)", Order = 4, GroupName = "3. Runner")]
		public double RunnerTrailUsd { get; set; }

		[NinjaScriptProperty]
		[Display(Name = "Usar datos de tick (backtest exacto)", Order = 6, GroupName = "1. Coete")]
		public bool UseTickData { get; set; }

		#endregion
	}
}
