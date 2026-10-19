#region Using declarations
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Threading;
using NinjaTrader.Cbi;
using NinjaTrader.Gui;
using NinjaTrader.Gui.Tools;
#endregion

// ============================================================================
//  Command Pro Clone - panel dentro de NinjaTrader 8
//  Control Center -> New -> "Command Pro Clone"
//
//  Pestana ESTRATEGIAS: estado en vivo de CCGoatPro / CCGYR / CCRangOpenNY /
//    CCJetF1 que esten activas (Sim o real). Pausar, reanudar, cerrar
//    posicion y KILL SWITCH general.
//
//  Pestana COPIADOR: copia la posicion de una cuenta MAESTRA a varias
//    SEGUIDORAS, con multiplicador e inversion por cuenta.
// ============================================================================
namespace NinjaTrader.NinjaScript.AddOns
{
	public class CCCommandCenter : AddOnBase
	{
		private NTMenuItem menuItem;
		private NTMenuItem newMenu;

		protected override void OnStateChange()
		{
			if (State == State.SetDefaults)
			{
				Name        = "CCCommandCenter";
				Description = "Panel Command Pro Clone: control de estrategias CC* y copiador de cuentas";
			}
		}

		protected override void OnWindowCreated(Window window)
		{
			ControlCenter cc = window as ControlCenter;
			if (cc == null) return;

			newMenu = cc.FindFirst("ControlCenterMenuItemNew") as NTMenuItem;
			if (newMenu == null) return;

			menuItem = new NTMenuItem
			{
				Header = "Command Pro Clone",
				Style  = Application.Current.TryFindResource("MainMenuItem") as Style
			};
			newMenu.Items.Add(menuItem);
			menuItem.Click += OnMenuItemClick;
		}

		protected override void OnWindowDestroyed(Window window)
		{
			if (menuItem != null && window is ControlCenter)
			{
				if (newMenu != null && newMenu.Items.Contains(menuItem))
					newMenu.Items.Remove(menuItem);
				menuItem.Click -= OnMenuItemClick;
				menuItem = null;
			}
		}

		private void OnMenuItemClick(object sender, RoutedEventArgs e)
		{
			Core.Globals.RandomDispatcher.BeginInvoke(new Action(() => new CCCommandWindow().Show()));
		}
	}

	// ========================================================================
	//  COPIADOR
	//  Copia la POSICION NETA: cada vez que la maestra tiene una ejecucion,
	//  calcula la posicion objetivo de cada seguidora
	//      objetivo = posicion maestra x multiplicador (redondeo hacia abajo, minimo 1)
	//  y envia ordenes a mercado por la diferencia. Asi copia entradas,
	//  parciales, salidas por SL/TP, cierres manuales y giros.
	// ========================================================================
	public class CCFollower
	{
		public string AccountName;
		public double Multiplier = 1;
		public bool   Inverse;
		public bool   Enabled = true;
	}

	public class CCCopier
	{
		public const string OrderName = "CCCopy";

		public string MasterName { get; private set; }
		public bool   Running    { get; private set; }
		public List<CCFollower> Followers = new List<CCFollower>();
		public event Action<string> Log;

		private Account master;
		private readonly object sync = new object();
		private readonly HashSet<string> copiedInstruments = new HashSet<string>();
		private readonly Dictionary<string, Instrument> instrumentsByName = new Dictionary<string, Instrument>();

		public static Account FindAccount(string name)
		{
			lock (Account.All)
				return Account.All.FirstOrDefault(a => a.Name == name);
		}

		public static List<string> AccountNames()
		{
			lock (Account.All)
				return Account.All.Select(a => a.Name).OrderBy(n => n).ToList();
		}

		private void Write(string msg)
		{
			Action<string> l = Log;
			if (l != null) l(string.Format("{0:HH:mm:ss}  {1}", DateTime.Now, msg));
		}

