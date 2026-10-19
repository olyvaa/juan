#region Using declarations
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using System.Globalization;
using System.Xml.Serialization;
using NinjaTrader.Cbi;
using NinjaTrader.Data;
using NinjaTrader.NinjaScript;
using NinjaTrader.NinjaScript.AddOns;
#endregion

// ============================================================================
//  Command Pro Clone - clase base para las estrategias de vela (GoatPro, GYR,
//  RangOpenNY). Contiene todo lo comun:
//    - Tamano fijo por lado (contratos compra / venta)
//    - TP$ / SL$ por operacion convertidos a ticks segun el instrumento
//    - Limite de operaciones por dia (0 = ilimitado)
//    - Perdida maxima diaria (PDLL) y objetivo diario (PDPT)
//    - Filtro de sesion en hora de Nueva York y cierre al final de la sesion
//    - Gestion opcional: Break Even al % del TP y "asegurar profit"
//  Las clases hijas solo implementan GetSignal() -> +1 compra, -1 venta, 0 nada.
// ============================================================================
namespace NinjaTrader.NinjaScript.Strategies
{
	public enum CCDirection { Ambas, SoloLargos, SoloCortos }

	public abstract class CCBase : Strategy
	{
		protected const string LongName  = "CC_L";
		protected const string ShortName = "CC_S";

		private static TimeZoneInfo nyTz;

		private double sessionStartPnl;
		private int    tradesToday;
		private bool   haltedToday;
		private DateTime currentNyDate = DateTime.MinValue;

		// Registro en el panel Command Pro Clone (solo en tiempo real)
		private CCStrategyHandle hub;

		// Estado de la posicion abierta (para BE / asegurar profit)
		private int    tpTicksOpen;
		private double stopPriceOpen;
		private bool   beDone;
		private bool   lockDone;

		#region Utilidades

		internal static TimeZoneInfo NyTz
		{
			get
			{
				if (nyTz == null)
				{
					try { nyTz = TimeZoneInfo.FindSystemTimeZoneById("Eastern Standard Time"); }
					catch { nyTz = TimeZoneInfo.FindSystemTimeZoneById("America/New_York"); }
				}
				return nyTz;
			}
		}

		/// Convierte una hora de NinjaTrader (zona configurada en NT) a hora de Nueva York.
		internal static DateTime ToNy(DateTime ntTime)
		{
			DateTime t = DateTime.SpecifyKind(ntTime, DateTimeKind.Unspecified);
			return TimeZoneInfo.ConvertTime(t, Core.Globals.GeneralOptions.TimeZoneInfo, NyTz);
		}

		internal static TimeSpan ParseHm(string s, TimeSpan fallback)
		{
			TimeSpan ts;
			string[] fmts = { @"hh\:mm\:ss", @"h\:mm\:ss", @"hh\:mm", @"h\:mm" };
			if (!string.IsNullOrWhiteSpace(s) && TimeSpan.TryParseExact(s.Trim(), fmts, CultureInfo.InvariantCulture, out ts))
				return ts;
			return fallback;
		}

		/// true si t esta en [start, end). Soporta ventanas que cruzan medianoche (18:00 -> 16:00).
		internal static bool InWindow(TimeSpan t, TimeSpan start, TimeSpan end)
		{
			if (start == end) return true;
			return start < end ? (t >= start && t < end) : (t >= start || t < end);
		}

		protected double TickValue
		{
			get { return Instrument.MasterInstrument.PointValue * TickSize; }
		}

		/// Convierte un importe en USD para toda la posicion a ticks por contrato (minimo 1).
		protected int UsdToTicks(double usd, int qty)
		{
			if (qty <= 0 || TickValue <= 0) return 1;
			return Math.Max(1, (int)Math.Round(usd / (qty * TickValue), MidpointRounding.AwayFromZero));
		}

		#endregion

		/// Entradas ejecutadas hoy (dia de trading CME).
		protected int TradesToday { get { return tradesToday; } }

		/// Implementada por cada estrategia: se llama al cierre de cada vela de la serie principal.
		protected abstract int GetSignal();

		/// Gancho opcional para las hijas (reinicio diario de estado, etc.).
		protected virtual void OnNewNyDay(DateTime nyDate) { }

