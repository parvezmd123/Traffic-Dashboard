# ============================================================
# Real-Time Traffic Intelligence — Google Colab Backend
# YOLOv8n Inference + WebSocket Data Streaming
# ============================================================
# Cell 1: Install dependencies
# !pip install ultralytics flask flask-socketio flask-cors pyngrok yt-dlp opencv-python-headless

# Cell 2: Imports & Setup
import cv2
import time
import base64
import threading
import json
import numpy as np
from datetime import datetime
from collections import defaultdict

from ultralytics import YOLO
from flask import Flask
from flask_socketio import SocketIO
from flask_cors import CORS
from pyngrok import ngrok

# ─── Config ───────────────────────────────────────────────
VIDEO_SOURCE = "traffic.mp4"   # Replace with YouTube URL or local path
TARGET_CLASSES = {
    2:  "Car",
    3:  "Motorcycle",
    5:  "Bus",
    7:  "Truck",
    0:  "Person",
}
CLASS_COLORS = {
    "Car":        (59,  130, 246),   # blue
    "Motorcycle": (168, 85,  247),   # purple
    "Bus":        (234, 179, 8),     # yellow
    "Truck":      (239, 68,  68),    # red
    "Person":     (34,  197, 94),    # green
}
FRAME_WIDTH   = 960
FRAME_HEIGHT  = 540
STREAM_FPS    = 15     # target FPS for streamed frames
CONFIDENCE    = 0.35

# ─── Flask + SocketIO App ─────────────────────────────────
app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading",
                    max_http_buffer_size=10 * 1024 * 1024)

# ─── Shared State ─────────────────────────────────────────
state = {
    "counts":     defaultdict(int),
    "history":    [],          # [{time, total, ...per-class}]
    "peak":       0,
    "events":     [],
    "frame_b64":  None,
    "running":    False,
}
state_lock = threading.Lock()

# ─��─ Load Model ───────────────────────────────────────────
print("Loading YOLOv8n …")
model = YOLO("yolov8n.pt")
model.to("cuda")
print("Model loaded on CUDA ✓")

# ─── Draw Bounding Boxes ──────────────────────────────────
def draw_boxes(frame, results):
    for box in results[0].boxes:
        cls_id = int(box.cls[0])
        if cls_id not in TARGET_CLASSES:
            continue
        conf  = float(box.conf[0])
        if conf < CONFIDENCE:
            continue
        label  = TARGET_CLASSES[cls_id]
        color  = CLASS_COLORS.get(label, (255, 255, 255))
        x1, y1, x2, y2 = map(int, box.xyxy[0])

        # Draw box
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

        # Label pill
        text     = f"{label} {conf:.0%}"
        (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
        cv2.rectangle(frame, (x1, y1 - th - 8), (x1 + tw + 6, y1), color, -1)
        cv2.putText(frame, text, (x1 + 3, y1 - 4),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
    return frame

# ─── Inference Loop ──────���────────────────────────────────
def inference_loop():
    cap = cv2.VideoCapture(VIDEO_SOURCE)
    if not cap.isOpened():
        print(f"ERROR: Cannot open video source: {VIDEO_SOURCE}")
        return

    frame_interval = 1.0 / STREAM_FPS
    last_emit = 0

    with state_lock:
        state["running"] = True

    print("Inference loop started …")
    while True:
        ret, frame = cap.read()
        if not ret:
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)   # loop video
            continue

        frame = cv2.resize(frame, (FRAME_WIDTH, FRAME_HEIGHT))

        # Run inference
        results = model(frame, verbose=False, device="cuda")

        # Count detections
        counts = defaultdict(int)
        for box in results[0].boxes:
            cls_id = int(box.cls[0])
            conf   = float(box.conf[0])
            if cls_id in TARGET_CLASSES and conf >= CONFIDENCE:
                counts[TARGET_CLASSES[cls_id]] += 1

        total = sum(counts.values())
        now   = datetime.now().strftime("%H:%M:%S")

        # Build events for new large vehicles
        new_events = []
        for cls, cnt in counts.items():
            if cls in ("Bus", "Truck") and cnt > 0:
                new_events.append({
                    "time":    now,
                    "message": f"{cnt} {cls}{'s' if cnt > 1 else ''} detected",
                    "type":    cls.lower(),
                })

        with state_lock:
            state["counts"] = dict(counts)
            state["events"] = (new_events + state["events"])[:100]
            state["peak"]   = max(state["peak"], total)

            tick = {
                "time":  now,
                "total": total,
                **dict(counts),
            }
            state["history"] = (state["history"] + [tick])[-120:]   # 2 min rolling window

        # Annotate & encode frame
        annotated = draw_boxes(frame.copy(), results)
        _, buf = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 70])
        b64 = base64.b64encode(buf).decode("utf-8")

        with state_lock:
            state["frame_b64"] = b64

        # Emit at target FPS
        now_t = time.time()
        if now_t - last_emit >= frame_interval:
            last_emit = now_t
            payload = {
                "frame":   b64,
                "counts":  dict(counts),
                "total":   total,
                "peak":    state["peak"],
                "history": state["history"][-60:],
                "events":  state["events"][:20],
                "ts":      now,
            }
            socketio.emit("traffic_data", payload)

    cap.release()

# ─── SocketIO Events ──────────────────────────────────────
@socketio.on("connect")
def on_connect():
    print("Frontend connected ✓")
    with state_lock:
        if not state["running"]:
            t = threading.Thread(target=inference_loop, daemon=True)
            t.start()

@socketio.on("disconnect")
def on_disconnect():
    print("Frontend disconnected")

# ─── Start Server ─────────────────────────────────────────
def start_server():
    # Open ngrok tunnel so the React frontend (localhost) can reach Colab
    ngrok.set_auth_token("YOUR_NGROK_TOKEN")          # ← paste your token here
    tunnel = ngrok.connect(5000, "http")
    public_url = tunnel.public_url.replace("http://", "https://")
    print(f"\n{'='*55}")
    print(f"  Ngrok tunnel:  {public_url}")
    print(f"  Paste this URL into the React dashboard ↑")
    print(f"{'='*55}\n")
    socketio.run(app, host="0.0.0.0", port=5000)

if __name__ == "__main__":
    start_server()
