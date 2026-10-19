# Contexto del proyecto Tandem

Lee README.md antes de cambiar el proyecto. Usa la copia existente del repositorio.

## Producto

Interfaz en español, con diseño oscuro, para portfolio y gestión de operaciones por cuentas y grupos. NinjaTrader 8 en un único ordenador Windows será el destino del futuro puente C#. El usuario utiliza Lucid y quiere configurar perfiles por capital y fase (examen/fondeada), contratos y multiplicadores, entradas, salidas, stops, objetivos y breakeven individual o múltiple.

## Estado real

Esta versión es un prototipo frontend. NO tiene conexión a NinjaTrader, cotizaciones, ejecución real ni backend. Conservar las etiquetas demo. No afirmar que un clic envía una orden real. No pedir ni guardar contraseñas de trading. No implementar acceso a cuentas reales sin un alcance explícito y pruebas en simulación.

Los grupos se identifican por ID; dos grupos pueden tener los mismos miembros. No inferir el grupo seleccionado comparando sus miembros. Los multiplicadores de contratos se configuran por cuenta. Evitar órdenes duplicadas por combinar entradas manuales y copia automática en una futura implementación.

## Código NinjaTrader (`ninjatrader/`)

C# 7.3 para NinjaTrader 8: estrategias en `ninjatrader/Strategies` y AddOn (panel + copiador) en `ninjatrader/AddOns`. No se puede compilar aquí contra NinjaTrader real; se verifica contra una imitación de la API y el usuario compila con F5. No declarar que funciona en NinjaTrader sin su confirmación. El copiador copia la posición neta con órdenes a mercado y no copia stops pendientes: mantener esa advertencia. Tandem (`index.html`, `src/App.tsx`…) sigue siendo demo. El panel del bot (`panel.html`, `src/panel/`) sí se conecta al AddOn mediante el puente `CCBridge` en `http://localhost:8793` (solo localhost, cabecera `X-CC-Panel` obligatoria en los POST). Sin puente, el panel muestra datos de ejemplo con la etiqueta de modo demo y no envía nada: mantener ese comportamiento. La cuenta maestra por defecto del copiador debe ser simulada.

## Juanitos Funding (`src/funding/`)

Prop firm 100 % simulada dentro del panel: compra ficticia de cuentas con reglas de LucidFlex, grupos y bot sobre el precio del MNQ. Fuente por defecto: tiempo real de NinjaTrader (`CCMarketFeed` vía `/api/market`); alternativas: Yahoo con retraso vía proxy de Vite o mercado simulado. Las cuentas reales de NinjaTrader solo se muestran (PnL de NinjaTrader); el bot simulado nunca opera en ellas. Mantener la etiqueta "Juanitos Funding · simulado", no usar logos ni marca de Lucid y no presentar nada como dinero o cuentas reales. Las reglas del motor tienen pruebas aisladas (ver historial); al cambiar `engine.ts`, comprobar que el saldo menos el capital coincide con la suma de las operaciones.

## Desarrollo

React, TypeScript, Vite, CSS y lucide-react. No hay suite automatizada persistida. La compilación verificada es `npm run build`. Ejecutar ESLint sobre los archivos cambiados y comprobar funcionalmente la interacción afectada; no declarar comprobaciones no ejecutadas. Hay importaciones sin usar heredadas en la antigua tienda y una advertencia de Fast Refresh por la exportación compartida de AccountGroups.tsx.

Las preferencias usan localStorage; las posiciones simuladas están en memoria y se conservan al navegar gracias al montaje persistente de TradingPanel. No borrar datos del usuario durante cambios o pruebas.

## Publicación

Vercel: https://juan-one-flax.vercel.app. El despliegue original fue manual. La conexión automática con GitHub aún no está configurada. No incluir archivos .vercel, .env, tokens ni credenciales en Git. La autenticación de este entorno no estará disponible automáticamente en el ordenador del usuario.
