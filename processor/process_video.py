"""
HoloNFC · Video Processor
Removes background with MediaPipe ImageSegmenter (confidence mask) and
replaces it with a solid color for hologram projection.

Improvements over v1:
  - Running mode VIDEO (temporal smoothing → stable mask between frames)
  - Configurable feathering (gaussian blur on mask) for smoother edges
  - Morphological cleanup of the mask (noise removal)
  - Optional --holo-boost (brightness/contrast for hologram visibility)
  - METADATA emission for the backend to persist (duration / w / h / size)
  - Progress reporting throttled to every 2 % (less noise on stdout)
  - Audio loudness normalization (loudnorm)

Usage:
  python process_video.py --input raw.mp4 --output out.mp4 \
    --bg_color #000000 --feather 5 --model selfie [--holo-boost]
"""

import argparse
import sys
import os
import subprocess
import tempfile
import urllib.request

MODELS = {
    'selfie': {
        'url':  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite',
        'file': 'selfie_segmenter.tflite',
    },
    'selfie_landscape': {
        'url':  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/1/selfie_segmenter_landscape.tflite',
        'file': 'selfie_segmenter_landscape.tflite',
    },
}

MODELS_DIR = os.path.join(os.path.dirname(__file__), 'models')


def ensure_model(model_key):
    cfg = MODELS.get(model_key)
    if not cfg:
        print(f"ERROR: modelo desconocido: {model_key}", file=sys.stderr)
        sys.exit(1)
    path = os.path.join(MODELS_DIR, cfg['file'])
    if os.path.exists(path):
        return path
    os.makedirs(MODELS_DIR, exist_ok=True)
    print(f"[INFO] Descargando modelo {model_key}…", file=sys.stderr)
    try:
        urllib.request.urlretrieve(cfg['url'], path)
    except Exception as e:
        print(f"ERROR: No se pudo descargar el modelo: {e}", file=sys.stderr)
        sys.exit(1)
    return path


def hex_to_bgr(hex_color):
    h = hex_color.lstrip('#')
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return (b, g, r)