		public void Start(string masterName, List<CCFollower> followers)
		{
			if (Running) Stop();
			master = FindAccount(masterName);
			if (master == null) throw new InvalidOperationException("No existe la cuenta maestra " + masterName);
			MasterName = masterName;
			Followers  = followers.Where(f => f.Enabled && f.AccountName != masterName).ToList();
			if (Followers.Count == 0) throw new InvalidOperationException("No hay cuentas seguidoras activas.");

			master.ExecutionUpdate += OnMasterExecution;
			Running = true;
			Write(string.Format("COPIADOR ACTIVO: {0} -> {1}", masterName,
				string.Join(", ", Followers.Select(f => string.Format(CultureInfo.InvariantCulture, "{0} x{1}{2}",
					f.AccountName, f.Multiplier, f.Inverse ? " (inverso)" : "")))));
		}

		public void Stop()
		{
			if (master != null) master.ExecutionUpdate -= OnMasterExecution;
			if (Running) Write("Copiador DETENIDO. Las posiciones abiertas en las seguidoras NO se cierran solas.");
			Running = false;
			master  = null;
		}

		private void OnMasterExecution(object sender, ExecutionEventArgs e)
		{
			try
			{
				if (e == null || e.Execution == null || e.Execution.Instrument == null) return;
				Write(string.Format("Maestra: {0} {1} {2} @ {3}", e.Execution.Instrument.FullName,
					e.Execution.MarketPosition, e.Execution.Quantity, e.Execution.Price));
				SyncInstrument(e.Execution.Instrument);
			}
			catch (Exception ex) { Write("ERROR: " + ex.Message); }
		}

		/// Re-sincroniza todo lo que tiene la maestra y lo copiado en esta sesion.
		public void SyncAll()
		{
			if (!Running || master == null) return;
			List<Instrument> list = new List<Instrument>();
			lock (master.Positions)
				list.AddRange(master.Positions.Where(p => p.MarketPosition != MarketPosition.Flat).Select(p => p.Instrument));
			lock (sync)
				foreach (string n in copiedInstruments)
					if (!list.Any(i => i.FullName == n) && instrumentsByName.ContainsKey(n)) list.Add(instrumentsByName[n]);
			foreach (Instrument inst in list) SyncInstrument(inst);
			Write("Sincronizacion manual hecha (" + list.Count + " instrumentos).");
		}

		/// Cierra en las seguidoras los instrumentos copiados en esta sesion.
		public void FlattenFollowers()
		{
			List<Instrument> list;
			lock (sync) list = instrumentsByName.Values.ToList();
			if (list.Count == 0) { Write("No hay instrumentos copiados que cerrar."); return; }
			foreach (CCFollower f in Followers)
			{
				Account acc = FindAccount(f.AccountName);
				if (acc == null) continue;
				acc.Flatten(list);
				Write("Cerrado en " + f.AccountName + ": " + string.Join(", ", list.Select(i => i.FullName)));
			}
		}

		private static int SignedPosition(Account acc, Instrument inst)
		{
			lock (acc.Positions)
			{
				foreach (Position p in acc.Positions)
					if (p.Instrument != null && p.Instrument.FullName == inst.FullName)
						return p.MarketPosition == MarketPosition.Long ? p.Quantity
							: p.MarketPosition == MarketPosition.Short ? -p.Quantity : 0;
			}
			return 0;
		}

		/// Contratos de ordenes del copiador aun no ejecutadas (para no duplicar).
		private static int PendingCopierQty(Account acc, Instrument inst)
		{
			int q = 0;
			lock (acc.Orders)
			{
				foreach (Order o in acc.Orders)
				{
					if (o.Name != OrderName || o.Instrument == null || o.Instrument.FullName != inst.FullName) continue;
					if (o.OrderState != OrderState.Initialized && o.OrderState != OrderState.Submitted
						&& o.OrderState != OrderState.Accepted && o.OrderState != OrderState.Working
						&& o.OrderState != OrderState.PartFilled) continue;
					int rem = o.Quantity - o.Filled;
					bool buy = o.OrderAction == OrderAction.Buy || o.OrderAction == OrderAction.BuyToCover;
					q += buy ? rem : -rem;
				}
			}
			return q;
		}