		/// Las hijas pueden fijar los valores por defecto en SetDefaults despues de llamar a base.
		protected void ApplyBaseDefaults()
		{
			Calculate                                   = Calculate.OnBarClose;
			EntriesPerDirection                         = 1;
			EntryHandling                               = EntryHandling.AllEntries;
			IsExitOnSessionCloseStrategy                = true;
			ExitOnSessionCloseSeconds                   = 30;
			IsFillLimitOnTouch                          = false;
			MaximumBarsLookBack                         = MaximumBarsLookBack.TwoHundredFiftySix;
			OrderFillResolution                         = OrderFillResolution.Standard;
			Slippage                                    = 0;
			StartBehavior                               = StartBehavior.WaitUntilFlat;
			TimeInForce                                 = TimeInForce.Gtc;
			TraceOrders                                 = false;
			RealtimeErrorHandling                       = RealtimeErrorHandling.StopCancelClose;
			StopTargetHandling                          = StopTargetHandling.PerEntryExecution;
			BarsRequiredToTrade                         = 20;
			IsInstantiatedOnEachOptimizationIteration   = true;

			Direction          = CCDirection.Ambas;
			QtyLong            = 20;
			QtyShort           = 16;
			TargetUsd          = 1500;
			StopLossUsd        = 2000;
			MaxTradesPerDay    = 0;
			DailyLossLimitUsd  = 0;
			DailyProfitUsd     = 0;
			SessionOn          = false;
			SessionStart       = "18:00";
			SessionEnd         = "16:00";
			FlattenAtSessionEnd = false;
			BreakEvenOn        = false;
			BreakEvenPct       = 50;
			LockOn             = false;
			LockTriggerPct     = 90;
			LockStopPct        = 80;
		}

		protected override void OnStateChange()
		{
			if (State == State.Configure)
			{
				// Serie de 1 tick solo si hace falta gestionar BE / asegurar profit dentro de la vela.
				if (BreakEvenOn || LockOn)
					AddDataSeries(BarsPeriodType.Tick, 1);
			}
			else if (State == State.Realtime)
			{
				hub = CCHub.Register(Name, Account.Name, Instrument.FullName,
					() => TriggerCustomEvent(o => FlattenAll("CC_Panel"), null));
			}
			else if (State == State.Terminated)
			{
				CCHub.Unregister(hub);
				hub = null;
			}
		}

		protected bool PausedByPanel { get { return hub != null && hub.Paused; } }

		protected override void OnBarUpdate()
		{
			if (BarsInProgress == 1)
			{
				if (CurrentBars[1] > 0)
					ManageOpenPosition(Closes[1][0]);
				return;
			}

			if (BarsInProgress != 0 || CurrentBar < BarsRequiredToTrade)
				return;

			DateTime ny = ToNy(Time[0]);
			// Dia de trading de futuros CME: empieza a las 18:00 NY del dia anterior.
			DateTime tradingDay = ny.AddHours(6).Date;
			if (tradingDay != currentNyDate)
			{
				currentNyDate   = tradingDay;
				sessionStartPnl = SystemPerformance.AllTrades.TradesPerformance.Currency.CumProfit;
				tradesToday     = 0;
				haltedToday     = false;
				OnNewNyDay(tradingDay);
			}

			// Riesgo diario (realizado + flotante)
			double dayPnl = SystemPerformance.AllTrades.TradesPerformance.Currency.CumProfit - sessionStartPnl;
			if (Position.MarketPosition != MarketPosition.Flat)
				dayPnl += Position.GetUnrealizedProfitLoss(PerformanceUnit.Currency, Close[0]);

			if (!haltedToday && ((DailyLossLimitUsd > 0 && dayPnl <= -DailyLossLimitUsd) ||
			                     (DailyProfitUsd > 0 && dayPnl >= DailyProfitUsd)))
			{
				haltedToday = true;
				Print(string.Format("{0} {1}: limite diario alcanzado ({2:C}). Sin mas operaciones hoy.", Time[0], Name, dayPnl));
				FlattenAll("CC_Daily");
			}

			TimeSpan tod = ny.TimeOfDay;
			TimeSpan sStart = ParseHm(SessionStart, new TimeSpan(18, 0, 0));
			TimeSpan sEnd   = ParseHm(SessionEnd,   new TimeSpan(16, 0, 0));
			bool inSession  = !SessionOn || InWindow(tod, sStart, sEnd);

			if (SessionOn && FlattenAtSessionEnd && !inSession)
				FlattenAll("CC_SessEnd");

			// Gestion BE/lock con precio de cierre si no hay serie de ticks (backtest sin ticks).
			if (BarsArray.Length < 2)
				ManageOpenPosition(Close[0]);

			if (hub != null)
			{
				hub.DayPnl   = dayPnl;
				hub.Position = Position.MarketPosition == MarketPosition.Flat ? "Plano"
					: (Position.MarketPosition == MarketPosition.Long ? "Largo " : "Corto ") + Position.Quantity;
			}

			int signal = GetSignal();   // Se llama siempre para que las hijas mantengan su estado

			if (signal == 0 || haltedToday || !inSession || PausedByPanel) return;
			if (Position.MarketPosition != MarketPosition.Flat) return;
			if (MaxTradesPerDay > 0 && tradesToday >= MaxTradesPerDay) return;
			if (signal > 0 && Direction == CCDirection.SoloCortos) return;
			if (signal < 0 && Direction == CCDirection.SoloLargos) return;

			Enter(signal);
		}

