# server.py
# Usage:
#   python server.py           <- live mode (ESP32-S3 must be reachable)
#   python server.py --demo    <- demo mode (no hardware needed)

import sys
import json
from flask import Flask, render_template, jsonify
from flask_sock import Sock
import bridge

DEMO = '--demo' in sys.argv

app  = Flask(__name__)
sock = Sock(app)

bridge.start(demo=DEMO)

if DEMO:
    print("[Server] *** DEMO MODE — simulated telemetry active ***")
print("[Server] Dashboard → http://0.0.0.0:5000")


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/latest')
def api_latest():
    return jsonify(bridge.get_latest())


@app.route('/api/mode')
def api_mode():
    """Tells the frontend whether we are in demo or live mode."""
    return jsonify({"demo": DEMO})


@sock.route('/ws')
def telemetry_ws(ws):
    bridge.register_ws(ws)
    try:
        d = bridge.get_latest()
        if d:
            ws.send(json.dumps(d))
        while True:
            ws.receive(timeout=60)   # keep-alive
    except Exception:
        pass
    finally:
        bridge.unregister_ws(ws)


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)
