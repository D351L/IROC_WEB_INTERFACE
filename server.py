# server.py
from flask import Flask, render_template, jsonify
from flask_sock import Sock
import json
import bridge

app  = Flask(__name__)
sock = Sock(app)

bridge.start()


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/latest')
def api_latest():
    return jsonify(bridge.get_latest())


@sock.route('/ws')
def telemetry_ws(ws):
    bridge.register_ws(ws)
    try:
        d = bridge.get_latest()
        if d:
            ws.send(json.dumps(d))
        while True:
            ws.receive(timeout=60)   # keep-alive ping loop
    except Exception:
        pass
    finally:
        bridge.unregister_ws(ws)


if __name__ == '__main__':
    print("[Server] Dashboard → http://0.0.0.0:5000")
    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)
