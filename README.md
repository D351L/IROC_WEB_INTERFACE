# IROC_WEB_INTERFACE

## AkashPankh — IROC-U ASCEND Ground Station

Real-time telemetry dashboard for IROC drone using:
- **Radiomaster Ranger Nano** (ExpressLRS TX) with Backpack ESP-NOW
- **ESP32-S3** receiving CRSF telemetry frames over ESP-NOW
- **Flask + WebSocket** backend on laptop/Jetson
- **Leaflet** live GPS map with flight path trail

## Data Pipeline

```
GOKU F722 (Betaflight)
    │  CRSF UART
    ▼
RM Ranger Nano Backpack (ESP8285)
    │  ESP-NOW ch6  UID: Shanaya30
    ▼
ESP32-S3  →  WiFi AP "ELRS-Telemetry" / "elrs1234"
    │  HTTP GET http://192.168.4.1/api
    ▼
bridge.py (polls at 10Hz)
    │  WebSocket push
    ▼
Browser Dashboard :5000
```

## Setup

```bash
# 1. Connect laptop to WiFi: ELRS-Telemetry / elrs1234

# 2. Install
pip install flask flask-sock requests

# 3. Run
python server.py

# 4. Open
http://localhost:5000
```

## Features
- Artificial horizon canvas (roll + pitch)
- Battery voltage bar with colour-coded low-battery alert
- Link quality bar + RSSI trend graph
- Baro + GPS altitude with live history graph
- Leaflet GPS map with flight path + HOME marker
- Flight mode pill + ARMED/DISARMED state
- CRSF frame stats (packets, frames, data age)
- Responsive grid layout (mobile-friendly)

## Files

| File | Role |
|------|------|
| `bridge.py` | Polls ESP32-S3 `/api`, distributes via WebSocket |
| `server.py` | Flask app + WebSocket endpoint |
| `templates/index.html` | Dashboard HTML |
| `static/css/styles.css` | Dark IROC theme |
| `static/js/script.js` | All UI logic, canvas, map |
| `requirements.txt` | Python deps |
