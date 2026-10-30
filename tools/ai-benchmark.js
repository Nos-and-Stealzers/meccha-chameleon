// AI vs AI benchmark: no human, 2 AI hunters, 5 AI hiders, normal difficulty.
// Globals: window.__MAPS, __TRIALS, __HUNT (s), __HIDERS, __HUNTERS
(async () => {
  const MAPS = window.__MAPS || ['mansion'], TRIALS = window.__TRIALS || 3, HUNT = window.__HUNT || 150;
  const NH = window.__HIDERS || 5, NHU = window.__HUNTERS || 2;
  G.lock = () => {};
  const out = { maps: {}, spots: {} };
  const tmpH = new Hunter({ id: 'probeEye', name: 'probe', avatar: { color: '#555', hat: 'none', visor: 'goggles', tool: 'hammer' }, ai: true, x: 0, z: 0 });
  tmpH.group.visible = false;
  function kindOf(c) {
    const p = c.root.position;
    if (c.stick) return c.stick.kind === 'ceil' ? 'ceil' : 'wall';
    if (POSES[c.pose]?.wall) return 'wall';
    if (p.y > 0.3) return 'top';
    if (unders.some((u) => Math.abs(p.x - u.x) < u.w / 2 && Math.abs(p.z - u.z) < u.d / 2)) return 'under';
    if ((MAP.specials || []).some((s) => Math.hypot(s.x - p.x, s.z - p.z) < 0.6)) return 'special';
    return 'floor';
  }
  function exposure(c) {
    // Average suspicion/s a normal-difficulty hunter gains looking straight at the hider from nav points 2.5-9 m away.
    const cc = c.center(); const vps = [];
    for (const n of NODES) { const d = Math.hypot(n.x - cc.x, n.z - cc.z); if (d > 2.5 && d < 9) vps.push(n); }
    vps.sort(() => Math.random() - 0.5);
    let seen = 0, tot = 0, sum = 0;
    for (const n of vps) {
      if (tot >= 10) break;
      tmpH.pos.set(n.x, 0, n.z);
      if (!tmpH.clearSight(c)) continue;
      tot++;
      const dx = cc.x - n.x, dz = cc.z - n.z;
      tmpH.look = Math.atan2(dx, dz); tmpH.pitch = Math.atan2(cc.y - 1.55, Math.hypot(dx, dz));
      tmpH.sus = new Map(); tmpH.observed = new Map();
      const g = tmpH.perceive([c], 1).get(c) || 0;
      if (g > 0) seen++;
      sum += g;
    }
    return { vps: tot, seenFrac: tot ? seen / tot : 0, susPerSec: tot ? sum / tot : 0 };
  }
  for (const map of MAPS) {
    const M = out.maps[map] = { rounds: 0, hiders: 0, caught: 0, t2f: [], kinds: {}, nn: [], exp: [], expSeen: [], dist: [], zonesFrac: [], firstCatch: [], idleScan: [], states: {} };
    for (let trial = 0; trial < TRIALS; trial++) {
      G.clearRound();
      let seed = (map.split('').reduce((a,c)=>Math.imul(a,31)+c.charCodeAt(0),7) + trial*7919) >>> 0;
      Math.random = () => { seed += 0x6D2B79F5; let t = seed; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
      const P = await G.buildPayload([{ id: 'me', name: 'Obs', role: 'none', profile: PROFILE }], { map, diff: 'normal', mode: 'classic', prep: 1, hunt: HUNT, aiHunters: NHU, aiHiders: NH });
      await G.setupRound(P);
      G.paused = false; G.paint = false; G.forcedT = 1e9;
      const hs = G.hiders.filter((c) => c.ai);
      // spot quality before the hunt
      for (const c of hs) {
        const k = kindOf(c); M.kinds[k] = (M.kinds[k] || 0) + 1;
        let nn = 1e9; for (const o of hs) if (o !== c) nn = Math.min(nn, o.root.position.distanceTo(c.root.position));
        M.nn.push(nn);
        const e = exposure(c); M.exp.push(e.susPerSec); M.expSeen.push(e.seenFrac);
      }
      seed = (map.split('').reduce((a,c)=>Math.imul(a,31)+c.charCodeAt(0),13) + trial*6151) >>> 0;
      G.setPhase('hunt', HUNT); G.forcedT = 1e9;
      const walked = G.hunters.map(() => 0), lastP = G.hunters.map((h) => h.pos.clone()), zones = new Set();
      let idle = 0, tot = 0;
      for (let n = 0; n < HUNT / 0.05 && G.phase === 'hunt'; n++) {
        advanceSimulation(0.05);
        G.hunters.forEach((h, i) => {
          walked[i] += h.pos.distanceTo(lastP[i]); lastP[i].copy(h.pos);
          const z = zoneAt(h.pos.x, h.pos.z); if (z && !z.hunters) zones.add(z.id);
          M.states[h.state] = (M.states[h.state] || 0) + 1; tot++;
          if (h.state === 'scan' && !(h.checks && h.checks.length)) idle++;
        });
        if (n % 100 === 0) await new Promise((r) => setTimeout(r, 0));
      }
      M.rounds++; M.hiders += hs.length;
      const cs = hs.filter((c) => c.caught);
      M.caught += cs.length;
      for (const c of hs) M.t2f.push(c.caught ? c.caughtAt : HUNT);
      if (cs.length) M.firstCatch.push(Math.min(...cs.map((c) => c.caughtAt)));
      M.dist.push(walked.reduce((a, b) => a + b, 0) / walked.length);
      M.zonesFrac.push(zones.size / ZONES.filter((z) => !z.hunters).length);
      M.idleScan.push(idle / Math.max(1, tot));
      (out.spots[map] = out.spots[map] || []).push(hs.map((c) => ({ k: kindOf(c), pose: c.pose, caught: c.caught ? +c.caughtAt.toFixed(1) : null })));
    }
    const avg = (a) => a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(3) : null;
    out.maps[map] = { rounds: M.rounds, caughtPct: +(100 * M.caught / M.hiders).toFixed(1), meanTimeToFind_censored: avg(M.t2f), firstCatch: avg(M.firstCatch), kinds: M.kinds, floorPct: +(100 * (M.kinds.floor || 0) / M.hiders).toFixed(1), meanNN: avg(M.nn), exposureSusPerSec: avg(M.exp), exposureSeenFrac: avg(M.expSeen), hunterWalk: avg(M.dist), zonesVisitedFrac: avg(M.zonesFrac), idleScanFrac: avg(M.idleScan), states: M.states };
  }
  tmpH.dispose();
  G.clearRound(); G.paused = true;
  return JSON.stringify(out);
})()
