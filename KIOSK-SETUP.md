# HoloNFC · Setup en modo kiosco (Windows)

Esta guía deja la PC del evento configurada para que la hostess **encienda la
máquina y todo arranque solo** — sin tocar terminales ni navegadores.

## Requisitos previos

1. Windows 10 o 11
2. **Node.js 18+** instalado y en el PATH (`node --version` debe responder)
3. **Google Chrome** instalado en una de las ubicaciones estándar
4. **Python 3.10+** instalado y en el PATH (`python --version`)
5. **FFmpeg** instalado y en el PATH (`ffmpeg -version`)
6. **Drivers ACS Unified Driver** para el lector ACR122U
7. Dependencias del proyecto instaladas:
   ```
   cd "C:\Users\Usuario\Desktop\Holo v2"
   npm install
   pip install opencv-python mediapipe numpy
   ```

## Build de producción (opcional pero recomendado)

En lugar de `npm run dev`, para el evento conviene servir la versión
compilada (más rápida, menos consumo):

```
cd "C:\Users\Usuario\Desktop\Holo v2"
npm run build
```

Esto genera `dist/` que el servidor Express sirve automáticamente.

## Arranque automático al encender la PC

1. Cliquear con botón derecho en `start-holonfc.bat` → **Crear acceso directo**
2. Apretar `Win + R`, escribir `shell:startup` y Enter — se abre la carpeta de Inicio
3. **Mover el acceso directo** ahí
4. Reiniciar la PC para verificar

Al boot Windows va a:
- Arrancar el servidor (ventana minimizada llamada "HoloNFC server")
- Esperar a que el backend responda en `localhost:3000`
- Abrir Chrome kiosko en `/projector.html` → la pantalla del holograma
- Abrir Chrome maximizado en `/` → el admin para la hostess

## Cómo cerrar todo

Doble click en `stop-holonfc.bat` (mata el servidor + cierra ambas ventanas
de Chrome). O simplemente apagar la PC.

## Posicionar el proyector en la pantalla del holograma

Si tenés monitor dual:

**Opción rápida (manual):** dejar que arranque, mover la ventana del
proyector con `Win + Shift + Flecha derecha`, después `F11` si hace falta.

**Opción automática:** editar `start-holonfc.bat`, en la línea del
proyector cambiar:
```
--kiosk
```
por:
```
--window-position=1920,0 --window-size=1920,1080
```
(reemplazar `1920,0` con la posición X,Y de la segunda pantalla)

## Recovery

- Si Chrome del proyector se cierra → el admin muestra **banner rojo** y se
  envía un comando de RELOAD automáticamente a los proyectores conectados
- Si el servidor crashea → la pantalla del operador muestra error de
  conexión; volver a doble-clickear `start-holonfc.bat`
- Si la PC se reinicia inesperadamente → al boot, todo arranca solo otra vez

## Backups automáticos

El servidor hace snapshot de la DB cada 5 minutos en
`data/backups/holonfc-{timestamp}.db`. Mantiene los últimos 24 (≈2 hs de
historia). Para restaurar:

1. Parar el sistema (`stop-holonfc.bat`)
2. Renombrar el backup deseado a `data/holonfc.db`
3. Volver a iniciar

## Logs del servidor

Cada día queda un archivo en `data/logs/server-YYYY-MM-DD.log`. Se conservan
los últimos 14 días.
