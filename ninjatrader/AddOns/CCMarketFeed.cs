#region Using declarations
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using NinjaTrader.Cbi;
using NinjaTrader.Data;
#endregion

// ============================================================================
//  CCMarketFeed - velas de 1 minuto en TIEMPO REAL de un instrumento (por defecto
//  MNQ 12-26), con los datos de la conexion de NinjaTrader.
//  Las usa el panel web (Juanitos Funding) a traves de CCBridge: GET /api/market
//  Solo lee datos de mercado; no envia ninguna orden.
// ============================================================================
namespace NinjaTrader.NinjaScript.AddOns
{
	public static class CCMarketFeed
	{
		public const string DefaultInstrument = "MNQ 12-26";
		private const string TradingHoursName = "CME US Index Futures ETH";
		private const int BarsBack = 7200;   // ~5 dias de velas de 1 minuto

		private static readonly object sync = new object();
		private static readonly SortedDictionary<long, double[]> bars = new SortedDictionary<long, double[]>();   // apertura (epoch s) -> o,h,l,c
		private static BarsRequest request;
		private static string instrumentName;
		private static string error;
		private static bool loaded;
		private static DateTime lastUpdate;

		/// Arranca (o cambia) la descarga de velas del instrumento.
		public static void Ensure(string name)
		{
			if (string.IsNullOrWhiteSpace(name)) name = DefaultInstrument;
			lock (sync)
			{
				if (request != null && name == instrumentName && error == null) return;
				Stop();
				instrumentName = name;
				error = null;
				loaded = false;
				bars.Clear();
				try
				{
					Instrument inst = Instrument.GetInstrument(name);
					if (inst == null) { error = "NinjaTrader no conoce el instrumento " + name; return; }
					request = new BarsRequest(inst, BarsBack);
					request.BarsPeriod = new BarsPeriod { BarsPeriodType = BarsPeriodType.Minute, Value = 1 };
					request.TradingHours = TradingHours.Get(TradingHoursName);
					request.Update += OnUpdate;
					request.Request(OnLoaded);
				}
				catch (Exception ex) { error = ex.Message; request = null; }
			}
		}

		public static void Stop()
		{
			lock (sync)
			{
				if (request == null) return;
				try { request.Update -= OnUpdate; request.Dispose(); } catch { }
				request = null;
			}
		}

		private static long Epoch(DateTime ntTime)
		{
			DateTime utc = TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(ntTime, DateTimeKind.Unspecified), Core.Globals.GeneralOptions.TimeZoneInfo);
			return (long)(utc - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalSeconds;
		}

		/// En NinjaTrader la hora de la vela es la de CIERRE; el panel usa la de apertura.
		private static void Store(Bars series, int i)
		{
			long open = Epoch(series.GetTime(i)) - 60;
			bars[open] = new[] { series.GetOpen(i), series.GetHigh(i), series.GetLow(i), series.GetClose(i) };
			while (bars.Count > BarsBack + 200) bars.Remove(bars.Keys.First());
		}

		private static void OnLoaded(BarsRequest r, ErrorCode code, string message)
		{
			lock (sync)
			{
				if (r != request) return;
				if (code != ErrorCode.NoError) { error = "Error al pedir datos: " + message; return; }
				for (int i = 0; i < r.Bars.Count; i++) Store(r.Bars, i);
				loaded = true;
				lastUpdate = DateTime.Now;
			}
		}

		private static void OnUpdate(object sender, BarsUpdateEventArgs e)
		{
			lock (sync)
			{
				if (sender != request) return;
				for (int i = e.MinIndex; i <= e.MaxIndex; i++) Store(e.BarsSeries, i);
				lastUpdate = DateTime.Now;
			}
		}

		/// JSON para el panel: velas cerradas posteriores a "since" + vela en formacion.
		public static string ToJson(string name, long since)
		{
			Ensure(name);
			lock (sync)
			{
				StringBuilder sb = new StringBuilder();
				sb.Append("{\"instrument\":").Append(Json.Str(instrumentName))
				  .Append(",\"loaded\":").Append(loaded ? "true" : "false")
				  .Append(",\"error\":").Append(Json.Str(error))
				  .Append(",\"updated\":").Append(Json.Str(lastUpdate == DateTime.MinValue ? "" : lastUpdate.ToString("s")));
				List<KeyValuePair<long, double[]>> all = bars.ToList();
				KeyValuePair<long, double[]>? forming = all.Count > 0 ? all[all.Count - 1] : (KeyValuePair<long, double[]>?)null;
				sb.Append(",\"last\":").Append(forming.HasValue ? Json.Num(forming.Value.Value[3]) : "0");
				sb.Append(",\"forming\":").Append(forming.HasValue ? Bar(forming.Value) : "null");
				sb.Append(",\"bars\":[");
				bool first = true;
				for (int i = 0; i < all.Count - 1; i++)       // la ultima vela aun se esta formando
				{
					if (all[i].Key <= since) continue;
					if (!first) sb.Append(','); first = false;
					sb.Append(Bar(all[i]));
				}
				sb.Append("]}");
				return sb.ToString();
			}
		}

		private static string Bar(KeyValuePair<long, double[]> b)
		{
			return "[" + b.Key + "," + Json.Num(b.Value[0]) + "," + Json.Num(b.Value[1]) + ","
				+ Json.Num(b.Value[2]) + "," + Json.Num(b.Value[3]) + "]";
		}
	}
}