		private void Enter(int signal)
		{
			int qty = signal > 0 ? QtyLong : QtyShort;
			if (qty <= 0) return;

			string name = signal > 0 ? LongName : ShortName;
			int slTicks = UsdToTicks(StopLossUsd, qty);
			int tpTicks = UsdToTicks(TargetUsd, qty);

			// Se fijan ANTES de la entrada para que la orden protectora salga con el fill.
			SetStopLoss(name, CalculationMode.Ticks, slTicks, false);
			SetProfitTarget(name, CalculationMode.Ticks, tpTicks);

			tpTicksOpen   = tpTicks;
			stopPriceOpen = 0;
			beDone        = false;
			lockDone      = false;

			if (signal > 0) EnterLong(qty, name);
			else            EnterShort(qty, name);

			if (hub != null) hub.LastEvent = string.Format("{0:HH:mm} {1} {2} ct", Time[0], signal > 0 ? "COMPRA" : "VENTA", qty);
			Print(string.Format("{0} {1}: {2} {3} ct | SL {4} ticks (${5}) | TP {6} ticks (${7})",
				Time[0], Name, signal > 0 ? "COMPRA" : "VENTA", qty, slTicks, StopLossUsd, tpTicks, TargetUsd));
		}

		protected void FlattenAll(string signalName)
		{
			if (Position.MarketPosition == MarketPosition.Long)  ExitLong(signalName, LongName);
			if (Position.MarketPosition == MarketPosition.Short) ExitShort(signalName, ShortName);
		}

		/// Break Even y asegurar profit. Solo mueve el stop a favor, nunca en contra.
		private void ManageOpenPosition(double price)
		{
			if (Position.MarketPosition == MarketPosition.Flat || tpTicksOpen <= 0) return;
			if (!BreakEvenOn && !LockOn) return;

			bool isLong   = Position.MarketPosition == MarketPosition.Long;
			double avg    = Position.AveragePrice;
			double profitTicks = (isLong ? price - avg : avg - price) / TickSize;
			string name   = isLong ? LongName : ShortName;

			if (LockOn && !lockDone && profitTicks >= tpTicksOpen * LockTriggerPct / 100.0)
			{
				double keepTicks = Math.Floor(profitTicks * LockStopPct / 100.0);
				MoveStop(name, isLong, isLong ? avg + keepTicks * TickSize : avg - keepTicks * TickSize);
				lockDone = true;
				beDone   = true;
			}
			else if (BreakEvenOn && !beDone && profitTicks >= tpTicksOpen * BreakEvenPct / 100.0)
			{
				MoveStop(name, isLong, avg);
				beDone = true;
			}
		}

		private void MoveStop(string name, bool isLong, double newStop)
		{
			newStop = Instrument.MasterInstrument.RoundToTickSize(newStop);
			if (stopPriceOpen != 0 && (isLong ? newStop <= stopPriceOpen : newStop >= stopPriceOpen))
				return;
			stopPriceOpen = newStop;
			SetStopLoss(name, CalculationMode.Price, newStop, false);
		}

