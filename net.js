'use strict';
/* Client networking: WebSocket to a Meccha server (embedded host or dedicated). */
const Net = {
  ws: null, id: null, hostId: null, connected: false, addr: '', server: null, handlers: {},
  on(t, fn) { this.handlers[t] = fn; },
  normalize(addr) {
    addr = String(addr || '').trim().replace(/^wss?:\/\//, '').replace(/\/.*$/, '');
    if (!addr) return null;
    if (!/:\d+$/.test(addr)) addr += ':7777';
    return addr;
  },
  connect(addr, password = '') {
    const a = this.normalize(addr);
    if (!a) return Promise.reject(new Error('Enter an address like 192.168.1.20:7777'));
    this.close();
    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket('ws://' + a);
      this.ws = ws; this.addr = a;
      const timer = setTimeout(() => { if (!settled) { settled = true; try { ws.close(); } catch { } reject(new Error('Timed out connecting to ' + a)); } }, 6000);
      ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', v: 2, name: PROFILE.name, profile: PROFILE, password }));
      ws.onmessage = (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch { return; }
        if (m.t === 'welcome') { this.id = m.id; this.hostId = m.hostId; this.connected = true; this.server = m.server; if (!settled) { settled = true; clearTimeout(timer); resolve(m); } }
        else if (m.t === 'reject') { if (!settled) { settled = true; clearTimeout(timer); reject(new Error(m.reason)); } }
        if (m.t === 'host') this.hostId = m.hostId;
        const h = this.handlers[m.t]; if (h) h(m);
      };
      ws.onerror = () => { if (!settled) { settled = true; clearTimeout(timer); reject(new Error('Could not reach ' + a)); } };
      ws.onclose = () => { const was = this.connected; this.connected = false; if (was && this.handlers.closed) this.handlers.closed(); };
    });
  },
  send(obj) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj)); },
  relay(d) { this.send({ t: 'relay', d }); },
  to(id, d) { this.send({ t: 'to', to: id, d }); },
  close() { if (this.ws) { this.connected = false; try { this.ws.onclose = null; this.ws.close(); } catch { } } this.ws = null; this.id = null; this.hostId = null; },
  get isHost() { return this.connected && this.id === this.hostId; },
};
async function fetchInfo(addr) {
  const a = Net.normalize(addr);
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 2500);
  try { const r = await fetch('http://' + a + '/info', { signal: ctl.signal }); return { ...(await r.json()), host: a.split(':')[0], port: +a.split(':')[1] }; }
  catch { return null; } finally { clearTimeout(t); }
}
