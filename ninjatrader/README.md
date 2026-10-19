# Command Pro Clone para NinjaTrader 8

Este es el código C# que **sí se ejecuta dentro de NinjaTrader 8**: cuatro estrategias, un laboratorio de optimización,
un panel de control y un copiador de cuentas. Es independiente del prototipo web de Tandem (la carpeta `src/`),
que sigue siendo una demo sin conexión.

> Prueba **siempre** primero con cuentas **Sim101** o **Playback**. Nada de esto está garantizado como rentable.

## Contenido

| Archivo | Qué es |
|---|---|
| `Strategies/CCBase.cs` | Base común: contratos C/V, TP$/SL$, límites diarios, sesión NY, BE / asegurar profit y conexión con el panel |
| `Strategies/CCGoatPro.cs` | **GoatPro**: retroceso a la EMA 95 con tendencia 20 > 95 > 200 (M5) ✅ validada |
| `Strategies/CCGYR.cs` | **GYR**: color de la vela cerrada (M5) |
| `Strategies/CCRangOpenNY.cs` | **RangOpenNY**: caja 09:00–09:30 NY y ruptura ±N ticks hasta las 10:00 (M5) |
| `Strategies/CCJetF1.cs` | **JetF1 (Coete)**: stop arriba y abajo a las 09:29:58 NY en OCO, con modo Fade y runner (M1) |
| `Strategies/CCJetF1Lab.cs` | Laboratorio de JetF1: prueba 3.600 combinaciones en un backtest (**no opera**) |
| `AddOns/CCHub.cs` | Registro compartido entre las estrategias y el panel |
| `AddOns/CCCommandCenter.cs` | Ventana **Command Pro Clone**: pestañas *Estrategias* y *Copiador* |
| `AddOns/CCBridge.cs` | Puente local `http://localhost:8793` para el panel web (`npm run panel`) |
| `AddOns/CCMarketFeed.cs` | Velas de 1 min en tiempo real de `MNQ 12-26` (horario ETH) para Juanitos Funding. Solo lectura |

## Instalación

**Lo más fácil:** cierra NinjaTrader y haz doble clic en **`instalar-en-ninjatrader.bat`** (en esta carpeta). Copia los
archivos a la carpeta correcta de NinjaTrader (también si Documentos está en OneDrive) y borra las copias duplicadas tipo
`CCMarketFeed (1).cs`. Después abre NinjaTrader, pulsa F5 en el NinjaScript Editor y reinicia NinjaTrader.

A mano:

