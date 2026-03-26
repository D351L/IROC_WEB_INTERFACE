// ── WebSocket ────────────────────────────────────────────────────────────────
const ws       = new WebSocket(`ws://${location.host}/ws`);
const linkPill = document.getElementById('link-pill');
const armPill  = document.getElementById('arm-pill');
const fmPill   = document.getElementById('fm-pill');
const hzEl     = document.getElementById('hz-display');

// Packet rate
let pktCount = 0, rateStart = Date.now();
setInterval(() => {
  const hz = (pktCount / ((Date.now() - rateStart) / 1000)).toFixed(1);
  hzEl.textContent = `${hz} Hz`;
  pktCount = 0;
  rateStart = Date.now();
}, 1000);

// ── Leaflet Map ──────────────────────────────────────────────────────────────
const map = L.map('map', { zoomControl: true, attributionControl: false })
              .setView([20.5937, 78.9629], 5);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 20 }).addTo(map);

const droneIcon = L.divIcon({
  html: '<div style="font-size:20px;line-height:1;filter:drop-shadow(0 0 4px #00e5a0)">⬡</div>',
  className: ''
});
let droneMarker = null;
const flightPath = L.polyline([], { color: '#00e5a0', weight: 2, opacity: 0.7 }).addTo(map);
let homeSet = false, homeMark = null;

// ── History Buffers ──────────────────────────────────────────────────────────
const ALT_HIST  = new Array(80).fill(0);
const RSSI_HIST = new Array(80).fill(0);

// ── Canvas: Artificial Horizon ───────────────────────────────────────────────
const hCanvas = document.getElementById('horizon');
const hCtx    = hCanvas.getContext('2d');

function drawHorizon(roll, pitch) {
  const W = hCanvas.width, H = hCanvas.height, cx = W / 2, cy = H / 2, R = W / 2 - 2;
  hCtx.clearRect(0, 0, W, H);
  hCtx.save();
  hCtx.beginPath();
  hCtx.arc(cx, cy, R, 0, Math.PI * 2);
  hCtx.clip();

  hCtx.save();
  hCtx.translate(cx, cy);
  hCtx.rotate(-roll * Math.PI / 180);
  const po = pitch * 1.6;

  // Sky
  const skyGrad = hCtx.createLinearGradient(0, -R + po, 0, po);
  skyGrad.addColorStop(0, '#0d3060');
  skyGrad.addColorStop(1, '#1565c0');
  hCtx.fillStyle = skyGrad;
  hCtx.fillRect(-W, -H + po, W * 2, H);

  // Ground
  const gndGrad = hCtx.createLinearGradient(0, po, 0, R);
  gndGrad.addColorStop(0, '#5d3a1a');
  gndGrad.addColorStop(1, '#3b2009');
  hCtx.fillStyle = gndGrad;
  hCtx.fillRect(-W, po, W * 2, H);

  // Horizon line
  hCtx.strokeStyle = '#ffffffcc';
  hCtx.lineWidth = 1.5;
  hCtx.beginPath();
  hCtx.moveTo(-W, po);
  hCtx.lineTo(W, po);
  hCtx.stroke();

  // Pitch ladder
  hCtx.strokeStyle = '#ffffff66';
  hCtx.lineWidth = 1;
  for (let deg = -30; deg <= 30; deg += 10) {
    if (deg === 0) continue;
    const y   = po - deg * 1.6;
    const len = Math.abs(deg) === 10 ? 16 : 24;
    hCtx.beginPath();
    hCtx.moveTo(-len, y);
    hCtx.lineTo(len, y);
    hCtx.stroke();
  }
  hCtx.restore();

  // Fixed aircraft wings
  hCtx.strokeStyle = '#ffea00';
  hCtx.lineWidth = 2.5;
  hCtx.beginPath(); hCtx.moveTo(cx - 44, cy); hCtx.lineTo(cx - 12, cy); hCtx.stroke();
  hCtx.beginPath(); hCtx.moveTo(cx + 12, cy); hCtx.lineTo(cx + 44, cy); hCtx.stroke();
  hCtx.beginPath();
  hCtx.moveTo(cx - 12, cy);
  hCtx.lineTo(cx, cy - 6);
  hCtx.lineTo(cx + 12, cy);
  hCtx.stroke();

  // Roll arc
  hCtx.strokeStyle = '#ffffff33';
  hCtx.lineWidth = 1;
  hCtx.beginPath();
  hCtx.arc(cx, cy, R - 6, Math.PI * 1.1, Math.PI * 1.9);
  hCtx.stroke();

  // Roll tick
  hCtx.save();
  hCtx.translate(cx, cy);
  hCtx.rotate(-roll * Math.PI / 180);
  hCtx.strokeStyle = '#00e5a0';
  hCtx.lineWidth = 2;
  hCtx.beginPath();
  hCtx.moveTo(0, -(R - 14));
  hCtx.lineTo(0, -(R - 4));
  hCtx.stroke();
  hCtx.restore();

  hCtx.restore();

  // Bezel
  hCtx.strokeStyle = '#1e2d3d';
  hCtx.lineWidth = 3;
  hCtx.beginPath();
  hCtx.arc(cx, cy, R, 0, Math.PI * 2);
  hCtx.stroke();
}

