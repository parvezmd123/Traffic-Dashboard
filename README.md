# 🚦 TrafficIQ — Real-Time Traffic Intelligence Dashboard

A full-stack AI system that processes live video with **YOLOv8n** on a Colab T4 GPU and streams annotated frames + analytics to a dark-mode **React + Recharts** command-center dashboard.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│               Google Colab (T4 GPU)                     │
│                                                         │
│  Video Source (MP4 / YouTube)                           │
│        ↓                                                │
│  YOLOv8n (CUDA) ──► draw_boxes() ──► JPEG frame (b64)  │
│        ↓                                                │
│  Flask + Socket.IO ──► ngrok tunnel ──► public URL      │
└────────────────────────────┬────────────────────────────┘
                             │  WebSocket (socket.io)
                             ▼
┌─────────────────────────────────────────────────────────┐
│           React Frontend (localhost:3000)               │
│                                                         │
│  <img src="data:image/jpeg;base64,…" />  (video feed)  │
│  Recharts LineChart  (rolling trend)                    │
│  Recharts PieChart   (class distribution)              │
│  Custom SVG Gauge    (peak density)                     │
│  Recharts BarChart   (per-class bar)                    │
│  Scrolling Event Log                                    │
└─────────────────────────────────────────────────────────┘
```

---

## 1 — Colab Backend Setup

### Step-by-step

1. Open **`colab/TrafficIntelligence_Colab.ipynb`** in Google Colab.
2. **Runtime → Change runtime type → T4 GPU** ✓
3. Get a free ngrok token from https://dashboard.ngrok.com → paste in Cell 4.
4. Run all cells in order (Ctrl+F9).
5. Copy the printed `https://xxxx.ngrok-free.app` URL.

### What each cell does

| Cell | Purpose |
|------|---------|
| 1 | Install `ultralytics`, `flask-socketio`, `flask-cors`, `pyngrok`, `yt-dlp` |
| 2 | Verify CUDA GPU |
| 3 | Download sample traffic video via yt-dlp (or mount Drive) |
| 4 | Configuration (class list, FPS, confidence, ngrok token) |
| 5 | Flask + SocketIO server with `inference_loop()` threaded worker |
| 6 | Open ngrok tunnel, print public URL, start server |

### Data pipeline

```
cap.read() → cv2.resize(960×540) → YOLOv8n(cuda) → filter TARGET_CLASSES
    → count per class → annotate frame → encode JPEG b64
    → socketio.emit("traffic_data", payload) @ 15 fps
```

Payload schema:
```json
{
  "frame":   "<base64 JPEG string>",
  "counts":  { "Car": 4, "Bus": 1, "Truck": 2 },
  "total":   7,
  "peak":    12,
  "history": [{ "time": "14:05:02", "total": 7, "Car": 4 }, ...],
  "events":  [{ "time": "14:05:02", "message": "2 Trucks detected", "type": "truck" }],
  "ts":      "14:05:02"
}
```

---

## 2 — Frontend Setup

### Prerequisites
```bash
node >= 18
npm >= 9
```

### Install & run
```bash
cd frontend
npm install
npm start          # opens http://localhost:3000
```

### Connect to Colab
1. Click **⚙** (top-right) in the dashboard.
2. Paste your ngrok URL (e.g. `https://abc123.ngrok-free.app`).
3. Click **Connect** — the page reloads and auto-connects.

### Dashboard panels

| Panel | Description |
|-------|-------------|
| **Live Feed** | Annotated JPEG frames with bounding boxes rendered as `<img>` (no Canvas lag) |
| **Live Trend Line** | Recharts `LineChart` — per-class + total over rolling 60-tick window |
| **Class Distribution** | Recharts `PieChart` (doughnut) — real-time ratio |
| **Peak Density** | Custom SVG arc gauge + mini `BarChart` |
| **Event Feed** | Auto-scrolling log, newest entry at top, color-coded by vehicle type |
| **Stat Cards** | Per-class count with delta (▲/▼) from previous tick |

### Performance design decisions

- **`isAnimationActive={false}`** on all Recharts components — eliminates re-render flicker when data arrives at 15 fps.
- **Frame is plain `<img>` tag**, not Canvas — browser handles JPEG decode off-thread.
- **State batching** — all payload fields set in a single `useEffect` callback per socket event.
- **Rolling window** — history capped at 120 ticks server-side; client slices last 60 for display.

---

## 3 — Cloudflare Pages Deployment

```bash
# Build the React app
cd frontend
npm run build

# Deploy to Cloudflare Pages (requires wrangler CLI)
npx wrangler pages deploy build --project-name traffic-iq
```

Or drag-and-drop the `build/` folder at https://pages.cloudflare.com.

> **Note:** In production the frontend connects to your persistent ngrok URL.  
> For a permanent deployment, replace ngrok with a Cloud Run or Railway backend.

---

## 4 — Detected Classes

| COCO ID | Label | Dashboard Color |
|---------|-------|----------------|
| 0 | Person | 🟢 Green |
| 2 | Car | 🔵 Blue |
| 3 | Motorcycle | 🟣 Purple |
| 5 | Bus | 🟡 Yellow |
| 7 | Truck | 🔴 Red |

---

## 5 — Project Structure

```
traffic-dashboard/
├── colab/
│   ├── TrafficIntelligence_Colab.ipynb   ← Submit this
│   └── traffic_inference.py              ← Standalone script reference
└── frontend/
    ├── public/index.html
    ├── src/
    │   ├── App.js         ← All React components
    │   └── index.css      ← Dark command-center theme
    └── package.json
```

---

## Submission Checklist

- [x] **Colab Notebook** — `colab/TrafficIntelligence_Colab.ipynb`
- [x] **Frontend Code** — this repository (push to GitHub)
- [ ] **Video Demo** — record with OBS / Loom showing live bounding boxes + chart updates
- [ ] **Cloudflare Link** — deploy `frontend/build` to Cloudflare Pages

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| ML Inference | YOLOv8n (Ultralytics) on CUDA T4 |
| Backend | Python · Flask · Flask-SocketIO |
| Tunnel | ngrok |
| Frontend | React 18 · Recharts · socket.io-client |
| Styling | Pure CSS custom properties (dark theme) |
| Hosting | Cloudflare Pages |