1. Copia **`Strategies/*.cs`** en `Documents\NinjaTrader 8\bin\Custom\Strategies\`.
2. Copia **`AddOns/*.cs`** (4 archivos) en `Documents\NinjaTrader 8\bin\Custom\AddOns\`.
3. Abre el NinjaScript Editor y pulsa **F5**. Si sale algún error, manda una captura.
4. **Reinicia NinjaTrader** para que aparezca el menú del AddOn.
5. En el Control Center: **New → Command Pro Clone**.

## Pestaña *Estrategias*

Las estrategias se activan como siempre en NinjaTrader: en un gráfico, clic derecho → **Strategies** → elegir una →
**Account** → **Enabled**. En cuanto una CC* está activa en tiempo real, aparece en el panel con:

- cuenta, instrumento, posición, PnL del día y último evento;
- **Pausar / Reanudar**: una estrategia pausada no abre operaciones nuevas, pero lo que ya está abierto mantiene su SL/TP;
- **Cerrar**: cierra a mercado la posición de esa estrategia;
- **KILL SWITCH**: pausa todas las estrategias, cierra sus posiciones y, si el copiador está activo, cierra también lo copiado en las seguidoras.

| Estrategia | Gráfico | Horario |
|---|---|---|
| CCGoatPro | MNQ 12-26, **5 min** | ETH |
| CCGYR | MNQ 12-26, **5 min** | ETH |
| CCRangOpenNY | MNQ 12-26, **5 min** | **ETH (obligatorio)** |
| CCJetF1 | MNQ 12-26, **1 min** | **ETH (obligatorio)** |

## Pestaña *Copiador*

Copia la **posición neta** de una cuenta **maestra** a varias **seguidoras**. Cada vez que la maestra tiene una
ejecución (de una estrategia o manual), el copiador calcula la posición que debe tener cada seguidora y envía órdenes
a mercado por la diferencia. Así copia entradas, cierres parciales, salidas por SL/TP, cierres manuales y giros.

- **Multiplicador por cuenta:** contratos de la seguidora = maestra × multiplicador, redondeando hacia abajo y con un mínimo de 1.
- **Inverso:** la seguidora opera en sentido contrario.
- **Sincronizar ahora:** vuelve a igualar las posiciones, por ejemplo después de una desconexión.
- **Cerrar posiciones copiadas en seguidoras:** cierra a mercado lo que se ha copiado en esta sesión.
- La configuración se guarda en `Documents\NinjaTrader 8\CCCopier.txt`.
- Antes de arrancar pide confirmación y avisa de las cuentas que **no** son Sim.
- El copiador es el mismo desde la ventana de NinjaTrader y desde el panel web. **Cerrar la ventana no lo detiene**; se detiene con su botón o al cerrar NinjaTrader. Al detenerlo, las posiciones abiertas no se cierran solas.

**Limitaciones importantes:**

- **No copia los stops ni los targets pendientes.** La seguidora sale cuando sale la maestra. Si NinjaTrader se cierra,
  se cuelga o pierde la conexión, **las seguidoras quedan sin stop propio**.
- **No pongas la misma estrategia en la maestra y en las seguidoras**: se duplicarían las órdenes.
- Las órdenes a mercado pueden tener deslizamiento distinto en cada cuenta.

## Panel web

Con NinjaTrader abierto y el AddOn instalado, el puente `CCBridge` escucha en `http://localhost:8793`, **solo en este ordenador**.
El panel (`npm run panel` en la raíz del repo) se conecta solo. Por seguridad, solo acepta peticiones desde `localhost`, y las acciones
exigen la cabecera `X-CC-Panel`, así que otra página web abierta en el navegador no puede enviar órdenes. La pestaña *Estrategias*
de la ventana de NinjaTrader indica si el panel web está activo.

## Estrategia guardada: GoatPro (validada)

Configuración por defecto de `CCGoatPro`, que es la probada:

| Parámetro | Valor |
|---|---|
| Gráfico | MNQ 12-26 · 5 minutos · CME US Index Futures ETH |
| EMAs | rápida 20 · disparo 95 · lenta 200 · filtro de tendencia activado |
| Toque de mecha | compra 10 ticks · venta 9 ticks |
| Apertura mínima vs EMA / cuerpo mínimo | 1 tick / 1 tick |
| Velas de espera tras cierre | 1 |
| Sesión | 18:00 → 16:00 NY |
| Contratos | compra 20 · venta 16 |
| TP / SL | 1.500 $ / 2.000 $ por operación |

Resultados del Strategy Analyzer, 2026:

| Periodo | Neto | Largos | Cortos |
|---|---|---|---|
| Año completo, sin costes | +76.008 $ (PF 1,18 · 538 ops · 60,8 % acierto · DD −25.042 $) | +48.560 $ | +27.448 $ |
| Enero–junio | **+25.779 $** | +39.096 $ | −13.317 $ |
| Julio–octubre | **+26.060 $** | −6.522 $ | +32.582 $ |

Gana en los dos periodos y los parámetros no se optimizaron con estos datos. **Antes de operar en real**, ajusta el tamaño a tu cuenta:
el TP $ y el SL $ son para toda la posición, así que bájalos en la misma proporción que los contratos.
Por ejemplo, con 2 contratos: TP 150 $ / SL 200 $. Después pruébala 2–3 semanas en Sim101.

## JetF1: resultado del laboratorio

De 3.600 combinaciones (Ruptura/Fade × ticks × TP × SL), **ninguna** tuvo un profit factor por encima de 1,2 a la vez en
enero–junio y en julio–octubre. **No se recomienda operarla en real** con esta lógica.

## Comprobaciones hechas

- Todo el código compila contra una imitación de la API de NinjaTrader y de WPF (C# 7.3). La compilación real con F5 en NinjaTrader está pendiente de confirmar.
- La lógica del copiador se probó con cuentas simuladas que ejecutan al instante: entradas, parciales, giros, mínimo 1, multiplicadores, modo inverso y detener.
- El puente se ejecutó con cuentas y estrategias simuladas y se probó con el panel en Chromium: estado, pausar/reanudar, cerrar, kill switch, iniciar y detener el copiador, y el rechazo de peticiones sin cabecera o desde otros orígenes.
- El panel, el copiador y el puente **no** se han probado todavía dentro de NinjaTrader.