		private void SyncInstrument(Instrument inst)
		{
			lock (sync)
			{
				if (!Running || master == null) return;
				copiedInstruments.Add(inst.FullName);
				instrumentsByName[inst.FullName] = inst;

				int mq = SignedPosition(master, inst);
				foreach (CCFollower f in Followers)
				{
					Account acc = FindAccount(f.AccountName);
					if (acc == null) { Write("Seguidora no encontrada: " + f.AccountName); continue; }

					int target = 0;
					if (mq != 0)
					{
						target = Math.Max(1, (int)Math.Floor(Math.Abs(mq) * f.Multiplier)) * Math.Sign(mq);
						if (f.Inverse) target = -target;
					}
					int cur  = SignedPosition(acc, inst) + PendingCopierQty(acc, inst);
					int diff = target - cur;
					if (diff == 0) continue;

					List<Order> orders = new List<Order>();
					if (diff > 0)
					{
						int cover = cur < 0 ? Math.Min(-cur, diff) : 0;
						if (cover > 0)        orders.Add(Make(acc, inst, OrderAction.BuyToCover, cover));
						if (diff - cover > 0) orders.Add(Make(acc, inst, OrderAction.Buy, diff - cover));
					}
					else
					{
						int d    = -diff;
						int sell = cur > 0 ? Math.Min(cur, d) : 0;
						if (sell > 0)     orders.Add(Make(acc, inst, OrderAction.Sell, sell));
						if (d - sell > 0) orders.Add(Make(acc, inst, OrderAction.SellShort, d - sell));
					}
					acc.Submit(orders.ToArray());
					Write(string.Format("{0}: {1} -> objetivo {2} ({3})", f.AccountName, cur, target,
						string.Join(" + ", orders.Select(o => o.OrderAction + " " + o.Quantity))));
				}
			}
		}

		private static Order Make(Account acc, Instrument inst, OrderAction action, int qty)
		{
			return acc.CreateOrder(inst, action, OrderType.Market, OrderEntry.Automated, TimeInForce.Day,
				qty, 0, 0, string.Empty, OrderName, Core.Globals.MaxDate, null);
		}

		// --- Guardar / cargar configuracion (Documents\NinjaTrader 8\CCCopier.txt) ---
		public static string ConfigPath { get { return Path.Combine(Core.Globals.UserDataDir, "CCCopier.txt"); } }

		public static void SaveConfig(string masterName, List<CCFollower> followers)
		{
			try
			{
				List<string> lines = new List<string> { "master;" + masterName };
				foreach (CCFollower f in followers)
					lines.Add(string.Format(CultureInfo.InvariantCulture, "follower;{0};{1};{2};{3}",
						f.AccountName, f.Multiplier, f.Inverse ? 1 : 0, f.Enabled ? 1 : 0));
				File.WriteAllLines(ConfigPath, lines);
			}
			catch { }
		}

		public static void LoadConfig(out string masterName, out List<CCFollower> followers)
		{
			masterName = null;
			followers  = new List<CCFollower>();
			try
			{
				if (!File.Exists(ConfigPath)) return;
				foreach (string line in File.ReadAllLines(ConfigPath))
				{
					string[] p = line.Split(';');
					if (p.Length >= 2 && p[0] == "master") masterName = p[1];
					else if (p.Length >= 5 && p[0] == "follower")
					{
						double m;
						if (!double.TryParse(p[2], NumberStyles.Float, CultureInfo.InvariantCulture, out m)) m = 1;
						followers.Add(new CCFollower { AccountName = p[1], Multiplier = m, Inverse = p[3] == "1", Enabled = p[4] == "1" });
					}
				}
			}
			catch { }
		}
	}

	// ========================================================================
	//  VENTANA
	// ========================================================================
	public class CCCommandWindow : NTWindow
	{
		private readonly CCCopier copier = new CCCopier();
		private readonly DispatcherTimer timer;

