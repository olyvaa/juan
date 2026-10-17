# Contexto del proyecto Tandem

Lee README.md antes de cambiar el proyecto. Usa la copia existente del repositorio.

## Producto

Interfaz en español, con diseño oscuro, para portfolio y gestión de operaciones por cuentas y grupos. NinjaTrader 8 en un único ordenador Windows será el destino del futuro puente C#. El usuario utiliza Lucid y quiere configurar perfiles por capital y fase (examen/fondeada), contratos y multiplicadores, entradas, salidas, stops, objetivos y breakeven individual o múltiple.

## Estado real

Esta versión es un prototipo frontend. NO tiene conexión a NinjaTrader, cotizaciones, ejecución real ni backend. Conservar las etiquetas demo. No afirmar que un clic envía una orden real. No pedir ni guardar contraseñas de trading. No implementar acceso a cuentas reales sin un alcance explícito y pruebas en simulación.

Los grupos se identifican por ID; dos grupos pueden tener los mismos miembros. No inferir el grupo seleccionado comparando sus miembros. Los multiplicadores de contratos se configuran por cuenta. Evitar órdenes duplicadas por combinar entradas manuales y copia automática en una futura implementación.

## Desarrollo

React, TypeScript, Vite, CSS y lucide-react. No hay suite automatizada persistida. La compilación verificada es `npm run build`. Ejecutar ESLint sobre los archivos cambiados y comprobar funcionalmente la interacción afectada; no declarar comprobaciones no ejecutadas. Hay importaciones sin usar heredadas en la antigua tienda y una advertencia de Fast Refresh por la exportación compartida de AccountGroups.tsx.

Las preferencias usan localStorage; las posiciones simuladas están en memoria y se conservan al navegar gracias al montaje persistente de TradingPanel. No borrar datos del usuario durante cambios o pruebas.

## Publicación

Vercel: https://juan-one-flax.vercel.app. El despliegue original fue manual. La conexión automática con GitHub aún no está configurada. No incluir archivos .vercel, .env, tokens ni credenciales en Git. La autenticación de este entorno no estará disponible automáticamente en el ordenador del usuario.
