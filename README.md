# HoloNFC · Panel de Control v0.4

Sistema de experiencias holográficas para eventos corporativos.

## Requisitos

- Node.js 18+
- Python 3.9+ (para el procesador de video con IA)
- ffmpeg en el PATH del sistema
- ACR122U (opcional — el modo simulación funciona sin lector)

## Instalación

```bash
# 1. Instalar dependencias Node
npm install

# 2. Instalar dependencias Python (para procesador de video)
pip install opencv-python mediapipe numpy

# 3. Iniciar en modo desarrollo (frontend + backend)
npm run dev
```

El panel admin abre en: http://localhost:5173  
El backend API corre en: http://localhost:3000

## Proyector holográfico

1. Abrir http://localhost:3000/projector.html en el browser de la segunda pantalla (HDMI)
2. Presionar F11 para pantalla completa
3. Clic en la pantalla para entrar en fullscreen automático

O bien, usar el botón **"Abrir holograma ↗"** desde el Dashboard.

## Uso básico

### Antes del evento
1. **Invitados** → Importar CSV o agregar uno por uno
2. **Asignar pulseras** → Activar modo escaneo, acercar pulsera → avanza automático
3. **Procesador de video** → Subir selfies, elegir croma negro, procesar
4. **Configuración** → Asignar HDMI, elegir video idle, guardar

### Durante el evento
1. Dashboard muestra check-ins en tiempo real
2. Al acercar pulsera al ACR122U → proyector muestra el holograma del invitado

## Formato CSV para importar invitados

```csv
nombre,email,mesa,uid,video,mensaje
Carolina Sánchez,csanchez@empresa.com,07,,carolina.mp4,Bienvenida Caro
Roberto Aldana,r.aldana@empresa.com,12,A412FF03,roberto.mp4,
```

Columnas opcionales: uid, video, mensaje

## Producción

```bash
npm run build   # compila el frontend en /dist
npm run server  # sirve frontend + API en puerto 3000
```
