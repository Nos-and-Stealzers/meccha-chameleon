'use strict';
/*
 * Meccha Chameleon server: lobby + message relay over WebSocket, LAN discovery beacon over UDP.
 * Embedded in the Electron app ("Host server") or run dedicated:  node server/server.js --port 7777 --name "My Server"
 * Game simulation is host-authoritative (the lobby host's client); this server owns membership, lobby settings and relay.
 */
const http = require('http');
const dgram = require('dgram');
const os = require('os');
const { WebSocketServer } = require('ws');

const BEACON_PORT = 47777;
const VERSION = 2;

function lanIPs() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) for (const a of list || []) {
    if (a.family === 'IPv4' && !a.internal) out.push({ name, address: a.address, tailscale: a.address.startsWith('100.') });
  }
  return out;
}

function start(opts = {}) {
  const cfg = {
    port: opts.port || 7777,
    name: (opts.name || 'Meccha Server').slice(0, 40),
    password: opts.password || '',
    max: Math.max(2, Math.min(24, opts.max || 12)),
    dedicated: !!opts.dedicated,
    log: opts.log || ((...a) => console.log('[server]', ...a)),
  };
  const players = new Map();   // id -> { id, ws, name, profile, joinedAt }
  let hostId = null;
  let lobby = { map: 'mansion', mode: 'classic', inGame: false, settings: {} };
  let nextId = 1;
  const sid = Math.random().toString(36).slice(2, 10);

  const httpServer = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.url.startsWith('/info')) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(info())); return; }
    res.end('Meccha Chameleon server');
  });
  const wss = new WebSocketServer({ server: httpServer, maxPayload: 2 * 1024 * 1024 });

  function info() { return { app: 'meccha', v: VERSION, sid, name: cfg.name, players: players.size, max: cfg.max, map: lobby.map, mode: lobby.mode, inGame: lobby.inGame, locked: !!cfg.password, port: cfg.port }; }
  function roster() { return [...players.values()].map((p) => ({ id: p.id, name: p.name, profile: p.profile })); }
  function send(ws, obj) { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); }
  function broadcast(obj, exceptId) { const s = JSON.stringify(obj); for (const p of players.values()) if (p.id !== exceptId && p.ws.readyState === 1) p.ws.send(s); }

  wss.on('connection', (ws, req) => {
    let me = null;
    const addr = req.socket.remoteAddress;
    ws.on('message', (raw) => {
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (!me) {
        if (m.t === 'info') { send(ws, { t: 'info', ...info() }); ws.close(); return; }
        if (m.t !== 'hello') return;
        if (m.v !== VERSION) { send(ws, { t: 'reject', reason: 'Version mismatch: update your game.' }); ws.close(); return; }
        if (cfg.password && m.password !== cfg.password) { send(ws, { t: 'reject', reason: 'Wrong password.' }); ws.close(); return; }
        if (players.size >= cfg.max) { send(ws, { t: 'reject', reason: 'Server is full.' }); ws.close(); return; }
        me = { id: 'p' + nextId++, ws, name: String(m.name || 'Player').slice(0, 20), profile: m.profile || {}, joinedAt: Date.now() };
        players.set(me.id, me);
        if (!hostId || !players.has(hostId)) hostId = me.id;
        send(ws, { t: 'welcome', id: me.id, hostId, server: info(), lobby, players: roster() });
        broadcast({ t: 'join', player: { id: me.id, name: me.name, profile: me.profile } }, me.id);
        cfg.log(`${me.name} joined from ${addr} (${players.size}/${cfg.max})`);
        return;
      }
      switch (m.t) {
        case 'relay': broadcast({ t: 'relay', from: me.id, d: m.d }, me.id); break;
        case 'to': { const p = players.get(m.to); if (p) send(p.ws, { t: 'relay', from: me.id, d: m.d }); break; }
        case 'chat': broadcast({ t: 'chat', from: me.id, name: me.name, text: String(m.text || '').slice(0, 200) }); break;
        case 'profile': me.name = String(m.name || me.name).slice(0, 20); me.profile = m.profile || me.profile; broadcast({ t: 'profile', id: me.id, name: me.name, profile: me.profile }, me.id); break;
        case 'lobby': if (me.id === hostId) { lobby = { ...lobby, ...m.lobby }; broadcast({ t: 'lobby', lobby }, me.id); } break;
        case 'kick': if (me.id === hostId) { const p = players.get(m.id); if (p) { send(p.ws, { t: 'reject', reason: 'Kicked by host.' }); p.ws.close(); } } break;
        case 'ping': send(ws, { t: 'pong', at: m.at }); break;
      }
    });
    ws.on('close', () => {
      if (!me) return;
      players.delete(me.id);
      cfg.log(`${me.name} left (${players.size}/${cfg.max})`);
      if (me.id === hostId) {
        hostId = players.size ? [...players.values()].sort((a, b) => a.joinedAt - b.joinedAt)[0].id : null;
        lobby.inGame = false;
        broadcast({ t: 'host', hostId, lobby });
      }
      broadcast({ t: 'leave', id: me.id });
    });
    ws.on('error', () => {});
  });

  // LAN discovery beacon
  const beacon = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  let beaconTimer = null;
  beacon.on('error', () => {});
  beacon.bind(() => {
    try { beacon.setBroadcast(true); } catch {}
    beaconTimer = setInterval(() => {
      const msg = Buffer.from(JSON.stringify(info()));
      for (const ip of lanIPs()) {
        const parts = ip.address.split('.'); parts[3] = '255';
        beacon.send(msg, BEACON_PORT, parts.join('.'), () => {});
      }
      beacon.send(msg, BEACON_PORT, '255.255.255.255', () => {});
      beacon.send(msg, BEACON_PORT, '127.0.0.1', () => {});
    }, 1500);
  });

  return new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(cfg.port, '0.0.0.0', () => {
      cfg.log(`"${cfg.name}" listening on port ${cfg.port}`);
      resolve({
        port: cfg.port, name: cfg.name, ips: lanIPs(), info,
        stop() { clearInterval(beaconTimer); try { beacon.close(); } catch {} for (const p of players.values()) try { p.ws.close(); } catch {} wss.close(); httpServer.close(); },
      });
    });
  });
}

