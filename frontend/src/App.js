import React, { useState, useEffect, useRef, useCallback } from "react";
import { io } from "socket.io-client";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, BarChart, Bar,
} from "recharts";

// ─── Constants ────────────────────────────────────────────
const CLASS_COLORS = {
  Car:        "#3b82f6",
  Motorcycle: "#a855f7",
  Bus:        "#eab308",
  Truck:      "#ef4444",
  Person:     "#22c55e",
};

const EVENT_ICONS = {
  car: "🚗", motorcycle: "🏍", bus: "🚌", truck: "🚛", person: "🚶",
};

const SOCKET_URL = localStorage.getItem("trafficSocketUrl") || "https://YOUR_NGROK_URL";

// ─── Custom Gauge ─────────────────────────────────────────
function Gauge({ value, max, label }) {
  const pct   = Math.min(value / Math.max(max, 1), 1);
  const angle = pct * 180;
  const r     = 70;
  const cx    = 90, cy = 90;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const arcX  = cx + r * Math.cos(toRad(180 + angle));
  const arcY  = cy + r * Math.sin(toRad(180 + angle));
  const color = pct < 0.5 ? "#22c55e" : pct < 0.75 ? "#eab308" : "#ef4444";
  const track = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  const fill  = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${arcX} ${arcY}`;

  return (
    <div className="gauge-wrap">
      <svg viewBox="0 0 180 100" width="180" height="100">
        <path d={track} fill="none" stroke="#1e293b" strokeWidth="12" strokeLinecap="round" />
        {pct > 0 && (
          <path d={fill} fill="none" stroke={color} strokeWidth="12"
                strokeLinecap="round" style={{ transition: "all 0.6s ease" }} />
        )}
        <text x={cx} y={cy - 2} textAnchor="middle" fill={color}
              fontSize="22" fontWeight="700" fontFamily="'JetBrains Mono', monospace">
          {value}
        </text>
        <text x={cx} y={cy + 16} textAnchor="middle" fill="#64748b"
              fontSize="9" fontFamily="Inter, sans-serif">
          peak {max}
        </text>
      </svg>
      <p className="gauge-label">{label}</p>
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────
function StatCard({ label, value, color, delta }) {
  return (
    <div className="stat-card" style={{ borderTopColor: color }}>
      <span className="stat-label">{label}</span>
      <span className="stat-value" style={{ color }}>{value}</span>
      {delta !== undefined && (
        <span className={`stat-delta ${delta >= 0 ? "up" : "down"}`}>
          {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}
        </span>
      )}
    </div>
  );
}

// ─── Settings Modal ───────────────────────────────────────
function SettingsModal({ onClose }) {
  const [url, setUrl] = useState(localStorage.getItem("trafficSocketUrl") || "");
  const save = () => {
    localStorage.setItem("trafficSocketUrl", url);
    window.location.reload();
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3>Colab Connection</h3>
        <p>Paste the ngrok URL from your Colab notebook:</p>
        <input value={url} onChange={e => setUrl(e.target.value)}
               placeholder="https://xxxx.ngrok-free.app" className="modal-input" />
        <div className="modal-actions">
          <button onClick={onClose} className="btn-cancel">Cancel</button>
          <button onClick={save} className="btn-save">Connect</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────
export default function App() {
  const [connected, setConnected]   = useState(false);
  const [frame, setFrame]           = useState(null);
  const [counts, setCounts]         = useState({});
  const [total, setTotal]           = useState(0);
  const [peak, setPeak]             = useState(0);
  const [history, setHistory]       = useState([]);
  const [events, setEvents]         = useState([]);
  const [showSettings, setSettings] = useState(false);
  const [latency, setLatency]       = useState(0);
  const prevCounts  = useRef({});
  const eventsRef   = useRef(null);
  const tsRef       = useRef(0);

  // Socket connection
  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ["websocket"] });

    socket.on("connect",    () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("traffic_data", (data) => {
      const now = Date.now();
      setLatency(now - tsRef.current);
      tsRef.current = now;

      setFrame(data.frame);
      setCounts(prev => { prevCounts.current = prev; return data.counts || {}; });
      setTotal(data.total || 0);
      setPeak(data.peak  || 0);
      setHistory(data.history || []);
      if (data.events?.length) {
        setEvents(prev => [...data.events.slice(0, 3), ...prev].slice(0, 80));
      }
    });

    return () => socket.disconnect();
  }, []);

  // Auto-scroll event log
  useEffect(() => {
    if (eventsRef.current) eventsRef.current.scrollTop = 0;
  }, [events]);

  // Pie data
  const pieData = Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value }));

  // Deltas
  const getDelta = (cls) => (counts[cls] || 0) - (prevCounts.current[cls] || 0);

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="header">
        <div className="header-left">
          <div className="logo-dot" />
          <span className="logo-text">TrafficIQ</span>
          <span className="logo-sub">Command Center</span>
        </div>
        <div className="header-center">
          <span className={`status-pill ${connected ? "live" : "offline"}`}>
            <span className="status-dot" />
            {connected ? "LIVE" : "OFFLINE"}
          </span>
        </div>
        <div className="header-right">
          {connected && <span className="latency">{latency}ms</span>}
          <button className="settings-btn" onClick={() => setSettings(true)}>⚙</button>
        </div>
      </header>

      <main className="main-grid">
        {/* ── Left Column: Video + Events ── */}
        <section className="col-left">
          {/* Video Feed */}
          <div className="video-card">
            <div className="card-label">
              <span className="card-label-dot red" />
              LIVE FEED · YOLOv8n
            </div>
            <div className="video-wrap">
              {frame ? (
                <img src={`data:image/jpeg;base64,${frame}`}
                     alt="Traffic Feed" className="video-img" />
              ) : (
                <div className="video-placeholder">
                  <div className="placeholder-icon">📡</div>
                  <p>Awaiting stream…</p>
                  <p className="placeholder-hint">Configure the Colab URL in settings ⚙</p>
                </div>
              )}
              {/* Overlay HUD */}
              <div className="video-hud">
                <span className="hud-item">
                  <span className="hud-dot" />
                  {connected ? "STREAMING" : "DISCONNECTED"}
                </span>
                <span className="hud-item total-badge">{total} objects</span>
              </div>
            </div>
          </div>

          {/* Event Log */}
          <div className="events-card">
            <div className="card-label">
              <span className="card-label-dot blue" />
              EVENT FEED
            </div>
            <div className="event-list" ref={eventsRef}>
              {events.length === 0 && (
                <div className="event-empty">No events yet — waiting for detections…</div>
              )}
              {events.map((e, i) => (
                <div key={i} className={`event-row ${i === 0 ? "event-new" : ""}`}>
                  <span className="event-icon">
                    {EVENT_ICONS[e.type] || "🔍"}
                  </span>
                  <span className="event-msg">{e.message}</span>
                  <span className="event-time">{e.time}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Right Column: Charts + Stats ── */}
        <section className="col-right">
          {/* Stat Cards */}
          <div className="stats-row">
            {["Car", "Bus", "Truck", "Person", "Motorcycle"].map(cls => (
              <StatCard key={cls} label={cls}
                        value={counts[cls] || 0}
                        color={CLASS_COLORS[cls]}
                        delta={getDelta(cls)} />
            ))}
          </div>

          {/* Trend Line */}
          <div className="chart-card">
            <div className="card-label">
              <span className="card-label-dot green" />
              LIVE TREND · rolling 60s
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={history} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" tick={{ fill: "#475569", fontSize: 10 }}
                       interval="preserveStartEnd" />
                <YAxis tick={{ fill: "#475569", fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ background: "#0f172a", border: "1px solid #1e293b",
                                  borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: "#94a3b8" }}
                />
                {Object.entries(CLASS_COLORS).map(([cls, color]) => (
                  <Line key={cls} type="monotone" dataKey={cls}
                        stroke={color} strokeWidth={2} dot={false}
                        isAnimationActive={false} />
                ))}
                <Line type="monotone" dataKey="total"
                      stroke="#f8fafc" strokeWidth={2.5} dot={false}
                      isAnimationActive={false} strokeDasharray="5 2" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Pie + Gauge Row */}
          <div className="chart-row-2">
            {/* Distribution */}
            <div className="chart-card half">
              <div className="card-label">
                <span className="card-label-dot purple" />
                CLASS DISTRIBUTION
              </div>
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={50}
                         outerRadius={80} paddingAngle={3} dataKey="value"
                         isAnimationActive={false}>
                      {pieData.map((entry) => (
                        <Cell key={entry.name} fill={CLASS_COLORS[entry.name] || "#64748b"} />
                      ))}
                    </Pie>
                    <Legend iconType="circle" iconSize={8}
                            formatter={(v) => (
                              <span style={{ color: "#94a3b8", fontSize: 11 }}>{v}</span>
                            )} />
                    <Tooltip
                      contentStyle={{ background: "#0f172a", border: "1px solid #1e293b",
                                      borderRadius: 8, fontSize: 12 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="chart-empty">No data</div>
              )}
            </div>

            {/* Peak Gauge */}
            <div className="chart-card half">
              <div className="card-label">
                <span className="card-label-dot red" />
                PEAK DENSITY
              </div>
              <div className="gauge-center">
                <Gauge value={total} max={peak || 1} label="Current vs Peak" />
              </div>

              {/* Mini bar chart */}
              <ResponsiveContainer width="100%" height={80}>
                <BarChart data={
                  Object.entries(counts).map(([name, value]) => ({ name, value }))
                } margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
                  <Bar dataKey="value" isAnimationActive={false} radius={[3, 3, 0, 0]}>
                    {Object.entries(counts).map(([cls]) => (
                      <Cell key={cls} fill={CLASS_COLORS[cls] || "#64748b"} />
                    ))}
                  </Bar>
                  <XAxis dataKey="name" tick={{ fill: "#475569", fontSize: 9 }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      </main>

      {showSettings && <SettingsModal onClose={() => setSettings(false)} />}
    </div>
  );
}
