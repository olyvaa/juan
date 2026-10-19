#region Using declarations
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading;
using NinjaTrader.Cbi;
#endregion

// ============================================================================
//  CCBridge - puente local entre NinjaTrader y el panel web (Tandem /panel.html)
//
//  Escucha SOLO en http://localhost:8793/ (no es accesible desde otros equipos).
//  Seguridad:
//   - Solo acepta Host localhost/127.0.0.1 (evita DNS rebinding).
//   - Solo acepta Origin de localhost (o sin Origin).
//   - Las acciones (POST) exigen la cabecera X-CC-Panel: 1, que el navegador
//     no deja enviar desde otras webs sin permiso CORS -> ninguna pagina de
//     internet puede mandar ordenes.
//
//  GET  /api/state
//  POST /api/strategies/{id}/pause | resume | flatten
//  POST /api/killswitch
//  POST /api/copier/start   {"master":"Sim101","followers":[{"account":"Sim102","multiplier":1,"inverse":false}]}
//  POST /api/copier/stop | sync | flatten
// ============================================================================
namespace NinjaTrader.NinjaScript.AddOns
{
	public static class CCBridge
	{
		public const int Port = 8793;

		private static HttpListener listener;
		private static Thread thread;
		private static volatile bool running;

		public static bool Running { get { return running; } }
		public static string LastError { get; private set; }

		public static void Start()
		{
			if (running) return;
			try
			{
				listener = new HttpListener();
				listener.Prefixes.Add("http://localhost:" + Port + "/");
				listener.Start();
				running = true;
				thread = new Thread(Loop) { IsBackground = true, Name = "CCBridge" };
				thread.Start();
				LastError = null;
			}
			catch (Exception ex)
			{
				running   = false;
				LastError = ex.Message;
			}
		}

		public static void Stop()
		{
			running = false;
			try { if (listener != null) listener.Close(); } catch { }
			listener = null;
		}

		private static void Loop()
		{
			while (running)
			{
				HttpListenerContext ctx;
				try { ctx = listener.GetContext(); }
				catch { break; }
				ThreadPool.QueueUserWorkItem(_ => Handle(ctx));
			}
		}

		// -------------------------------------------------------------- peticiones
		private static bool IsLocalOrigin(string origin)
		{
			if (string.IsNullOrEmpty(origin)) return true;
			Uri u;
			return Uri.TryCreate(origin, UriKind.Absolute, out u) && (u.Host == "localhost" || u.Host == "127.0.0.1");
		}

		private static void Handle(HttpListenerContext ctx)
		{
			HttpListenerRequest req  = ctx.Request;
			HttpListenerResponse res = ctx.Response;
			try
			{
				string host   = (req.UserHostName ?? "").Split(':')[0];
				string origin = req.Headers["Origin"];
				if ((host != "localhost" && host != "127.0.0.1") || !IsLocalOrigin(origin))
				{
					Send(res, 403, "{\"error\":\"solo localhost\"}");
					return;
				}
				if (!string.IsNullOrEmpty(origin))
				{
					res.AddHeader("Access-Control-Allow-Origin", origin);
					res.AddHeader("Vary", "Origin");
					res.AddHeader("Access-Control-Allow-Headers", "Content-Type, X-CC-Panel");
					res.AddHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
				}
				if (req.HttpMethod == "OPTIONS") { Send(res, 204, ""); return; }

				string path = req.Url.AbsolutePath.TrimEnd('/');
				if (req.HttpMethod == "GET" && path == "/api/state") { Send(res, 200, StateJson()); return; }

				if (req.HttpMethod != "POST") { Send(res, 404, "{\"error\":\"no encontrado\"}"); return; }
				if (req.Headers["X-CC-Panel"] != "1") { Send(res, 403, "{\"error\":\"falta cabecera X-CC-Panel\"}"); return; }

				string body;
				using (StreamReader r = new StreamReader(req.InputStream, Encoding.UTF8)) body = r.ReadToEnd();

				string result = Command(path, body);
				if (result == null) Send(res, 404, "{\"error\":\"accion desconocida\"}");
				else Send(res, 200, result);
			}
			catch (Exception ex)
			{
				try { Send(res, 400, "{\"error\":" + Json.Str(ex.Message) + "}"); } catch { }
			}
		}

