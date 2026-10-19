# Tandem

Prototipo de dashboard y terminal de operaciones para un futuro copiador de cuentas de NinjaTrader 8. React 18, TypeScript y Vite 5.

**Las cuentas, balances y ejecuciones son simulados. No existe aún un puente con NinjaTrader.** No introducir credenciales de trading en la aplicación.

## Desarrollo en Windows

Instala Git, Node.js LTS y Claude Code siguiendo sus instrucciones oficiales. Después, en una terminal:

```bat
git clone https://github.com/olyvaa/juan.git tandem
cd tandem
npm ci
npm run dev
```

Abre la dirección indicada por Vite. Mantén esta terminal abierta. Para usar Claude Code, abre otra terminal en la carpeta `tandem` y ejecuta `claude`.

## Funciones actuales

- Portfolio con balance, distribución y curva ilustrativa.
- Perfiles de cuentas con capital, fase, contratos y multiplicadores.
- Pestaña Grupos para crear, editar y eliminar grupos de cuentas.
- Selector de grupo en Copiador, confirmación de entradas simuladas, modificación de stop/objetivo, breakeven y cierre de posiciones seleccionadas.
- Perfiles y grupos guardados en localStorage de cada navegador. No se sincronizan entre dispositivos. Las posiciones simuladas solo duran la sesión de la aplicación.

## Comandos

- `npm ci`: instalar usando el archivo de bloqueo.
- `npm run dev`: servidor local.
- `npm run panel`: servidor local abriendo el panel del bot.
- `npm run build`: compilar en `dist`.
- `npm run preview`: probar la compilación localmente.
- `npm run lint`: ESLint; existen incidencias heredadas en archivos de la antigua tienda.

El entorno de desarrollo inicial se validó con Node 24.19.0 y npm 11.9.0.

## Vercel

Sitio desplegado: https://juan-one-flax.vercel.app

`vercel.json` configura Vite, `npm ci`, `npm run build` y salida `dist`. El despliegue inicial fue manual; la integración automática con GitHub no está configurada. Subir commits no garantiza un despliegue nuevo. La protección de acceso de Vercel puede exigir iniciar sesión.

## Panel del bot (localhost)

`panel.html` es el panel de control del bot, con estilo Apple, tema claro/oscuro y versión para móvil.
Tiene cinco secciones: Resumen, Estrategias, Copiador, Cuentas y Resultados.

```bat
npm ci
npm run panel
```

Se abre en `http://localhost:5173/panel.html`. Si NinjaTrader está abierto con el AddOn `CCCommandCenter`, el panel se
conecta solo a `http://localhost:8793` y muestra datos reales: estrategias activas, pausar, reanudar, cerrar,
kill switch, copiador y cuentas. Si no, muestra **datos de ejemplo** con la etiqueta *Modo demo*, y los botones no envían nada.

### Juanitos Funding (prop firm simulada)

Sección del panel que funciona **sin NinjaTrader**:

- **Tienda:** compra ficticia de cuentas Flex 25K/50K/100K/150K con las reglas publicadas de LucidFlex: objetivo,
  pérdida máxima con trailing al cierre del día, sin límite diario, consistencia del 50 % y máximo de micros.
- **Mis cuentas:** saldo, progreso al objetivo, margen hasta la pérdida máxima y operaciones. Estados: evaluación,
  superada, fondeada y quemada.
- **Mis cuentas** también muestra las **cuentas de examen reales** de NinjaTrader (las no Sim), con saldo, PnL del día,
  abierto y posiciones que vienen de NinjaTrader en directo. El progreso al objetivo y el suelo de pérdida los calcula el
  panel con las reglas del plan que elijas.
- **Grupos:** estrategia (GoatPro, GYR, RangOpenNY, JetF1) + cuentas, con una tabla de monitorización por cuenta: estado,
  posición, balance, PnL del día, último PnL, abierto y casillas editables de CT, PDLL (pérdida del día), PDPT
  (objetivo del día), TP $ y SL $, más un interruptor OPS. Activar / Detener / Editar / Eliminar. Con el grupo activo, la
  edición se bloquea. Una cuenta solo puede estar en un grupo activo. El grupo opera con **todas las cuentas a la vez** o
  **una a una** (o 2/3 a la vez): en ese modo, cuando una cuenta supera o se quema, entra la siguiente del orden (flechas
  en la tabla). CT son contratos MNQ (10 CT = 1 lote de NQ). Un SL igual o mayor que la pérdida máxima sale en rojo.
- **Limpiar:** reiniciar una cuenta o todas (saldo inicial, sin historial) y borrar todo Juanitos Funding.
- **Mercado:** widget oficial de TradingView con `CME_MINI:MNQ1!`, solo para ver el precio (el bot no puede leerlo; en TradingView gratuito
  va con unos 10 min de retraso), y la fuente de precio del bot. Hay cuatro fuentes:
  *Tiempo real (NinjaTrader)*, por defecto, con velas de 1 min de `MNQ 12-26` a través del puente (`/api/market`);
  *MNQ real (Yahoo)*, con unos 10 min de retraso y a través del proxy `/yahoo` de Vite;
  *Simulado*, y *Simulado rápido* (60×).

Todo es simulado y se guarda en el navegador (`localStorage`, clave `jf-state-v1`). Solo simula mientras la pestaña
está abierta. Al reabrir, en las velas que se ha perdido solo revisa SL/TP de lo abierto (sin entradas nuevas), y anula
las posiciones abiertas con otra fuente de precio o con un precio fuera de lugar; con el simulador, el mercado se regenera y las
posiciones abiertas se anulan. Supuestos: 1 $ de comisión por micro, 1 tick de deslizamiento, SL antes que TP si los
dos se tocan en la misma vela, cierre a las 16:55 NY y el trailing se bloquea en el saldo inicial.

- `src/funding/plans.ts`: planes, reglas y hora de Nueva York.
- `src/funding/market.ts`: fuentes de precio y velas.
- `src/funding/strategies.ts`: señales de las 4 estrategias (traducidas de `ninjatrader/Strategies`).
- `src/funding/engine.ts`: cuentas, reglas, grupos y ejecución simulada.
- `src/funding/FundingViews.tsx`: vistas (tienda, cuentas, monitor de grupos y mercado).

### Archivos del panel

- `src/panel/Panel.tsx`: vistas y lógica del panel.
- `src/panel/api.ts`: conexión con el puente y datos de demo.
- `src/panel/catalog.ts`: ficha y resultados de cada estrategia.
- `src/panel/panel.css`: estilos.

## NinjaTrader 8 (código real)

La carpeta [`ninjatrader/`](ninjatrader/README.md) contiene código C# que sí se ejecuta dentro de NinjaTrader 8:
las estrategias CCGoatPro, CCGYR, CCRangOpenNY y CCJetF1, un laboratorio de optimización y el AddOn
**Command Pro Clone**, con un panel de estrategias (pausar, cerrar, kill switch) y un copiador de cuentas
maestra → seguidoras. Es independiente de la web; la web sigue sin conexión con NinjaTrader.

## Organización

- `src/App.tsx`: navegación, portfolio y perfiles.
- `src/AccountGroups.tsx`: administración y persistencia de grupos.
- `src/TradingPanel.tsx`: terminal simulada y selector de grupos.
- `src/index.css`: estilos y adaptación a móvil.
- `ninjatrader/`: estrategias y AddOn C# para NinjaTrader 8 (ver su README).

Los archivos de componentes, contexto y datos de la antigua tienda siguen presentes, pero el dashboard actual no los usa.
