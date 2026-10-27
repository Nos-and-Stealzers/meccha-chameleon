/* Meccha Chameleon public servers: Cloudflare Worker + one Durable Object per room.
   Same wire protocol as server/server.js (hello/welcome/join/leave/relay/to/chat/profile/lobby/host). */
const VERSION = 3;
const MAX = 15;
const ROOMS = [
  { id: 'pub-1', name: 'Public 1' },
  { id: 'pub-2', name: 'Public 2' },
  { id: 'pub-3', name: 'Public 3' },
  { id: 'pub-4', name: 'Public 4' },
];
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
const json = (o, extra = {}) => new Response(JSON.stringify(o), { headers: { 'Content-Type': 'application/json', ...CORS, ...extra } });

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (url.pathname === '/servers') {
      const cache = caches.default, key = new Request(url.origin + '/servers');
      const hit = await cache.match(key);
      if (hit) return hit;
      const list = await Promise.all(ROOMS.map(async (r) => {
        try {
          const stub = env.ROOMS.get(env.ROOMS.idFromName(r.id));
          const res = await stub.fetch('https://room/info', { headers: { 'x-room': r.id, 'x-room-name': r.name } });
          return { ...(await res.json()), id: r.id, url: 'wss://' + url.host + '/room/' + r.id };
        } catch (e) { return { id: r.id, name: r.name, offline: true }; }
      }));
      const res = json({ app: 'meccha', v: VERSION, servers: list }, { 'Cache-Control': 'public, max-age=5' });
      ctx.waitUntil(cache.put(key, res.clone()));
      return res;
    }
    const m = /^\/room\/([a-z0-9-]+)(\/info)?$/.exec(url.pathname);
    if (m) {
      const r = ROOMS.find((x) => x.id === m[1]);
      if (!r) return json({ error: 'No such room' }, { status: 404 });
      const stub = env.ROOMS.get(env.ROOMS.idFromName(r.id));
      const h = new Headers(req.headers); h.set('x-room', r.id); h.set('x-room-name', r.name);
      return stub.fetch(new Request(m[2] ? 'https://room/info' : req.url, { method: req.method, headers: h }));
    }
    if (url.pathname === '/' || url.pathname === '/health') return json({ app: 'meccha', v: VERSION, rooms: ROOMS.map((r) => r.id), max: MAX });
    return json({ error: 'Not found' }, { status: 404 });
  },
};