		private static void Send(HttpListenerResponse res, int status, string json)
		{
			byte[] data = Encoding.UTF8.GetBytes(json);
			res.StatusCode = status;
			res.ContentType = "application/json; charset=utf-8";
			res.AddHeader("Cache-Control", "no-store");
			res.ContentLength64 = data.Length;
			if (data.Length > 0) res.OutputStream.Write(data, 0, data.Length);
			res.OutputStream.Close();
		}

		private static string Ok(string msg) { return "{\"ok\":true,\"message\":" + Json.Str(msg) + "}"; }

		private static string Command(string path, string body)
		{
			string[] parts = path.Split(new[] { '/' }, StringSplitOptions.RemoveEmptyEntries);   // api, ...
			if (parts.Length == 4 && parts[1] == "strategies")
			{
				CCStrategyHandle h = CCHub.Snapshot().FirstOrDefault(x => x.Id == parts[2]);
				if (h == null) throw new InvalidOperationException("La estrategia ya no esta activa.");
				switch (parts[3])
				{
					case "pause":   h.Paused = true;  return Ok(h.Strategy + " pausada");
					case "resume":  h.Paused = false; return Ok(h.Strategy + " reanudada");
					case "flatten": h.RequestFlatten(); return Ok("Cierre enviado a " + h.Strategy);
				}
				return null;
			}
			if (parts.Length == 2 && parts[1] == "killswitch")
			{
				CCHub.KillSwitch();
				if (CCCopier.Shared.Running) CCCopier.Shared.FlattenFollowers();
				return Ok("Kill switch: estrategias pausadas y posiciones cerradas");
			}
			if (parts.Length == 3 && parts[1] == "copier")
			{
				CCCopier c = CCCopier.Shared;
				switch (parts[2])
				{
					case "start":
						Dictionary<string, object> o = Json.Parse(body) as Dictionary<string, object>;
						if (o == null) throw new InvalidOperationException("Cuerpo JSON no valido.");
						string master = o.ContainsKey("master") ? o["master"] as string : null;
						List<CCFollower> followers = new List<CCFollower>();
						List<object> list = o.ContainsKey("followers") ? o["followers"] as List<object> : null;
						if (list != null)
							foreach (object item in list)
							{
								Dictionary<string, object> f = item as Dictionary<string, object>;
								if (f == null || !(f.ContainsKey("account") && f["account"] is string)) continue;
								double m = f.ContainsKey("multiplier") && f["multiplier"] is double ? (double)f["multiplier"] : 1;
								if (m <= 0) m = 1;
								followers.Add(new CCFollower { AccountName = (string)f["account"], Multiplier = m,
									Inverse = f.ContainsKey("inverse") && f["inverse"] is bool && (bool)f["inverse"], Enabled = true });
							}
						if (string.IsNullOrEmpty(master) || CCCopier.FindAccount(master) == null)
							throw new InvalidOperationException("La cuenta maestra no existe.");
						foreach (CCFollower f in followers)
							if (CCCopier.FindAccount(f.AccountName) == null)
								throw new InvalidOperationException("No existe la cuenta " + f.AccountName);
						c.Start(master, followers);
						CCCopier.SaveConfig(master, followers);
						return Ok("Copiador activo");
					case "stop":    c.Stop();             return Ok("Copiador detenido");
					case "sync":    c.SyncAll();          return Ok("Sincronizado");
					case "flatten": c.FlattenFollowers(); return Ok("Posiciones copiadas cerradas");
				}
			}
			return null;
		}

		// -------------------------------------------------------------- estado
		private static double AccountValue(Account a, AccountItem item)
		{
			try { return a.Get(item, Currency.UsDollar); } catch { return 0; }
		}

		private static bool IsSim(string name)
		{
			return name.StartsWith("Sim", StringComparison.OrdinalIgnoreCase)
				|| name.StartsWith("Playback", StringComparison.OrdinalIgnoreCase)
				|| name.StartsWith("Backtest", StringComparison.OrdinalIgnoreCase);
		}