		// Estrategias
		private Grid      stratGrid;
		private TextBlock stratEmpty;
		private string    stratKey = "";
		private readonly Dictionary<string, TextBlock[]> stratCells = new Dictionary<string, TextBlock[]>();
		private readonly Dictionary<string, Button> pauseButtons = new Dictionary<string, Button>();

		// Copiador
		private ComboBox   masterBox;
		private StackPanel followersPanel;
		private readonly List<Tuple<string, CheckBox, TextBox, CheckBox>> followerRows = new List<Tuple<string, CheckBox, TextBox, CheckBox>>();
		private Button     startStopBtn;
		private TextBlock  copierStatus;
		private ListBox    logBox;

		public CCCommandWindow()
		{
			Caption = "Command Pro Clone";
			Width   = 980;
			Height  = 620;

			TabControl tabs = new TabControl();
			tabs.Items.Add(new TabItem { Header = "Estrategias", Content = BuildStrategiesTab() });
			tabs.Items.Add(new TabItem { Header = "Copiador",    Content = BuildCopierTab() });
			Content = tabs;

			copier.Log += msg => Dispatcher.InvokeAsync(() => AddLog(msg));

			timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
			timer.Tick += (s, e) => RefreshStrategies();
			timer.Start();

			Closed += (s, e) =>
			{
				timer.Stop();
				copier.Stop();   // por seguridad: cerrar la ventana detiene el copiador
			};
		}

		private static TextBlock Text(string t, bool bold = false, double size = 12)
		{
			return new TextBlock { Text = t, FontWeight = bold ? FontWeights.Bold : FontWeights.Normal, FontSize = size,
				Margin = new Thickness(4, 3, 8, 3), VerticalAlignment = VerticalAlignment.Center, TextWrapping = TextWrapping.Wrap };
		}

		private static Button Btn(string t, RoutedEventHandler click, Brush bg = null)
		{
			Button b = new Button { Content = t, Margin = new Thickness(4), Padding = new Thickness(10, 4, 10, 4) };
			if (bg != null) { b.Background = bg; b.Foreground = Brushes.White; }
			b.Click += click;
			return b;
		}

		// ------------------------------------------------------------------ Estrategias
		private UIElement BuildStrategiesTab()
		{
			DockPanel root = new DockPanel { Margin = new Thickness(8) };

			WrapPanel top = new WrapPanel();
			top.Children.Add(Btn("Pausar todas",   (s, e) => CCHub.PauseAll(true)));
			top.Children.Add(Btn("Reanudar todas", (s, e) => CCHub.PauseAll(false)));
			top.Children.Add(Btn("KILL SWITCH: pausar y cerrar todo", (s, e) =>
			{
				if (MessageBox.Show("Se van a PAUSAR todas las estrategias CC y CERRAR sus posiciones a mercado.\n\nContinuar?",
					"Kill switch", MessageBoxButton.YesNo, MessageBoxImage.Warning) == MessageBoxResult.Yes)
				{
					CCHub.KillSwitch();
					if (copier.Running) copier.FlattenFollowers();
				}
			}, Brushes.DarkRed));
			DockPanel.SetDock(top, Dock.Top);
			root.Children.Add(top);

			TextBlock help = Text(
				"Como iniciar una estrategia: abre un grafico MNQ (5 min para GoatPro/GYR/RangOpenNY, 1 min para JetF1, horario ETH) -> " +
				"clic derecho -> Strategies -> elige CCGoatPro / CCGYR / CCRangOpenNY / CCJetF1 -> Account (Sim101 para pruebas) -> Enabled. " +
				"Al activarse aparece aqui. Pausar = no abre operaciones nuevas; lo abierto mantiene su SL/TP.\n" +
				"GoatPro validada (2026, MNQ M5, ETH): enero-junio +25.779 $ y julio-octubre +26.060 $ con 20/16 ct, TP 1500 $ / SL 2000 $. " +
				"Ajusta contratos y TP/SL a tu cuenta.");
			help.Opacity = 0.8;
			DockPanel.SetDock(help, Dock.Bottom);
			root.Children.Add(help);

			stratGrid = new Grid();
			string[] headers = { "Estrategia", "Cuenta", "Instrumento", "Posicion", "PnL dia", "Ultimo evento", "Estado", "", "" };
			double[] widths  = { 120, 110, 110, 110, 90, 170, 80, 90, 80 };
			for (int i = 0; i < headers.Length; i++)
				stratGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(widths[i]) });
			stratGrid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
			for (int i = 0; i < headers.Length; i++)
			{
				TextBlock h = Text(headers[i], true);
				Grid.SetColumn(h, i);
				stratGrid.Children.Add(h);
			}