// ── Mini graph helper ────────────────────────────────────────────────────────
function drawHistory(ctx, canvas, history, color) {
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const max = Math.max(...history, 1);
  const min = Math.min(...history, 0);
  const range = max - min || 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  history.forEach((v, i) => {
    const x = (i / (history.length - 1)) * W;
    const y = H - ((v - min) / range) * (H - 4) - 2;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fillStyle = color + '18';
  ctx.fill();
}

// ── Set helper ───────────────────────────────────────────────────────────────
function set(id, val, digits = 1) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = (val != null && !isNaN(parseFloat(val)))
    ? Number(val).toFixed(digits) : '--';
}

// ── WebSocket events ─────────────────────────────────────────────────────────
ws.onopen  = () => { linkPill.textContent = 'LINKED';  linkPill.className = 'pill live'; };
ws.onclose = () => { linkPill.textContent = 'NO LINK'; linkPill.className = 'pill'; };

ws.onmessage = (evt) => {
  pktCount++;
  const d = JSON.parse(evt.data);
  const alive = d.age < 3000;

  // Link
  linkPill.textContent = alive ? `LQ ${d.lq}%` : `STALE ${(d.age / 1000).toFixed(0)}s`;
  linkPill.className   = alive ? 'pill live' : 'pill warn-p';

  // Flight mode pill
  fmPill.textContent = d.fm || '--';
  fmPill.className   = 'pill live';

  // Arm state inferred from flight mode string
  const fm    = (d.fm || '').toUpperCase();
  const armed = fm.includes('ACRO') || fm.includes('STAB') || fm.includes('ALTHOLD') ||
                fm.includes('LOITER') || fm.includes('AUTO') || fm.includes('ARMED');
  armPill.textContent = armed ? 'ARMED' : 'DISARMED';
  armPill.className   = armed ? 'pill armed' : 'pill';

  // ── Attitude
  const roll = d.rol || 0, pitch = d.pit || 0, yaw = d.yaw || 0;
  set('v-pit', pitch, 1);
  set('v-rol', roll,  1);
  set('v-yaw', yaw,   1);
  drawHorizon(roll, pitch);
  document.getElementById('compass-needle').style.transform = `rotate(${yaw}deg)`;

  // ── Battery
  const pct    = d.pct || 0;
  const voltEl = document.getElementById('v-volt');
  voltEl.innerHTML   = `${d.v.toFixed(1)}<span class="unit">V</span>`;
  voltEl.style.color = pct < 20 ? 'var(--danger)' : pct < 40 ? 'var(--warn)' : 'var(--accent)';
  const bfill = document.getElementById('bfill');
  bfill.style.width      = pct + '%';
  bfill.style.background = pct < 20 ? 'var(--danger)' : pct < 40 ? 'var(--warn)' : 'var(--accent)';
  set('v-curr', d.a,   1);
  set('v-mah',  d.mah, 0);
  set('v-pct',  d.pct, 0);

  // ── Altitude
  set('v-balt', d.balt, 1);
  set('v-galt', d.alt,  0);
  set('v-vs',   d.vs,   2);
  ALT_HIST.push(d.balt || 0);
  ALT_HIST.shift();
  drawHistory(altCtx, altCanvas, ALT_HIST, '#00e5a0');

  // ── Link quality
  const lqEl = document.getElementById('v-lq');
  lqEl.innerHTML   = `${d.lq}<span class="unit">%</span>`;
  lqEl.style.color = d.lq < 50 ? 'var(--danger)' : d.lq < 80 ? 'var(--warn)' : '#00e676';
  const lqFill = document.getElementById('lqfill');
  lqFill.style.width      = d.lq + '%';
  lqFill.style.background = d.lq < 50 ? 'var(--danger)' : d.lq < 80 ? 'var(--warn)' : '#00e676';
  set('v-r1',  d.r1,  0);
  set('v-r2',  d.r2,  0);
  set('v-snr', d.snr, 0);
  set('v-rf',  d.rf,  0);
  set('v-pwr', d.pwr, 0);
  set('v-dll', d.dll, 0);
  RSSI_HIST.push(d.r1 || 0);
  RSSI_HIST.shift();
  drawHistory(
    document.getElementById('rssi-hist').getContext('2d'),
    document.getElementById('rssi-hist'),
    RSSI_HIST, '#4da6ff'
  );

  // ── GPS
  const satPill = document.getElementById('sat-pill');
  satPill.textContent = `${d.sat} SATS`;
  satPill.className   = `pill sm ${d.sat >= 6 ? 'live' : d.sat >= 3 ? 'warn-p' : ''}`;
  set('v-lat', d.lat, 6);
  set('v-lon', d.lon, 6);
  set('v-spd', d.spd, 1);
  set('v-hdg', d.hdg, 0);
  if (d.sat >= 3 && d.lat !== 0) {
    const ll = [d.lat, d.lon];
    if (!droneMarker) droneMarker = L.marker(ll, { icon: droneIcon }).addTo(map);
    else droneMarker.setLatLng(ll);
    flightPath.addLatLng(ll);
    if (!homeSet) {
      homeSet  = true;
      homeMark = L.circleMarker(ll, {
        radius: 6, color: '#ffb347', fillColor: '#ffb347', fillOpacity: 0.8
      }).addTo(map);
      homeMark.bindTooltip('HOME', { permanent: true, className: 'home-label' });
      map.setView(ll, 16);
    } else {
      map.panTo(ll, { animate: true });
    }
  }

  // ── Stats
  document.getElementById('s-pkts').textContent = d.pkts;
  document.getElementById('s-frm').textContent  = d.frm;
  document.getElementById('s-age').textContent  = `${d.age} ms`;
  document.getElementById('s-rf').textContent   = d.rf;
  document.getElementById('s-pwr').textContent  = d.pwr;
  document.getElementById('s-dlr').textContent  = `-${d.dlr} dBm`;

  // Footer
  document.getElementById('f-pkts').textContent = `PKT: ${d.pkts}`;
  document.getElementById('f-age').textContent  = `AGE: ${d.age}ms`;
  document.getElementById('f-ts').textContent   = new Date().toLocaleTimeString();
};

// Canvas refs used by drawHistory calls in onmessage
const altCanvas = document.getElementById('alt-hist');
const altCtx    = altCanvas.getContext('2d');