		private static string StateJson()
		{
			StringBuilder sb = new StringBuilder();
			sb.Append("{\"connected\":true,\"time\":").Append(Json.Str(DateTime.Now.ToString("s")));

			sb.Append(",\"strategies\":[");
			bool first = true;
			foreach (CCStrategyHandle h in CCHub.Snapshot())
			{
				if (!first) sb.Append(','); first = false;
				sb.Append("{\"id\":").Append(Json.Str(h.Id))
				  .Append(",\"strategy\":").Append(Json.Str(h.Strategy))
				  .Append(",\"account\":").Append(Json.Str(h.Account))
				  .Append(",\"instrument\":").Append(Json.Str(h.Instrument))
				  .Append(",\"position\":").Append(Json.Str(h.Position))
				  .Append(",\"dayPnl\":").Append(Json.Num(h.DayPnl))
				  .Append(",\"lastEvent\":").Append(Json.Str(h.LastEvent))
				  .Append(",\"paused\":").Append(h.Paused ? "true" : "false")
				  .Append(",\"started\":").Append(Json.Str(h.Started.ToString("s")))
				  .Append('}');
			}
			sb.Append(']');

			CCCopier c = CCCopier.Shared;
			sb.Append(",\"copier\":{\"running\":").Append(c.Running ? "true" : "false")
			  .Append(",\"master\":").Append(Json.Str(c.Running ? c.MasterName : ""))
			  .Append(",\"followers\":[");
			first = true;
			if (c.Running)
				foreach (CCFollower f in c.Followers.ToList())
				{
					if (!first) sb.Append(','); first = false;
					sb.Append("{\"account\":").Append(Json.Str(f.AccountName))
					  .Append(",\"multiplier\":").Append(Json.Num(f.Multiplier))
					  .Append(",\"inverse\":").Append(f.Inverse ? "true" : "false").Append('}');
				}
			sb.Append("],\"log\":[");
			sb.Append(string.Join(",", c.RecentLog().Take(60).Select(Json.Str)));
			sb.Append("]}");

			sb.Append(",\"accounts\":[");
			List<Account> accounts;
			lock (Account.All) accounts = Account.All.ToList();
			first = true;
			foreach (Account a in accounts.OrderBy(x => x.Name))
			{
				if (!first) sb.Append(','); first = false;
				sb.Append("{\"name\":").Append(Json.Str(a.Name))
				  .Append(",\"sim\":").Append(IsSim(a.Name) ? "true" : "false")
				  .Append(",\"cash\":").Append(Json.Num(AccountValue(a, AccountItem.CashValue)))
				  .Append(",\"realized\":").Append(Json.Num(AccountValue(a, AccountItem.RealizedProfitLoss)))
				  .Append(",\"unrealized\":").Append(Json.Num(AccountValue(a, AccountItem.UnrealizedProfitLoss)))
				  .Append(",\"positions\":[");
				bool pf = true;
				lock (a.Positions)
					foreach (Position p in a.Positions)
					{
						if (p.MarketPosition == MarketPosition.Flat || p.Instrument == null) continue;
						if (!pf) sb.Append(','); pf = false;
						sb.Append("{\"instrument\":").Append(Json.Str(p.Instrument.FullName))
						  .Append(",\"qty\":").Append(p.MarketPosition == MarketPosition.Long ? p.Quantity : -p.Quantity)
						  .Append(",\"avgPrice\":").Append(Json.Num(p.AveragePrice)).Append('}');
					}
				sb.Append("]}");
			}
			sb.Append("]}");
			return sb.ToString();
		}
	}

	// ------------------------------------------------------------------ JSON minimo
	public static class Json
	{
		public static string Num(double v)
		{
			if (double.IsNaN(v) || double.IsInfinity(v)) return "0";
			return v.ToString("0.########", CultureInfo.InvariantCulture);
		}