export class Room {
  constructor(state, env) {
    this.state = state; this.env = env;
    this.lobby = null; this.hostId = null; this.next = 1; this.name = 'Public';
    this.rate = new Map();
    this.seen = new Map();
  }
  async load() {
    if (this.lobby) return;
    const s = await this.state.storage.get(['lobby', 'hostId', 'next', 'name']);
    this.lobby = s.get('lobby') || { map: 'mansion', mode: 'classic', inGame: false, settings: {} };
    this.hostId = s.get('hostId') || null; this.next = s.get('next') || 1; this.name = s.get('name') || 'Public';
  }
  save() { return this.state.storage.put({ lobby: this.lobby, hostId: this.hostId, next: this.next, name: this.name }); }
  players(except) {
    const out = [];
    for (const ws of this.state.getWebSockets()) {
      if (ws === except) continue;
      let p = null; try { p = ws.deserializeAttachment(); } catch (e) { }
      if (p && p.id) out.push({ ws, p });
    }
    return out;
  }
  info() {
    return { app: 'meccha', v: VERSION, name: this.name, players: this.players().length, max: MAX, map: this.lobby.map, mode: this.lobby.mode, inGame: !!this.lobby.inGame, locked: false, public: true };
  }
  send(ws, o) { try { ws.send(JSON.stringify(o)); } catch (e) { } }
  broadcast(o, exceptId, exceptWs) {
    const s = JSON.stringify(o);
    for (const { ws, p } of this.players(exceptWs)) if (p.id !== exceptId) { try { ws.send(s); } catch (e) { } }
  }
  async fetch(req) {
    await this.load();
    const nm = req.headers.get('x-room-name');
    if (nm && nm !== this.name) { this.name = nm; await this.save(); }
    if (req.headers.get('Upgrade') !== 'websocket') return json(this.info());
    const pair = new WebSocketPair();
    this.state.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({});
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  limited(ws, kind, perSec) {
    const now = Date.now(), k = this.rate.get(ws) || {};
    const b = k[kind] || { t: now, n: 0 };
    if (now - b.t > 1000) { b.t = now; b.n = 0; }
    b.n++; k[kind] = b; this.rate.set(ws, k);
    return b.n > perSec;
  }
  async webSocketMessage(ws, raw) {
    await this.load();
    if (typeof raw !== 'string') return;
    if (raw.length > 1_000_000) return;
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    let me = null; try { me = ws.deserializeAttachment(); } catch (e) { }
    if (!me || !me.id) {
      if (m.t !== 'hello') return;
      if (m.v !== VERSION) { this.send(ws, { t: 'reject', reason: 'Version mismatch: update your game.' }); ws.close(4000, 'version'); return; }
      const others = this.players(ws);
      if (others.length >= MAX) { this.send(ws, { t: 'reject', reason: 'Server is full (15/15).' }); ws.close(4001, 'full'); return; }
      let profile = m.profile || {};
      if (JSON.stringify(profile).length > 4000) profile = {};
      me = { id: 'p' + this.next++, name: String(m.name || 'Player').replace(/[\u0000-\u001f]/g, '').slice(0, 20) || 'Player', profile, joinedAt: Date.now() };
      ws.serializeAttachment(me);
      if (!this.hostId || !others.some((o) => o.p.id === this.hostId)) this.hostId = me.id;
      if (!others.length) this.lobby.inGame = false;
      await this.save();
      const roster = [...others.map((o) => o.p), me].map((p) => ({ id: p.id, name: p.name, profile: p.profile }));
      this.send(ws, { t: 'welcome', id: me.id, hostId: this.hostId, server: this.info(), lobby: this.lobby, players: roster });
      this.broadcast({ t: 'join', player: { id: me.id, name: me.name, profile: me.profile } }, me.id);
      return;
    }
    if (this.limited(ws, 'all', 90)) return;
    if (m.t === 'relay' || m.t === 'to') this.seen.set(me.id, Date.now());
    switch (m.t) {
      case 'claimhost': {
        if (me.id === this.hostId || this.lobby.inGame) break;
        const now = Date.now();
        if (!this.seen.has(this.hostId)) { this.seen.set(this.hostId, now); break; }
        if (now - this.seen.get(this.hostId) < 15000 || now - (this.seen.get(me.id) || 0) > 3000) break;
        this.hostId = me.id; await this.save();
        this.broadcast({ t: 'host', hostId: this.hostId, lobby: this.lobby });
        break;
      }
      case 'relay': this.broadcast({ t: 'relay', from: me.id, d: m.d }, me.id); break;
      case 'to': { const t = this.players().find((o) => o.p.id === m.to); if (t) this.send(t.ws, { t: 'relay', from: me.id, d: m.d }); break; }
      case 'chat': {
        if (this.limited(ws, 'chat', 2)) return;
        const text = String(m.text || '').replace(/[\u0000-\u001f]/g, '').slice(0, 200).trim();
        if (text) this.broadcast({ t: 'chat', from: me.id, name: me.name, text });
        break;
      }
      case 'profile': {
        if (this.limited(ws, 'profile', 2)) return;
        me.name = String(m.name || me.name).slice(0, 20);
        if (m.profile && JSON.stringify(m.profile).length <= 4000) me.profile = m.profile;
        ws.serializeAttachment(me);
        this.broadcast({ t: 'profile', id: me.id, name: me.name, profile: me.profile }, me.id);
        break;
      }
      case 'lobby':
        if (me.id === this.hostId && m.lobby && JSON.stringify(m.lobby).length < 4000) {
          this.lobby = { ...this.lobby, ...m.lobby }; await this.save();
          this.broadcast({ t: 'lobby', lobby: this.lobby }, me.id);
        }
        break;
      case 'ping': this.send(ws, { t: 'pong', at: m.at }); break;
    }
  }
  async left(ws) {
    await this.load();
    this.rate.delete(ws);
    let me = null; try { me = ws.deserializeAttachment(); } catch (e) { }
    if (!me || !me.id) return;
    ws.serializeAttachment({});
    const rest = this.players(ws);
    this.seen.delete(me.id);
    if (me.id === this.hostId) {
      const now = Date.now(), active = rest.filter((o) => now - (this.seen.get(o.p.id) || 0) < 5000);
      const pool = active.length ? active : rest;
      this.hostId = pool.length ? pool.sort((a, b) => a.p.joinedAt - b.p.joinedAt)[0].p.id : null;
      this.lobby.inGame = false;
      this.broadcast({ t: 'host', hostId: this.hostId, lobby: this.lobby }, null, ws);
    }
    if (!rest.length) { this.lobby.inGame = false; this.hostId = null; }
    await this.save();
    this.broadcast({ t: 'leave', id: me.id }, null, ws);
  }
  async webSocketClose(ws, code, reason) { await this.left(ws); try { ws.close(1000, 'bye'); } catch (e) { } }
  async webSocketError(ws) { await this.left(ws); }
}