		protected override void OnExecutionUpdate(Execution execution, string executionId, double price, int quantity,
			MarketPosition marketPosition, string orderId, DateTime time)
		{
			Order o = execution.Order;
			if (o == null || o.OrderState != OrderState.Filled) return;
			if (o.Name == LongName || o.Name == ShortName)
				tradesToday++;
		}

		#region Propiedades

		[NinjaScriptProperty]
		[Display(Name = "Direccion", Order = 1, GroupName = "1. Grupo (dinero)")]
		public CCDirection Direction { get; set; }

		[NinjaScriptProperty]
		[Range(0, int.MaxValue)]
		[Display(Name = "Contratos COMPRA", Order = 2, GroupName = "1. Grupo (dinero)")]
		public int QtyLong { get; set; }

		[NinjaScriptProperty]
		[Range(0, int.MaxValue)]
		[Display(Name = "Contratos VENTA", Order = 3, GroupName = "1. Grupo (dinero)")]
		public int QtyShort { get; set; }

		[NinjaScriptProperty]
		[Range(1, double.MaxValue)]
		[Display(Name = "TP $ (por operacion)", Order = 4, GroupName = "1. Grupo (dinero)")]
		public double TargetUsd { get; set; }

		[NinjaScriptProperty]
		[Range(1, double.MaxValue)]
		[Display(Name = "SL $ (por operacion)", Order = 5, GroupName = "1. Grupo (dinero)")]
		public double StopLossUsd { get; set; }

		[NinjaScriptProperty]
		[Range(0, int.MaxValue)]
		[Display(Name = "Max operaciones/dia (0 = ilimitado)", Order = 6, GroupName = "1. Grupo (dinero)")]
		public int MaxTradesPerDay { get; set; }

		[NinjaScriptProperty]
		[Range(0, double.MaxValue)]
		[Display(Name = "Perdida max. diaria $ (PDLL, 0 = off)", Order = 7, GroupName = "1. Grupo (dinero)")]
		public double DailyLossLimitUsd { get; set; }

		[NinjaScriptProperty]
		[Range(0, double.MaxValue)]
		[Display(Name = "Objetivo diario $ (PDPT, 0 = off)", Order = 8, GroupName = "1. Grupo (dinero)")]
		public double DailyProfitUsd { get; set; }

		[NinjaScriptProperty]
		[Display(Name = "Filtrar sesion", Order = 1, GroupName = "2. Sesion (hora NY)")]
		public bool SessionOn { get; set; }

		[NinjaScriptProperty]
		[Display(Name = "Inicio (NY, HH:mm)", Order = 2, GroupName = "2. Sesion (hora NY)")]
		public string SessionStart { get; set; }

		[NinjaScriptProperty]
		[Display(Name = "Fin (NY, HH:mm)", Order = 3, GroupName = "2. Sesion (hora NY)")]
		public string SessionEnd { get; set; }

		[NinjaScriptProperty]
		[Display(Name = "Cerrar posicion fuera de sesion", Order = 4, GroupName = "2. Sesion (hora NY)")]
		public bool FlattenAtSessionEnd { get; set; }

		[NinjaScriptProperty]
		[Display(Name = "Break Even", Order = 1, GroupName = "3. Gestion")]
		public bool BreakEvenOn { get; set; }

		[NinjaScriptProperty]
		[Range(1, 99)]
		[Display(Name = "BE al % del TP", Order = 2, GroupName = "3. Gestion")]
		public int BreakEvenPct { get; set; }

		[NinjaScriptProperty]
		[Display(Name = "Asegurar profit", Order = 3, GroupName = "3. Gestion")]
		public bool LockOn { get; set; }

		[NinjaScriptProperty]
		[Range(1, 99)]
		[Display(Name = "Disparo % del TP", Order = 4, GroupName = "3. Gestion")]
		public int LockTriggerPct { get; set; }

		[NinjaScriptProperty]
		[Range(1, 99)]
		[Display(Name = "SL al % del profit", Order = 5, GroupName = "3. Gestion")]
		public int LockStopPct { get; set; }

		#endregion
	}
}