		public static string Str(string s)
		{
			if (s == null) return "null";
			StringBuilder sb = new StringBuilder("\"");
			foreach (char ch in s)
			{
				switch (ch)
				{
					case '"':  sb.Append("\\\""); break;
					case '\\': sb.Append("\\\\"); break;
					case '\n': sb.Append("\\n");  break;
					case '\r': sb.Append("\\r");  break;
					case '\t': sb.Append("\\t");  break;
					default:
						if (ch < 0x20) sb.Append("\\u").Append(((int)ch).ToString("x4"));
						else sb.Append(ch);
						break;
				}
			}
			return sb.Append('"').ToString();
		}

		/// Devuelve Dictionary&lt;string,object&gt;, List&lt;object&gt;, string, double, bool o null.
		public static object Parse(string text)
		{
			text = text ?? "";
			int i = 0;
			object v = Value(text, ref i);
			Ws(text, ref i);
			if (i != text.Length) throw new FormatException("JSON con contenido sobrante.");
			return v;
		}

		private static void Ws(string t, ref int i) { while (i < t.Length && char.IsWhiteSpace(t[i])) i++; }

		private static object Value(string t, ref int i)
		{
			Ws(t, ref i);
			if (i >= t.Length) throw new FormatException("JSON incompleto.");
			char c = t[i];
			if (c == '{')
			{
				Dictionary<string, object> d = new Dictionary<string, object>();
				i++; Ws(t, ref i);
				if (i < t.Length && t[i] == '}') { i++; return d; }
				while (true)
				{
					Ws(t, ref i);
					string key = StrValue(t, ref i);
					Ws(t, ref i);
					if (i >= t.Length || t[i] != ':') throw new FormatException("Se esperaba ':'.");
					i++;
					d[key] = Value(t, ref i);
					Ws(t, ref i);
					if (i < t.Length && t[i] == ',') { i++; continue; }
					if (i < t.Length && t[i] == '}') { i++; return d; }
					throw new FormatException("Se esperaba ',' o '}'.");
				}
			}
			if (c == '[')
			{
				List<object> l = new List<object>();
				i++; Ws(t, ref i);
				if (i < t.Length && t[i] == ']') { i++; return l; }
				while (true)
				{
					l.Add(Value(t, ref i));
					Ws(t, ref i);
					if (i < t.Length && t[i] == ',') { i++; continue; }
					if (i < t.Length && t[i] == ']') { i++; return l; }
					throw new FormatException("Se esperaba ',' o ']'.");
				}
			}
			if (c == '"') return StrValue(t, ref i);
			if (t.Length - i >= 4 && string.CompareOrdinal(t, i, "true", 0, 4) == 0)  { i += 4; return true; }
			if (t.Length - i >= 5 && string.CompareOrdinal(t, i, "false", 0, 5) == 0) { i += 5; return false; }
			if (t.Length - i >= 4 && string.CompareOrdinal(t, i, "null", 0, 4) == 0)  { i += 4; return null; }
			int start = i;
			while (i < t.Length && "+-0123456789.eE".IndexOf(t[i]) >= 0) i++;
			double num;
			if (i == start || !double.TryParse(t.Substring(start, i - start), NumberStyles.Float, CultureInfo.InvariantCulture, out num))
				throw new FormatException("Valor JSON no valido.");
			return num;
		}

		private static string StrValue(string t, ref int i)
		{
			if (i >= t.Length || t[i] != '"') throw new FormatException("Se esperaba texto.");
			i++;
			StringBuilder sb = new StringBuilder();
			while (i < t.Length && t[i] != '"')
			{
				if (t[i] == '\\' && i + 1 < t.Length)
				{
					i++;
					char e = t[i];
					if (e == 'n') sb.Append('\n');
					else if (e == 't') sb.Append('\t');
					else if (e == 'r') sb.Append('\r');
					else if (e == 'u' && i + 4 < t.Length) { sb.Append((char)Convert.ToInt32(t.Substring(i + 1, 4), 16)); i += 4; }
					else sb.Append(e);
				}
				else sb.Append(t[i]);
				i++;
			}
			if (i >= t.Length) throw new FormatException("Texto sin cerrar.");
			i++;
			return sb.ToString();
		}
	}
}
