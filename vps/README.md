# Bot 24 h en un VPS Windows

Con esto el bot sigue funcionando aunque apagues tu ordenador: NinjaTrader y el panel viven en un **ordenador Windows en
la nube (VPS)** que nunca se apaga, y tú lo miras desde el PC o el móvil con *Escritorio remoto*.

> Vercel no sirve para esto: solo publica páginas web, no puede tener NinjaTrader abierto ni dejar el bot funcionando.

## Por qué un VPS

- El precio viene de **NinjaTrader**, y NinjaTrader solo funciona en Windows.
- El bot de Juanitos Funding funciona **dentro de la ventana del panel**: si se cierra esa ventana o se apaga el ordenador, el bot se para.
- Al volver a abrirlo, no abre operaciones en las velas que se ha perdido: solo gestiona el SL y el TP de lo que ya estaba abierto.

## 1. Contratar el VPS

- **Windows Server 2019 o 2022**, con al menos **4 GB de RAM** (mejor 8 GB) y 2 núcleos.
- Mejor con el centro de datos en **Chicago o Nueva York**, cerca del CME.
- Hay proveedores pensados para trading con NinjaTrader, desde unos 30–60 $/mes. Compara precios; no te recomiendo ninguno en concreto.
- Te darán una **IP, un usuario y una contraseña**. Guárdalos tú: no los pegues en el chat ni los subas a GitHub.

**Antes de pagar, confirma con Lucid** que permiten operar desde un VPS y con bots o copiado entre cuentas, y revisa
si tu licencia de NinjaTrader te deja instalarlo en otro ordenador.

## 2. Entrar al VPS

- **Desde Windows:** abre *Conexión a Escritorio remoto* (`mstsc`), escribe la IP y entra con tu usuario.
- **Desde el móvil:** instala la app *Windows App* (antes *Remote Desktop*) de Microsoft.

## 3. Instalar dentro del VPS

1. **NinjaTrader 8**: instálalo, inicia sesión y añade tu conexión de Lucid (**LTTK7X97T4U**).
   En *Connections → Configure* marca **Connect on startup** para que se conecte sola al abrirse.
2. **Node.js LTS**: <https://nodejs.org>
3. **Git**: <https://git-scm.com>
4. Abre *Símbolo del sistema* y descarga el proyecto:
   ```
   cd %USERPROFILE%
   git clone -b ninjatrader-copiador https://github.com/olyvaa/juan.git
   ```
5. Cierra NinjaTrader y ejecuta `juan\ninjatrader\instalar-en-ninjatrader.bat`. Después abre NinjaTrader, pulsa **F5** en el NinjaScript Editor y reinicia NinjaTrader.
6. En NinjaTrader: **New → Command Pro Clone** (así arranca el puente del panel).
   Para que el puente arranque solo, deja esa ventana abierta y guarda el *workspace*: NinjaTrader la vuelve a abrir al iniciarse.
7. Ejecuta `juan\vps\iniciar-panel.bat`. Se abre el panel en una ventana de Edge.
8. Ejecuta **una vez** `juan\vps\arrancar-al-iniciar-windows.bat`, para que el panel se abra solo al iniciar sesión.

**Tus datos de Juanitos Funding** (cuentas, grupos, historial) se guardan en el navegador de cada ordenador, así que
en el VPS empiezas de cero: vuelve a crear las cuentas y los grupos allí.

## 4. Desconectarte sin parar el bot

- Cierra el Escritorio remoto con la **X** de la ventana. **No cierres sesión** ("Cerrar sesión" o "Sign out"): eso cierra NinjaTrader y el panel.
- `iniciar-panel.bat` abre Edge con los temporizadores sin frenar. Así el bot sigue revisando las velas aunque la ventana esté minimizada o no estés conectado.
- **Actualizaciones de Windows:** configura las horas activas o pausa las actualizaciones, para que no reinicie el VPS en mitad de la sesión.
- **Si el VPS se reinicia:** activa el inicio de sesión automático de Windows (`netplwiz`) o vuelve a entrar con Escritorio remoto. Al iniciar sesión se abren NinjaTrader (si lo pones en Inicio) y el panel.

## 5. Actualizar el bot en el VPS

```
cd %USERPROFILE%\juan
git pull
```

- Si han cambiado archivos de `ninjatrader\`: cierra NinjaTrader, ejecuta otra vez `instalar-en-ninjatrader.bat` y pulsa F5.
- Si solo ha cambiado el panel: recarga su ventana con F5.

## Seguridad

- El puente de NinjaTrader y el panel solo escuchan en `localhost` **dentro del VPS**: nadie de fuera puede verlos ni enviar órdenes. No abras los puertos 5173 ni 8793 en el firewall.
- Usa una **contraseña larga** para el usuario del VPS. Si el proveedor lo permite, limita el Escritorio remoto a tu IP.

## Siguiente paso: cuentas reales

Hoy el bot de grupos opera **cuentas simuladas** de Juanitos Funding con el precio real. Para operar las 10 cuentas de
verdad, hay que pasar el motor de grupos (rotación, CT/TP/SL por cuenta, PDLL/PDPT, horario) a NinjaTrader en C#,
para que envíe las órdenes con stop y objetivo en cada cuenta. Primero se probaría en 10 cuentas **Sim** de NinjaTrader.
