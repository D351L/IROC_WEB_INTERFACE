# IROC_WEB_INTERFACE

## AkashPankh — IROC-U ASCEND Ground Station

Real-time telemetry dashboard for IROC drone.

---

## Hardware Stack

| Layer | Hardware | Detail |
|-------|----------|--------|
| Flight Controller | FlyROBU GOKU F722 | Betaflight 4.4+ |
| RC TX Module | Radiomaster Ranger Nano | ExpressLRS, Binding Phrase: Shanaya30 |
| TX Backpack | Built-in ESP8285 | CRSF telemetry → ESP-NOW Channel 6 |
| Ground Receiver | ESP32-S3 Dev Module | Parses CRSF, serves /api JSON |
| Ground WiFi AP | ELRS-Telemetry | Password: elrs1234, IP: 192.168.4.1 |
| Companion Computer | Jetson Nano / Laptop | Runs Python backend |

---

## Data Pipeline

```
GOKU F722 (Betaflight)
    │  CRSF UART
    ▼
RM Ranger Nano Backpack (ESP8285)
    │  ESP-NOW ch6  UID: {184,104,104,139,186,30}  ["Shanaya30"]
    ▼
ESP32-S3  →  WiFi AP "ELRS-Telemetry" / "elrs1234"
    │  HTTP GET http://192.168.4.1/api  (JSON)
    ▼
bridge.py  (polls at 10 Hz, pushes via WebSocket)
    ▼
Browser Dashboard  http://<host>:5000
```

---

## Setup

```bash
# 1. Install dependencies
pip install flask flask-sock requests

# 2a. LIVE mode — connect laptop WiFi to: ELRS-Telemetry / elrs1234
python server.py

# 2b. DEMO mode — no hardware needed, simulated flight over Mumbai
python server.py --demo

# 3. Open dashboard
http://localhost:5000
# From any device on same network:
http://<your-ip>:5000
```

---

## ESP32-S3 JSON API Schema

| Key | Type | Description |
|-----|------|-------------|
| `v` | float | Battery voltage (V) |
| `a` | float | Current draw (A) |
| `mah` | int | mAh consumed |
| `pct` | int | Battery percent 0–100 |
| `lat` | float | GPS latitude |
| `lon` | float | GPS longitude |
| `alt` | int | GPS altitude (m) |
| `spd` | float | Ground speed (km/h) |
| `hdg` | float | Heading (degrees) |
| `sat` | int | Satellite count |
| `pit` | float | Pitch (degrees) |
| `rol` | float | Roll (degrees) |
| `yaw` | float | Yaw (degrees) |
| `r1` | int | RSSI antenna 1 |
| `r2` | int | RSSI antenna 2 |
| `lq` | int | Link quality 0–100 |
| `snr` | int | SNR (dB) |
| `rf` | int | RF mode index |
| `pwr` | int | TX power index |
| `dlr` | int | Downlink RSSI |
| `dll` | int | Downlink LQ |
| `balt` | float | Barometric altitude (m) |
| `vs` | float | Vertical speed (m/s) |
| `fm` | string | Flight mode (Betaflight) |
| `pkts` | int | ESP-NOW packets received |
| `frm` | int | CRSF frames decoded |
| `age` | int | ms since last telemetry |

---

## Dashboard Features

- Artificial horizon canvas (roll + pitch + pitch ladder)
- Battery voltage bar, colour-coded (green → yellow → red)
- Link quality bar + RSSI trend graph (80-sample sparkline)
- Barometric + GPS altitude with live history graph
- Leaflet GPS map — live drone position, flight path trail, HOME marker
- Flight mode pill + ARMED/DISARMED inference from FM string
- CRSF frame stats (packets, frames, data age)
- Responsive grid (4-col → 2-col → 1-col)
- `--demo` flag for hardware-free testing

---

## File Structure

| File | Role |
|------|------|
| `bridge.py` | Polls ESP32-S3 `/api`, WebSocket broadcast, demo generator |
| `server.py` | Flask app, WebSocket endpoint, `--demo` flag |
| `templates/index.html` | Dashboard HTML shell |
| `static/css/styles.css` | Dark IROC theme (JetBrains Mono + Outfit) |
| `static/js/script.js` | Canvas horizon, Leaflet map, all UI update logic |
| `requirements.txt` | Python dependencies |

---

## Antigravity Prompt (for AI-assisted development)

To extend this project using an AI coding agent, use this prompt:

```
You are an expert embedded systems and full-stack web developer specializing
in drone telemetry systems, ExpressLRS, and Flask/WebSocket applications.

REPO: https://github.com/D351L/IROC_WEB_INTERFACE
This project is ALREADY RUNNING. Read existing files before making changes.
Only modify files that need to change.

HARDWARE (FROZEN):
- FC: FlyROBU GOKU F722, Betaflight 4.4+
- TX: Radiomaster Ranger Nano, ExpressLRS, binding phrase Shanaya30
- Backpack: ESP8285, CRSF telemetry over ESP-NOW channel 6
- Ground RX: ESP32-S3, WiFi AP ELRS-Telemetry/elrs1234, IP 192.168.4.1
- /api returns JSON: {v,a,mah,pct,lat,lon,alt,spd,hdg,sat,pit,rol,yaw,
                      r1,r2,lq,snr,rf,pwr,dlr,dll,balt,vs,fm,pkts,frm,age}

RULES:
1. Never change ESP32-S3 firmware or JSON key names
2. Keep bridge.py scoping fix: clients mutated in-place (.discard()), never -= 
3. Keep flask_sock WebSocket pattern (register/unregister with try/finally)
4. Preserve drawHorizon(roll,pitch) and drawHistory(ctx,canvas,array,color) signatures
5. --demo flag in server.py must keep working
6. Push changes to https://github.com/D351L/IROC_WEB_INTERFACE

FEATURE REQUEST:
[DESCRIBE WHAT YOU WANT HERE]
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Bridge unreachable | Ensure laptop WiFi = ELRS-Telemetry |
| No data on dashboard | Check ESP32-S3 is powered and Ranger Nano is on |
| `UnboundLocalError: clients` | Never use `clients -= dead` — use `.discard()` in a loop |
| Demo mode not working | Run `python server.py --demo` |
