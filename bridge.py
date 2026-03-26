# bridge.py
# Polls http://192.168.4.1/api (ESP32-S3) and pushes to all WebSocket clients

import requests
import json
import threading
import time

ESP32_API    = "http://192.168.4.1/api"
POLL_HZ      = 10
TIMEOUT      = 2.0

latest       = {}
data_lock    = threading.Lock()
clients_lock = threading.Lock()

# ── KEY FIX: clients is a mutable object at module level.
# Never reassign it (clients = ...) inside functions — mutate it in-place.
clients = set()


def push_to_clients(payload_str):
    dead = set()
    with clients_lock:
        for ws in clients:
            try:
                ws.send(payload_str)
            except Exception:
                dead.add(ws)
        # Mutate in-place — do NOT do: clients -= dead (that would rebind)
        for ws in dead:
            clients.discard(ws)


def poll_loop():
    global latest
    session = requests.Session()
    print(f"[Bridge] Polling {ESP32_API} at {POLL_HZ} Hz")
    while True:
        try:
            r = session.get(ESP32_API, timeout=TIMEOUT)
            if r.status_code == 200:
                data = r.json()
                with data_lock:
                    latest = data
                push_to_clients(json.dumps(data))
        except requests.exceptions.ConnectionError:
            print("[Bridge] ESP32-S3 unreachable — connect laptop to ELRS-Telemetry WiFi")
        except Exception as e:
            print(f"[Bridge] Error: {e}")
        time.sleep(1.0 / POLL_HZ)


def get_latest():
    with data_lock:
        return latest.copy()


def register_ws(ws):
    with clients_lock:
        clients.add(ws)


def unregister_ws(ws):
    with clients_lock:
        clients.discard(ws)


def start():
    t = threading.Thread(target=poll_loop, daemon=True)
    t.start()