/* Prefer real LAN addresses over virtual adapters, Tailscale and loopback when one server answers on several. */
function addrRank(a) {
  if (a === '127.0.0.1') return 0;
  if (a.startsWith('192.168.56.') || a.startsWith('172.')) return 1;
  if (a.startsWith('100.')) return 2;
  return 3;
}

/* LAN listener used by clients' server browser. */
function createListener() {
  const found = new Map();
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  sock.on('error', () => {});
  sock.on('message', (buf, rinfo) => {
    try {
      const m = JSON.parse(buf.toString());
      if (m.app !== 'meccha') return;
      const host = rinfo.address;
      const key = m.sid || host + ':' + m.port;
      const prev = found.get(key);
      if (prev && prev.host !== host && addrRank(prev.host) > addrRank(host)) { prev.seen = Date.now(); Object.assign(prev, m, { host: prev.host }); return; }
      found.set(key, { ...m, host, seen: Date.now() });
    } catch {}
  });
  try { sock.bind(BEACON_PORT); } catch {}
  return {
    list() { const now = Date.now(); for (const [k, v] of found) if (now - v.seen > 5000) found.delete(k); return [...found.values()]; },
    close() { try { sock.close(); } catch {} },
  };
}

module.exports = { start, createListener, lanIPs, VERSION };

if (require.main === module) {
  const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
  start({ port: +get('port', 7777), name: get('name', os.hostname() + "'s server"), password: get('password', ''), max: +get('max', 12), dedicated: true })
    .then((s) => { console.log('LAN addresses:', s.ips.map((i) => `${i.address}:${s.port}${i.tailscale ? ' (Tailscale)' : ''}`).join(', ')); })
    .catch((e) => { console.error('Failed to start:', e.message); process.exit(1); });
}
