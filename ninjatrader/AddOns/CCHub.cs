#region Using declarations
using System;
using System.Collections.Generic;
using System.Linq;
#endregion

// ============================================================================
//  CCHub - registro compartido entre las estrategias CC* y el panel
//  "Command Pro Clone" (CCCommandCenter).
//  Cada estrategia que corre en tiempo real (Sim o real) se registra aqui.
//  El panel lee su estado y puede pausarla, reanudarla o cerrar su posicion.
//  Pausar = no abre operaciones nuevas (lo que ya esta abierto sigue con su SL/TP).
// ============================================================================
namespace NinjaTrader.NinjaScript.AddOns
{
	public class CCStrategyHandle
	{
		public string   Id;
		public string   Strategy;
		public string   Account;
		public string   Instrument;
		public DateTime Started;

		private volatile bool paused;
		public bool Paused { get { return paused; } set { paused = value; } }

		// Lo actualiza la estrategia en cada vela; el panel solo lo lee.
		public volatile string Position = "Plano";
		public volatile string LastEvent = "";
		private long dayPnlCents;
		public double DayPnl
		{
			get { return System.Threading.Interlocked.Read(ref dayPnlCents) / 100.0; }
			set { System.Threading.Interlocked.Exchange(ref dayPnlCents, (long)Math.Round(value * 100)); }
		}

		// Accion que la estrategia ejecuta en su propio hilo (TriggerCustomEvent).
		internal Action FlattenAction;

		public void RequestFlatten()
		{
			Action a = FlattenAction;
			if (a == null) return;
			try { a(); } catch (Exception ex) { LastEvent = "Error al cerrar: " + ex.Message; }
		}
	}

	public static class CCHub
	{
		private static readonly object sync = new object();
		private static readonly List<CCStrategyHandle> handles = new List<CCStrategyHandle>();

		public static CCStrategyHandle Register(string strategy, string account, string instrument, Action flatten)
		{
			CCStrategyHandle h = new CCStrategyHandle
			{
				Id            = Guid.NewGuid().ToString("N").Substring(0, 8),
				Strategy      = strategy,
				Account       = account,
				Instrument    = instrument,
				Started       = DateTime.Now,
				FlattenAction = flatten
			};
			lock (sync) handles.Add(h);
			return h;
		}

		public static void Unregister(CCStrategyHandle h)
		{
			if (h == null) return;
			h.FlattenAction = null;
			lock (sync) handles.Remove(h);
		}

		public static List<CCStrategyHandle> Snapshot()
		{
			lock (sync) return handles.ToList();
		}

		public static void PauseAll(bool paused)
		{
			foreach (CCStrategyHandle h in Snapshot()) h.Paused = paused;
		}

		/// KILL SWITCH: pausa todas las estrategias y cierra sus posiciones.
		public static void KillSwitch()
		{
			foreach (CCStrategyHandle h in Snapshot())
			{
				h.Paused = true;
				h.RequestFlatten();
			}
		}
	}
}