			stratEmpty = Text("No hay estrategias CC activas en tiempo real.");
			StackPanel center = new StackPanel();
			center.Children.Add(stratGrid);
			center.Children.Add(stratEmpty);
			root.Children.Add(new ScrollViewer { Content = center, VerticalScrollBarVisibility = ScrollBarVisibility.Auto });
			return root;
		}

		private void RefreshStrategies()
		{
			List<CCStrategyHandle> list = CCHub.Snapshot();
			string key = string.Join("|", list.Select(h => h.Id));
			stratEmpty.Visibility = list.Count == 0 ? Visibility.Visible : Visibility.Collapsed;

			if (key != stratKey)
			{
				stratKey = key;
				stratCells.Clear();
				pauseButtons.Clear();
				while (stratGrid.RowDefinitions.Count > 1) stratGrid.RowDefinitions.RemoveAt(1);
				for (int i = stratGrid.Children.Count - 1; i >= 0; i--)
					if (Grid.GetRow(stratGrid.Children[i]) > 0) stratGrid.Children.RemoveAt(i);

				int row = 1;
				foreach (CCStrategyHandle h in list)
				{
					stratGrid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
					TextBlock[] cells = new TextBlock[7];
					for (int c = 0; c < 7; c++)
					{
						cells[c] = Text("");
						Grid.SetRow(cells[c], row); Grid.SetColumn(cells[c], c);
						stratGrid.Children.Add(cells[c]);
					}
					CCStrategyHandle hh = h;
					Button pause = Btn("Pausar", (s, e) => { hh.Paused = !hh.Paused; RefreshStrategies(); });
					Button close = Btn("Cerrar", (s, e) =>
					{
						if (MessageBox.Show("Cerrar a mercado la posicion de " + hh.Strategy + " en " + hh.Account + "?",
							"Cerrar posicion", MessageBoxButton.YesNo, MessageBoxImage.Question) == MessageBoxResult.Yes)
							hh.RequestFlatten();
					});
					Grid.SetRow(pause, row); Grid.SetColumn(pause, 7);
					Grid.SetRow(close, row); Grid.SetColumn(close, 8);
					stratGrid.Children.Add(pause);
					stratGrid.Children.Add(close);
					stratCells[h.Id]   = cells;
					pauseButtons[h.Id] = pause;
					row++;
				}
			}

			foreach (CCStrategyHandle h in list)
			{
				TextBlock[] c;
				if (!stratCells.TryGetValue(h.Id, out c)) continue;
				c[0].Text = h.Strategy;
				c[1].Text = h.Account;
				c[2].Text = h.Instrument;
				c[3].Text = h.Position;
				c[4].Text = h.DayPnl.ToString("N2");
				c[4].Foreground = h.DayPnl < 0 ? Brushes.IndianRed : (h.DayPnl > 0 ? Brushes.MediumSeaGreen : c[0].Foreground);
				c[5].Text = h.LastEvent;
				c[6].Text = h.Paused ? "PAUSADA" : "Activa";
				c[6].Foreground = h.Paused ? Brushes.Orange : Brushes.MediumSeaGreen;
				pauseButtons[h.Id].Content = h.Paused ? "Reanudar" : "Pausar";
			}

			if (copierStatus != null)
				copierStatus.Text = copier.Running
					? "ACTIVO: " + copier.MasterName + " -> " + string.Join(", ", copier.Followers.Select(f => f.AccountName))
					: "DETENIDO";
		}

		// ------------------------------------------------------------------ Copiador
		private UIElement BuildCopierTab()
		{
			DockPanel root = new DockPanel { Margin = new Thickness(8) };

			StackPanel top = new StackPanel();
			TextBlock warn = Text(
				"Copia la POSICION de la cuenta maestra (entradas, parciales, salidas, giros) a las seguidoras con ordenes a mercado. " +
				"Contratos seguidora = maestra x multiplicador (redondeo hacia abajo, minimo 1). " +
				"NO copia los stops/targets pendientes: si NinjaTrader se cierra o se desconecta, las seguidoras quedan sin proteccion propia. " +
				"No pongas la misma estrategia en la maestra y en las seguidoras (duplicaria ordenes). Prueba primero con cuentas Sim.");
			warn.Foreground = Brushes.Orange;
			top.Children.Add(warn);

			WrapPanel masterRow = new WrapPanel();
			masterRow.Children.Add(Text("Cuenta MAESTRA:", true));
			masterBox = new ComboBox { Width = 200, Margin = new Thickness(4) };
			masterBox.SelectionChanged += (s, e) => BuildFollowerRows(null);
			masterRow.Children.Add(masterBox);
			masterRow.Children.Add(Btn("Actualizar cuentas", (s, e) => LoadAccounts()));
			top.Children.Add(masterRow);

			top.Children.Add(Text("Cuentas SEGUIDORAS (copiar / multiplicador / inverso):", true));
			followersPanel = new StackPanel { Margin = new Thickness(12, 0, 0, 0) };
			top.Children.Add(new ScrollViewer { Content = followersPanel, MaxHeight = 200, VerticalScrollBarVisibility = ScrollBarVisibility.Auto });

			WrapPanel actions = new WrapPanel();
			startStopBtn = Btn("Iniciar copiador", (s, e) => StartStop(), Brushes.DarkGreen);
			actions.Children.Add(startStopBtn);
			actions.Children.Add(Btn("Sincronizar ahora", (s, e) => copier.SyncAll()));
			actions.Children.Add(Btn("Cerrar posiciones copiadas en seguidoras", (s, e) =>
			{
				if (MessageBox.Show("Cerrar a mercado en TODAS las seguidoras los instrumentos copiados?", "Cerrar seguidoras",
					MessageBoxButton.YesNo, MessageBoxImage.Warning) == MessageBoxResult.Yes)
					copier.FlattenFollowers();
			}, Brushes.DarkRed));
			copierStatus = Text("DETENIDO", true);
			actions.Children.Add(copierStatus);
			top.Children.Add(actions);

			DockPanel.SetDock(top, Dock.Top);
			root.Children.Add(top);

			logBox = new ListBox { Margin = new Thickness(0, 6, 0, 0), FontFamily = new FontFamily("Consolas") };
			root.Children.Add(logBox);

			LoadAccounts();
			return root;
		}

		private void LoadAccounts()
		{
			string savedMaster;
			List<CCFollower> saved;
			CCCopier.LoadConfig(out savedMaster, out saved);

			string current = masterBox.SelectedItem as string ?? savedMaster;
			masterBox.Items.Clear();
			foreach (string n in CCCopier.AccountNames()) masterBox.Items.Add(n);
			if (current != null && masterBox.Items.Contains(current)) masterBox.SelectedItem = current;
			else if (masterBox.Items.Count > 0) masterBox.SelectedIndex = 0;
			BuildFollowerRows(saved);
		}

		private void BuildFollowerRows(List<CCFollower> saved)
		{
			if (followersPanel == null) return;
			// Conservar lo que ya se ha escrito en pantalla
			if (saved == null) saved = ReadFollowerRows();
			followersPanel.Children.Clear();
			followerRows.Clear();
			string master = masterBox.SelectedItem as string;

			foreach (string n in CCCopier.AccountNames())
			{
				if (n == master) continue;
				CCFollower cfg = saved.FirstOrDefault(f => f.AccountName == n);
				WrapPanel row = new WrapPanel();
				CheckBox on  = new CheckBox { Content = n, Width = 220, Margin = new Thickness(4), IsChecked = cfg != null && cfg.Enabled };
				TextBox mult = new TextBox { Width = 60, Margin = new Thickness(4),
					Text = (cfg != null ? cfg.Multiplier : 1).ToString(CultureInfo.InvariantCulture) };
				CheckBox inv = new CheckBox { Content = "Inverso", Margin = new Thickness(8, 4, 4, 4), IsChecked = cfg != null && cfg.Inverse };
				row.Children.Add(on);
				row.Children.Add(Text("x"));
				row.Children.Add(mult);
				row.Children.Add(inv);
				followersPanel.Children.Add(row);
				followerRows.Add(Tuple.Create(n, on, mult, inv));
			}
		}

		private List<CCFollower> ReadFollowerRows()
		{
			List<CCFollower> list = new List<CCFollower>();
			foreach (Tuple<string, CheckBox, TextBox, CheckBox> r in followerRows)
			{
				double m;
				string txt = (r.Item3.Text ?? "1").Replace(',', '.');
				if (!double.TryParse(txt, NumberStyles.Float, CultureInfo.InvariantCulture, out m) || m <= 0) m = 1;
				list.Add(new CCFollower { AccountName = r.Item1, Multiplier = m, Enabled = r.Item2.IsChecked == true, Inverse = r.Item4.IsChecked == true });
			}
			return list;
		}

		private void StartStop()
		{
			if (copier.Running)
			{
				copier.Stop();
				SetEditable(true);
				return;
			}

			string master = masterBox.SelectedItem as string;
			List<CCFollower> followers = ReadFollowerRows();
			List<CCFollower> active = followers.Where(f => f.Enabled).ToList();
			if (master == null || active.Count == 0)
			{
				MessageBox.Show("Elige la cuenta maestra y al menos una seguidora.", "Copiador");
				return;
			}

			string resumen = string.Join("\n", active.Select(f => string.Format(CultureInfo.InvariantCulture, "  {0}  x{1}{2}{3}",
				f.AccountName, f.Multiplier, f.Inverse ? "  INVERSO" : "", IsSim(f.AccountName) ? "" : "  <-- CUENTA REAL")));
			if (MessageBox.Show("Maestra: " + master + "\nSeguidoras:\n" + resumen +
					"\n\nCada operacion de la maestra se copiara a mercado. Iniciar?",
					"Iniciar copiador", MessageBoxButton.YesNo,
					active.Any(f => !IsSim(f.AccountName)) ? MessageBoxImage.Warning : MessageBoxImage.Question) != MessageBoxResult.Yes)
				return;

			try
			{
				CCCopier.SaveConfig(master, followers);
				copier.Start(master, followers);
				SetEditable(false);
			}
			catch (Exception ex) { MessageBox.Show(ex.Message, "Copiador"); }
		}

		private static bool IsSim(string name)
		{
			return name.StartsWith("Sim", StringComparison.OrdinalIgnoreCase)
				|| name.StartsWith("Playback", StringComparison.OrdinalIgnoreCase)
				|| name.StartsWith("Backtest", StringComparison.OrdinalIgnoreCase);
		}

		private void SetEditable(bool editable)
		{
			masterBox.IsEnabled      = editable;
			followersPanel.IsEnabled = editable;
			startStopBtn.Content     = editable ? "Iniciar copiador" : "Detener copiador";
			startStopBtn.Background  = editable ? Brushes.DarkGreen : Brushes.DarkOrange;
			RefreshStrategies();
		}

		private void AddLog(string msg)
		{
			logBox.Items.Insert(0, msg);
			while (logBox.Items.Count > 300) logBox.Items.RemoveAt(logBox.Items.Count - 1);
		}
	}
}
