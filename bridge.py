# bridge.py
# Polls http://192.168.4.1/api (ESP32-S3) and pushes to all WebSocket clients
# Run with --demo to generate simulated telemetry without hardware.

import requests
import json
import threading
import time
import math
import random

ESP32_API = "http://192.168.4.1/api"
POLL_HZ   = 10
TIMEOUT   = 2.0

latest       = {}
data_lock    = threading.Lock()
clients_lock = threading.Lock()
clients      = set()          # mutated in-place only — never reassigned

DEMO_MODE = False             # set to True by server.py --demo flag


# ─────────────────────────────────────────────────────────────────────────────
# WebSocket client management
# ─────────────────────────────────────────────────────────────────────────────

def push_to_clients(payload_str):
    dead = set()
    with clients_lock:
        for ws in clients:
            try:
                ws.send(payload_str)
            except Exception:
                dead.add(ws)
        for ws in dead:
            clients.discard(ws)   # in-place mutation — never rebind with -=


def register_ws(ws):
    with clients_lock:
        clients.add(ws)


def unregister_ws(ws):
    with clients_lock:
        clients.discard(ws)


def get_latest():
    with data_lock:
        return latest.copy()


# ─────────────────────────────────────────────────────────────────────────────
# Demo telemetry generator
# Simulates a figure-8 flight path over Mumbai with realistic sensor values
# ─────────────────────────────────────────────────────────────────────────────

def _demo_loop():
    global latest
    print("[Bridge] DEMO MODE — generating simulated telemetry at 10 Hz")
    t       = 0.0
    mah     = 0
    # Figure-8 centre: Navi Mumbai (IROC test field approx)
    LAT0, LON0 = 19.0760, 72.8777
    RADIUS     = 0.0003          # ~33 m radius
    pkts = 0
    frm  = 0

    while True:
        t += 0.1

        # Figure-8 Lissajous path
        lat = LAT0 + RADIUS * math.sin(t)
        lon = LON0 + RADIUS * math.sin(t * 2)

        # Attitude: gentle oscillation
        roll  = 15.0 * math.sin(t * 0.7)
        pitch = 8.0  * math.sin(t * 0.5)
        yaw   = (math.degrees(t * 0.3)) % 360

        # Altitude: climb then hold
        balt  = max(0.0, 10.0 * math.sin(t * 0.2) + 10.0)
        vs    = 2.0 * math.cos(t * 0.2)

        # Battery: slow discharge from 16.8 V
        voltage = max(14.0, 16.8 - (t / 600.0))
        pct     = int(max(0, min(100, (voltage - 14.0) / (16.8 - 14.0) * 100)))
        mah     = int(t * 2)
        current = 8.0 + 2.0 * random.random()

        # Link quality: mostly good, occasional dip
        lq   = int(min(100, max(40, 95 + 10 * math.sin(t * 0.13))))
        rssi = int(min(0,  max(-100, -55 - 10 * abs(math.sin(t * 0.17)))))
        snr  = int(8 + 4 * math.sin(t * 0.09))

        pkts += 1
        frm  += 1

        # FM cycles through common Betaflight modes
        modes = ["ANGLE", "ALTHOLD", "ACRO", "LOITER"]
        fm = modes[int(t / 10) % len(modes)]

        data = {
            "v":    round(voltage, 2),
            "a":    round(current, 1),
            "mah":  mah,
            "pct":  pct,
            "lat":  round(lat, 7),
            "lon":  round(lon, 7),
            "alt":  int(balt),
            "spd":  round(abs(3.0 * math.cos(t * 0.4)), 1),
            "hdg":  round(yaw, 1),
            "sat":  10,
            "pit":  round(pitch, 2),
            "rol":  round(roll,  2),
            "yaw":  round(yaw,   1),
            "r1":   rssi,
            "r2":   rssi - 5,
            "lq":   lq,
            "snr":  snr,
            "rf":   4,
            "pwr":  3,
            "dlr":  rssi + 2,
            "dll":  lq - 2,
            "balt": round(balt, 2),
            "vs":   round(vs, 2),
            "fm":   fm,
            "pkts": pkts,
            "frm":  frm,
            "age":  0,
        }
        with data_lock:
            latest = data
        push_to_clients(json.dumps(data))
        time.sleep(1.0 / POLL_HZ)


# ─────────────────────────────────────────────────────────────────────────────
# Live hardware poll loop
# ─────────────────────────────────────────────────────────────────────────────

def _live_loop():
    global latest
    session = requests.Session()
    print(f"[Bridge] Polling {ESP32_API} at {POLL_HZ} Hz")
    print("[Bridge] Make sure laptop WiFi = ELRS-Telemetry / elrs1234")
    while True:
        try:
            r = session.get(ESP32_API, timeout=TIMEOUT)
            if r.status_code == 200:
                data = r.json()
                with data_lock:
                    latest = data
                push_to_clients(json.dumps(data))
        except requests.exceptions.ConnectionError:
            print("[Bridge] ESP32-S3 unreachable — waiting...")
        except Exception as e:
            print(f"[Bridge] Error: {e}")
        time.sleep(1.0 / POLL_HZ)


# ─────────────────────────────────────────────────────────────────────────────
# Public start() — called by server.py
# ─────────────────────────────────────────────────────────────────────────────

def start(demo=False):
    global DEMO_MODE
    DEMO_MODE = demo
    target = _demo_loop if demo else _live_loop
    t = threading.Thread(target=target, daemon=True)
    t.start()