def process(args):
    try:
        import cv2
        import numpy as np
        import mediapipe as mp
        from mediapipe.tasks import python as mp_python
        from mediapipe.tasks.python import vision as mp_vision
    except ImportError as e:
        print(f"ERROR: Dependencia faltante: {e}", file=sys.stderr)
        print("Instalar con: pip install opencv-python mediapipe numpy", file=sys.stderr)
        sys.exit(1)

    model_path = ensure_model(args.model)

    cap = cv2.VideoCapture(args.input)
    if not cap.isOpened():
        print(f"ERROR: No se puede abrir: {args.input}", file=sys.stderr)
        sys.exit(1)

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1
    fps    = cap.get(cv2.CAP_PROP_FPS) or 24
    width  = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    bg_bgr = hex_to_bgr(args.bg_color)

    tmp_video = tempfile.mktemp(suffix='_holonfc.mp4')
    fourcc    = cv2.VideoWriter_fourcc(*'mp4v')
    writer    = cv2.VideoWriter(tmp_video, fourcc, fps, (width, height))
    if not writer.isOpened():
        print("ERROR: No se puede crear archivo temporal de video", file=sys.stderr)
        cap.release()
        sys.exit(1)

    # ── MediaPipe ImageSegmenter — VIDEO mode for temporal smoothing ─────────
    base_options = mp_python.BaseOptions(model_asset_path=model_path)
    options = mp_vision.ImageSegmenterOptions(
        base_options=base_options,
        running_mode=mp_vision.RunningMode.VIDEO,
        output_confidence_masks=True,
    )
    segmenter = mp_vision.ImageSegmenter.create_from_options(options)

    bg_frame_f = np.full((height, width, 3), bg_bgr, dtype=np.float32)

    # Morphological kernel for mask cleanup
    kernel_clean = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))

    feather    = max(0, int(args.feather))
    blur_ksize = feather * 2 + 1 if feather > 0 else 0   # must be odd

    # Holo boost LUT (precomputed once)
    holo_lut = None
    if args.holo_boost:
        lut = np.arange(256, dtype=np.float32)
        lut = (lut - 128.0) * 1.25 + 128.0 + 15.0   # +contrast, +brightness
        holo_lut = np.clip(lut, 0, 255).astype(np.uint8)

    last_progress = -1
    frame_idx = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        rgb      = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

        # VIDEO mode needs monotonically increasing timestamps in ms
        ts_ms  = int(frame_idx * (1000.0 / fps))
        result = segmenter.segment_for_video(mp_image, ts_ms)

        # Confidence mask: shape (H, W, 1) float32 in [0, 1]
        conf = result.confidence_masks[0].numpy_view().astype(np.float32)
        mask = conf[..., 0] if conf.ndim == 3 else conf

        # Morphological cleanup — remove small noise + close holes
        binary = (mask > 0.5).astype(np.uint8)
        binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN,  kernel_clean)
        binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel_clean)
        soft   = mask * binary.astype(np.float32)

        # Feathering — gaussian blur on the soft mask
        if blur_ksize > 0:
            soft = cv2.GaussianBlur(soft, (blur_ksize, blur_ksize), 0)

        alpha = np.clip(soft, 0.0, 1.0)[..., np.newaxis]

        # Optional holographic boost on the foreground
        if holo_lut is not None:
            frame_f = cv2.LUT(frame, holo_lut).astype(np.float32)
        else:
            frame_f = frame.astype(np.float32)

        blended = (frame_f * alpha + bg_frame_f * (1.0 - alpha)).astype(np.uint8)
        writer.write(blended)

        frame_idx += 1
        pct = int(frame_idx / total_frames * 90)
        # Throttle: only every 2% (plus first / last tick)
        if pct != last_progress and (pct % 2 == 0 or frame_idx == 1 or frame_idx == total_frames):
            print(f"PROGRESS:{pct}", flush=True)
            last_progress = pct

    cap.release()
    writer.release()
    segmenter.close()

    # ── Mux audio from original via ffmpeg (with loudness normalization) ────
    print("PROGRESS:93", flush=True)
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)

    r = subprocess.run([
        'ffmpeg', '-y',
        '-i', tmp_video,
        '-i', args.input,
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
        '-c:a', 'aac', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
        '-map', '0:v:0', '-map', '1:a:0?',
        '-shortest',
        args.output,
    ], capture_output=True)

    if r.returncode != 0:
        # Probably no audio in source — fallback to video-only
        r2 = subprocess.run([
            'ffmpeg', '-y',
            '-i', tmp_video,
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
            args.output,
        ], capture_output=True)
        if r2.returncode != 0:
            print(f"ERROR ffmpeg: {r2.stderr.decode()}", file=sys.stderr)
            if os.path.exists(tmp_video):
                os.unlink(tmp_video)
            sys.exit(1)

    if os.path.exists(tmp_video):
        os.unlink(tmp_video)

    print("PROGRESS:100", flush=True)

    # ── Emit metadata for the backend ───────────────────────────────────────
    duration = total_frames / fps if fps > 0 else 0
    try:
        size = os.path.getsize(args.output)
    except OSError:
        size = 0
    print(f"METADATA:duration={duration:.2f};width={width};height={height};size={size}", flush=True)
    print(f"[INFO] Video procesado: {args.output}", file=sys.stderr)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--input',      required=True)
    parser.add_argument('--output',     required=True)
    parser.add_argument('--bg_color',   default='#000000')
    parser.add_argument('--feather',    type=int, default=5, help='Edge feathering in pixels (0-15)')
    parser.add_argument('--model',      default='selfie', choices=list(MODELS.keys()))
    parser.add_argument('--holo-boost', action='store_true', help='Brightness/contrast boost for hologram projection')
    args = parser.parse_args()
    process(args)
