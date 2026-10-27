'use strict';
/* Meccha Chameleon: UI. Screens, HUD, hub overlay, pose wheel, server browser, wiring, boot. */

const ICON = {
  play: '<path d="M8 5.5v13l11-6.5z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.3 2.8-5 5.5-5s4.9 1.7 5.5 5"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.2c2.4.2 4.2 1.8 4.8 4.8"/>',
  shirt: '<path d="M8 4l-4.5 3 2 4L8 10v10h8V10l2.5 1 2-4L16 4c-.6 1.6-2.2 2.6-4 2.6S8.6 5.6 8 4z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  power: '<path d="M12 3v8"/><path d="M6.5 7a8 8 0 1 0 11 0"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  brush: '<path d="M14 4l6 6-8 8-6-6z"/><path d="M6 12c-2 0-3 1.5-3 3.5S2 20 2 20s4.5.5 6-1 1.5-3 .5-4"/>',
  clone: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M5 15V6a1 1 0 0 1 1-1h9"/>',
  note: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  decoy: '<circle cx="12" cy="12" r="3"/><path d="M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14M8 8a5 5 0 0 0 0 8M16 8a5 5 0 0 1 0 8"/>',
  pose: '<circle cx="12" cy="4.5" r="2"/><path d="M4 9l8 1 8-1M12 10v5l-4 6M12 15l4 6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  hammer: '<path d="M4 20l9-9"/><path d="M11 5l4-2 6 6-2 4z"/>',
  splat: '<circle cx="12" cy="12" r="5"/><circle cx="5" cy="6" r="1.6"/><circle cx="19" cy="7" r="1.3"/><circle cx="18" cy="18" r="1.8"/><circle cx="6" cy="18" r="1.2"/>',
  ping: '<circle cx="12" cy="12" r="2"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="10"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  eye: '<path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  door: '<path d="M14 4H6v16h8"/><path d="M11 12h10M18 9l3 3-3 3"/>',
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 21h8"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-3-5.4 3 1.1-6L3.2 9.4l6.1-.8z"/>',
};
const ico = (k, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICON[k] || ''}</svg>`;

const TIPS = [
  'Lie face down on a rug and paint your back like the rug pattern.',
  'The Mimic brush paints whatever is behind you from where the camera is. Line the camera up with where hunters will look from.',
  'Shiny floors need shiny chameleons. Match roughness and shine, not just colour.',
  'Hunters notice movement far more than bad paint. Freeze when you see a "?".',
  'Drop a clone in an obvious spot, then hide somewhere smarter. Bonked clones are worth 40 XP.',
  'Throw a decoy (V) across the room when a hunter is closing in.',
  'Hunters: right-click fires paintballs. A pink splat floating in mid-air is a chameleon.',
  'Hunters: Ping (E) makes nearby chameleons chirp. Close your eyes and listen.',
  'Stand in front of the Camo tester in the club to grade your paint job.',
  'Star pose plus a painting on the wall makes a very convincing art piece.',
];

function toast(msg, kind = '') {
  const el = document.createElement('div'); el.className = 'toast ' + kind; el.textContent = msg;
  $('#toasts').appendChild(el); setTimeout(() => el.remove(), 3200);
  while ($('#toasts').children.length > 4) $('#toasts').firstChild.remove();
}
function feed(html, kind = '') {
  const el = document.createElement('div'); el.className = 'feeditem ' + kind; el.innerHTML = html;
  $('#feed').prepend(el); setTimeout(() => el.classList.add('out'), 7000); setTimeout(() => el.remove(), 7600);
  while ($('#feed').children.length > 6) $('#feed').lastChild.remove();
}
function seg(id, value, fn, disabled = false) {
  const el = $(id); if (!el) return;
  el.querySelectorAll('button').forEach((b) => { b.classList.toggle('on', b.dataset.v === String(value)); b.disabled = disabled; });
  el.onclick = (e) => { const b = e.target.closest('button'); if (!b || b.disabled) return; el.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); Sound.click(); fn(b.dataset.v); };
}
const segHTML = (opts) => Object.entries(opts).map(([v, l]) => `<button data-v="${v}">${l}</button>`).join('');
function mapCards(el, cur, fn, disabled = false) {
  el.innerHTML = MAP_ORDER.map((id) => {
    const m = MAPS[id], th = THUMBS[id];
    return `<button class="mapcard ${id === cur ? 'on' : ''}" data-v="${id}" ${disabled ? 'disabled' : ''} style="--c1:${m.colors[0]};--c2:${m.colors[1]}">
      <i class="thumb" ${th ? `style="background-image:url(${th})"` : ''}></i><b>${m.name}</b><span>${m.desc}</span></button>`;
  }).join('');
  el.onclick = (e) => { const b = e.target.closest('button'); if (!b || b.disabled) return; el.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); Sound.click(); fn(b.dataset.v); };
}

const UI = {
  curTool: 'brush', color: '#7a4a2c', brush: 10, recent: [], chatOpen: false, charTab: 'cham', wheelOpen: false, wheelHold: false, panelOpen: false, settingsBack: 'menu', abKey: '',
  screen(name) {
    for (const s of $$('.screen')) s.classList.add('hidden');
    if (name) $('#screen-' + name).classList.remove('hidden');
    if (name === 'char') { Preview.start('#previewCanvas'); this.renderChar(); } else Preview.stop();
    if (name === 'online') this.startBrowser(); else this.stopBrowser();
    if (name === 'menu') this.renderMenu();
    document.body.classList.toggle('in-menu', name === 'menu');
  },
  hud(on) { $('#hud').classList.toggle('hidden', !on); },
  hubHud(on) { $('#hubHud').classList.toggle('hidden', !on); if (!on) this.hubPanel(false); },
  blind(on) { $('#blind').classList.toggle('hidden', !on); },
  loading(on, txt) {
    if (on) { $('#loadTitle').textContent = txt; $('#loadTip').textContent = pick(TIPS); this.screen('load'); }
    else if (!$('#screen-load').classList.contains('hidden')) this.screen(null);
  },
  hand(title, text) { $('#handTitle').textContent = title; $('#handText').textContent = text; this.screen('hand'); },
  pause(on) {
    if (!on) { if (!$('#screen-pause').classList.contains('hidden')) this.screen(null); return; }
    $('#pauseTitle').textContent = G.phase === 'hub' ? (G.online ? (Net.server?.name || 'Lobby') : 'Chameleon Club') : 'Paused';
    $('#pauseSub').textContent = G.online && G.phase !== 'hub' ? 'The round keeps going while you are in this menu.' : 'Click Resume to jump back in.';
    $('#quitBtn').innerHTML = ico('door') + (G.online ? 'Leave server' : G.phase === 'hub' ? 'Leave club' : 'Quit to menu');
    $('#pauseChar').classList.toggle('hidden', G.phase !== 'hub');
    this.screen('pause');
  },

  /* ---------- main menu ---------- */
  renderMenu() {
    const L = levelInfo(PROFILE.xp);
    $('#pcName').textContent = PROFILE.name;
    $('#pcAvatar').style.background = `linear-gradient(135deg, ${PROFILE.tag}, ${shade(PROFILE.tag, -0.2)})`;
    $('#pcAvatar').textContent = PROFILE.name.slice(0, 1).toUpperCase();
    $('#pcLevel').textContent = 'Level ' + L.level;
    $('#pcXpBar').style.width = (L.into / L.need * 100) + '%';
    $('#pcXpTxt').textContent = `${L.into} / ${L.need} XP`;
    const S = PROFILE.stats;
    $('#statGames').textContent = S.games; $('#statWins').textContent = S.wins; $('#statFound').textContent = S.found; $('#statSurv').textContent = S.survived;
    $('#tipText').textContent = pick(TIPS);
  },

  /* ---------- in-round HUD ---------- */
  paintPanel(on) {
    $('#paintPanel').classList.toggle('hidden', !on);
    document.body.classList.toggle('painting', !!on);
    if (on && G.my) {
      $('#rough').value = Math.round(G.my.mat.roughness * 100); $('#roughVal').textContent = G.my.mat.roughness.toFixed(2);
      $('#metal').value = Math.round(G.my.mat.metalness * 100); $('#metalVal').textContent = G.my.mat.metalness.toFixed(2);
      $('#inkRow').classList.toggle('hidden', G.phase === 'hub');
      this.refreshInk(); this.refreshBars();
    }
  },
  tool(t) { this.curTool = t; $$('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === t)); },
  setColor(hex, addRecent) { this.color = hex; $('#color').value = hex; $('#colorHex').textContent = hex; if (addRecent) { this.recent = [hex, ...this.recent.filter((c) => c !== hex)].slice(0, 16); $('#swatches').innerHTML = this.recent.map((c) => `<i style="background:${c}" data-c="${c}" title="${c}"></i>`).join(''); } },
  setRough(r) { if (!G.my) return; G.my.mat.roughness = r; $('#rough').value = Math.round(r * 100); $('#roughVal').textContent = r.toFixed(2); },
  refreshInk() { $('#inkBar').style.width = G.ink + '%'; },
  wheel(open, hold = false) {
    if (open && !controllable()) return;
    this.wheelOpen = open; this.wheelHold = hold;
    $('#poseWheel').classList.toggle('hidden', !open);
    if (open) {
      if (document.pointerLockElement) document.exitPointerLock();
      const cur = G.my?.pose, hub = G.phase === 'hub';
      $('#wheelPoses').innerHTML = POSE_ORDER.map((k) => `<button data-pose="${k}" class="${k === cur ? 'on' : ''}"><span class="pz pz-${k}"></span><b>${POSES[k].label}</b>${POSES[k].key ? `<kbd>${POSES[k].key}</kbd>` : ''}</button>`).join('');
      $('#wheelEmotes').classList.toggle('hidden', !hub);
    }
  },
  abilities() {
    const hunter = G.view === 'first' && !!G.myHunter, hider = !!G.my && G.view === 'third';
    const key = hunter ? 'h' : hider ? 'c' + G.phase : '';
    if (key !== this.abKey) {
      this.abKey = key;
      const A = (id, icon, label, kb) => `<button class="ab" id="ab-${id}" data-ab="${id}"><span class="cd"></span>${ico(icon)}<b>${label}</b><kbd>${kb}</kbd><em class="cnt"></em></button>`;
      $('#abilities').innerHTML = hunter ? A('bonk', 'hammer', 'Bonk', 'LMB') + A('paint', 'splat', 'Paintball', 'RMB') + A('ping', 'ping', 'Ping', 'E')
        : hider ? A('pose', 'pose', 'Poses', 'R') + A('brush', 'brush', 'Paint', 'F') + A('clone', 'clone', 'Clone', 'C') + A('taunt', 'note', 'Taunt', 'Q') + A('decoy', 'decoy', 'Decoy', 'V') + `<button class="ab ready" id="readyBtn">${ico('check')}<b>Ready</b><kbd>Enter</kbd></button>` : '';
    }
    if (!key) return;
    const set = (id, frac, cnt, off) => { const el = $('#ab-' + id); if (!el) return; el.style.setProperty('--p', clamp(frac, 0, 1)); el.querySelector('.cnt').textContent = cnt ?? ''; el.classList.toggle('off', !!off); };
    if (hunter) {
      set('ping', G.ab.ping / AB.pingCD, G.ab.ping > 0 ? Math.ceil(G.ab.ping) + 's' : '', G.ab.ping > 0 || G.phase !== 'hunt');
      set('paint', G.ab.ammo < AB.ammo ? 1 - G.ab.ammoT / AB.ammoRecharge : 0, '●'.repeat(G.ab.ammo) + '○'.repeat(AB.ammo - G.ab.ammo), G.ab.ammo < 1 || G.phase !== 'hunt');
      set('bonk', 0, '', G.phase !== 'hunt');
    } else {
      set('pose', 0, POSES[G.my.pose]?.label || '');
      set('clone', 0, G.ab.clones, G.ab.clones <= 0);
      set('taunt', G.ab.taunt / AB.tauntCD, G.ab.taunt > 0 ? Math.ceil(G.ab.taunt) + 's' : '', G.phase !== 'hunt' || G.ab.taunt > 0);
      set('decoy', 0, G.ab.decoys, G.phase !== 'hunt' || G.ab.decoys <= 0);
      $('#readyBtn')?.classList.toggle('hidden', !(G.phase === 'prep' && (!G.online || G.isHost)));
    }
  },
  refreshBars() {
    const P = G.my;
    $$('#paintPoses [data-pose]').forEach((b) => b.classList.toggle('on', !!P && b.dataset.pose === P.pose));
    $$('#shapeSeg button').forEach((b) => b.classList.toggle('on', !!P && b.dataset.v === P.shape));
    $$('#sizeSeg button').forEach((b) => b.classList.toggle('on', !!P && b.dataset.v === P.size));
    $('#crosshair').classList.toggle('hidden', G.view !== 'first');
    $('#eyes').classList.toggle('hidden', !(G.phase === 'hunt' && P && !P.caught && G.hunters.some((h) => h.ai)));
    if (playing()) this.abilities();
  },
  crossHot(on) { $('#crosshair').classList.toggle('hot', on); },
  status() {
    const real = G.realHiders();
    const rows = real.map((c) => `<div class="row ${c.caught ? 'caught' : ''}"><span class="dot" style="background:${c.color}"></span><span class="nm">${esc(c.name)}${c === G.my ? ' <em>you</em>' : ''}</span>${c.caught ? '<span class="x">found</span>' : ''}</div>`).join('');
    const hn = G.hunters.length;
    $('#status').innerHTML = `<div class="st-h"><span>Chameleons</span><b>${real.filter((c) => !c.caught).length}/${real.length}</b></div>${rows}<div class="st-h hunters"><span>${hn} hunter${hn === 1 ? '' : 's'}</span><b>${G.P?.mode === 'infection' ? 'Infection' : 'Classic'}</b></div>`;
  },
  tick() {
    const t = Math.max(0, G.timer);
    $('#timer').textContent = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    $('#timer').classList.toggle('low', t < 10.5);
    $('#timerBar').style.width = (G.phaseLen ? t / G.phaseLen * 100 : 0) + '%';
    $('#topbar').dataset.phase = G.phase;
    let phase = '', sub = '', hint = '';
    const left = G.realHiders().filter((c) => !c.caught).length;
    if (G.phase === 'prep') {
      if (G.view === 'first') { phase = 'Hunters wait'; sub = 'The gate opens soon'; }
      else { phase = G.party ? `${G.my?.name}: hide!` : 'Paint & hide'; sub = 'Hunters are locked in'; }
    } else if (G.phase === 'hunt') { phase = G.view === 'first' ? 'Hunt' : G.view === 'spec' ? 'Spectating' : 'Hunters are searching'; sub = `${left} chameleon${left === 1 ? '' : 's'} left · ${MAP.name}`; }
    if (G.view === 'third') hint = G.paint ? 'Left-drag paint · Right-drag orbit · Scroll zoom · Alt+click sample · F done'
      : 'WASD move · Space jump · Shift sneak · 1-0 poses · Z/X turn' + (G.online ? ' · T chat' : '');
    else if (G.view === 'first') hint = 'WASD move · Space jump · Listen for whistles and chirps' + (G.online ? ' · T chat' : '');
    else if (G.view === 'spec') { const hs = G.hunters.filter((h) => !h.local); hint = hs.length ? `Spectating ${hs[G.specIdx % hs.length].name} · 1-9 switch hunter` : ''; }
    $('#phase').textContent = phase; $('#sub').textContent = sub; $('#hint').textContent = hint;
    if (G.phase === 'hunt' && G.my) {
      const s = clamp(G.playerSus || 0, 0, 1);
      $('#eyesBar').style.width = (s * 100) + '%';
      $('#eyesTxt').textContent = s < 0.05 ? 'Unseen' : s < 0.35 ? 'Glanced at' : s < 1 ? 'Suspicious!' : 'Spotted';
      $('#eyes').dataset.lvl = s < 0.05 ? 0 : s < 0.35 ? 1 : s < 1 ? 2 : 3;
    }
    if (G.phase === 'prep' && G.view === 'first') $('#blindTime').textContent = Math.ceil(t);
    this.refreshBars(); this.status();
  },

  /* ---------- hub overlay ---------- */
  renderHub() {
    if (!G.hub) return;
    const H = G.hub, players = hubPlayers(), counts = voteCounts();
    $('#hubTitle').textContent = G.online ? (Net.server?.name || 'Lobby') : 'Chameleon Club · practice';
    $('#hubPlayers').innerHTML = `<div class="st-h"><span>Players</span><b>${players.filter((p) => p.ready).length}/${players.length} ready</b></div>` + players.map((p) => `<div class="row ${p.inHub === false ? 'away' : ''}"><span class="dot" style="background:${p.tag || '#fff'}"></span><span class="nm">${esc(p.name)}${p.me ? ' <em>you</em>' : ''}${p.host ? ' <em class="host">host</em>' : ''}</span>${p.inHub === false ? '<span class="x">in results</span>' : p.ready ? `<span class="rd">${ico('check')}</span>` : '<span class="x">not ready</span>'}</div>`).join('');
    const votes = MAP_ORDER.filter((id) => counts[id]).map((id) => `<span class="vchip ${H.vote === id ? 'mine' : ''}">${MAPS[id].name} · ${counts[id]}</span>`).join('');
    $('#hubVotes').innerHTML = votes || '<span class="muted">No votes yet. Step on a map pad to vote.</span>';
    if (this.panelOpen) this.renderHubPanel();
  },
  hubTick() {
    const H = G.hub; if (!H) return;
    const players = hubPlayers(), nReady = players.filter((p) => p.ready).length;
    const el = $('#hubStatus');
    if (H.cd != null) { el.innerHTML = `<b class="cd">Starting in ${H.cd}…</b><span>${MAPS[topVote() || G.lobby.settings.map]?.name || ''}</span>`; el.dataset.cd = 1; }
    else {
      el.dataset.cd = 0;
      el.innerHTML = H.ready ? `<b>You're ready</b><span>${nReady}/${players.length} ready · waiting for everyone</span>` : `<b>Stand on the green pad to ready up</b><span>${nReady}/${players.length} ready · vote by stepping on a map pad</span>`;
    }
    const T = $('#hubTester');
    T.classList.toggle('show', H.testShow > 0.5);
    if (H.testShow > 0.5) {
      const r = H.testRate, grade = r < 0.04 ? 'S' : r < 0.12 ? 'A' : r < 0.3 ? 'B' : r < 0.6 ? 'C' : 'D';
      const txt = { S: 'Invisible. Chef’s kiss.', A: 'Great camo. Hard to spot.', B: 'Decent. A sharp hunter might notice.', C: 'Visible. Paint more of you.', D: 'Spotted instantly.' }[grade];
      $('#testerGrade').textContent = grade; $('#testerGrade').dataset.g = grade; $('#testerTxt').textContent = H.me.speed > 0.4 ? 'Stop moving to get graded.' : txt;
      $('#testerBar').style.width = clamp(r / 0.8, 0, 1) * 100 + '%';
    }
  },
  hubPanel(open) {
    if (open && G.phase !== 'hub') return;
    this.panelOpen = open;
    $('#hubPanel').classList.toggle('hidden', !open);
    if (open) { if (document.pointerLockElement) document.exitPointerLock(); this.renderHubPanel(); }
    else if (G.phase === 'hub') G.lock();
  },
  renderHubPanel() {
    const host = !G.online || Net.isHost, s = G.online ? G.lobby.settings : null;
    $('#hpTitle').textContent = G.online ? 'Lobby settings' : 'Practice settings';
    $('#hpOnline').classList.toggle('hidden', !G.online); $('#hpOffline').classList.toggle('hidden', G.online);
    if (G.online) {
      const segs = [['#lsMode', 'mode'], ['#lsHunters', 'hunters'], ['#lsAiHunters', 'aiHunters'], ['#lsAiHiders', 'aiHiders'], ['#lsPrep', 'prep'], ['#lsHunt', 'hunt'], ['#lsDiff', 'diff']];
      for (const [id, k] of segs) seg(id, s[k], (v) => { s[k] = isNaN(+v) ? v : +v; pushLobby(); }, !host);
      mapCards($('#lsMaps'), s.map, (v) => { s.map = v; pushLobby(); }, !host);
      $('#hpNote').textContent = host ? 'Fallback map is used when nobody votes.' : 'Only the host can change settings.';
      $('#lobbyShare').innerHTML = host && this.hostIPs ? 'Friends join with ' + this.hostIPs.map((i) => `<code>${i.address}:${this.hostPort}</code>${i.tailscale ? ' <span class="muted">Tailscale</span>' : ''}`).join(' · ') : '';
      $('#hpPlayers').innerHTML = [...G.lobby.players.values()].map((p) => `<div class="row"><span class="dot" style="background:${p.profile?.tag || '#fff'}"></span><span class="nm">${esc(p.name)}</span>${host && p.id !== Net.id ? `<button class="kick small" data-id="${p.id}">Kick</button>` : ''}</div>`).join('');
      $('#hpPlayers').onclick = (e) => { const b = e.target.closest('.kick'); if (b) Net.send({ t: 'kick', id: b.dataset.id }); };
    } else {
      seg('#psKind', G.solo.kind, (v) => { G.solo.kind = v; });
      seg('#psDiff', G.solo.diff, (v) => { G.solo.diff = v; });
    }
    $('#hpStart').classList.toggle('hidden', !host);
  },

  /* ---------- end screen ---------- */
  end(R) {
    $('#endTitle').textContent = R.title; $('#endText').textContent = R.text;
    $('#endBadge').className = 'badge ' + (R.won ? 'win' : 'lose'); $('#endBadge').innerHTML = ico(R.won ? 'trophy' : 'flag') + (R.won ? 'Victory' : 'Defeat');
    $('#endList').innerHTML = R.items.map((i) => `<li><span>${esc(i.name)}</span><span class="${i.ok ? 'ok' : 'no'}">${i.txt}</span></li>`).join('');
    $('#endXp').innerHTML = R.xp.map(([k, v]) => `<li><span>${esc(k)}</span><b>+${v}</b></li>`).join('') + `<li class="tot"><span>Total</span><b>+${R.gained} XP</b></li>`;
    const L = levelInfo(PROFILE.xp);
    $('#endLevel').textContent = R.after > R.before ? `Level up! ${R.before} → ${R.after}` : `Level ${L.level}`;
    $('#endLvBar').style.width = '0%'; setTimeout(() => ($('#endLvBar').style.width = (L.into / L.need * 100) + '%'), 120);
    $('#endLvTxt').textContent = `${L.into} / ${L.need} XP to level ${L.level + 1}`;
    $('#endUnlocks').innerHTML = R.unlocks.length ? '<span class="muted">Unlocked:</span> ' + R.unlocks.map((u) => `<span class="vchip mine">${ico('star')}${esc(u)}</span>`).join('') : '';
    $('#revealBtn').innerHTML = ico('eye') + (R.surv ? 'Show hiding spots' : 'Replay where they hid');
    $('#againBtn').innerHTML = ico(R.online ? 'users' : 'play') + (R.online ? 'Back to lobby' : 'Play again');
    $('#menuBtn').innerHTML = ico('door') + (R.online ? 'Leave server' : 'Menu');
    this.hud(false); this.screen('end');
  },

  /* ---------- chat ---------- */
  openChat() {
    if (this.chatOpen) return;
    this.chatOpen = true;
    if (document.pointerLockElement) document.exitPointerLock();
    $('#gameChat').classList.remove('hidden'); $('#gameChatInput').value = ''; setTimeout(() => $('#gameChatInput').focus(), 0);
  },
  closeChat(send) {
    const v = $('#gameChatInput').value.trim();
    if (send && v) Net.send({ t: 'chat', text: v });
    this.chatOpen = false; $('#gameChat').classList.add('hidden'); $('#gameChatInput').blur(); G.lock();
  },
  addChat(name, text, sys, from) {
    G.lobby.chat.push({ name, text, sys }); if (G.lobby.chat.length > 80) G.lobby.chat.shift();
    const el = document.createElement('div'); el.className = 'chatline' + (sys ? ' sys' : ''); el.innerHTML = sys ? esc(text) : `<b>${esc(name)}</b> ${esc(text)}`;
    $('#chatFeed').appendChild(el); setTimeout(() => el.classList.add('out'), 9000); setTimeout(() => el.remove(), 9600);
    while ($('#chatFeed').children.length > 7) $('#chatFeed').firstChild.remove();
    if (!sys) { Sound.chat(); if (G.phase === 'hub' && from) chatBubble(from, text); }
  },

  /* ---------- character screen ---------- */
  renderChar() {
    $('#nameInput').value = PROFILE.name;
    const L = levelInfo(PROFILE.xp);
    $('#charLevel').innerHTML = `<b>Level ${L.level}</b><div class="bar xp"><i style="width:${L.into / L.need * 100}%"></i></div><span>${L.into}/${L.need} XP</span>`;
    $$('#charTabs button').forEach((b) => b.classList.toggle('on', b.dataset.v === this.charTab));
    const box = $('#charOpts');
    const chips = (label, opts, cur, key, kind) => `<div class="optgroup"><span>${label}</span><div class="chips" data-key="${key}">${Object.entries(opts).map(([v, l]) => { const lv = unlockLevel(kind, v), locked = myLevel() < lv; return `<button data-v="${v}" class="${v === cur ? 'on' : ''} ${locked ? 'locked' : ''}" ${locked ? `title="Unlocks at level ${lv}"` : ''}>${locked ? ico('lock') : ''}${l}${locked ? `<small>Lv ${lv}</small>` : ''}</button>`; }).join('')}</div></div>`;
    const swatches = (label, cols, cur, key) => `<div class="optgroup"><span>${label}</span><div class="chips sw" data-key="${key}">${cols.map((c) => `<button data-v="${c}" class="${c === cur ? 'on' : ''}" style="background:${c}"></button>`).join('')}</div></div>`;
    if (this.charTab === 'cham') {
      box.innerHTML = chips('Body', Object.fromEntries(Object.entries(SHAPES).map(([k, s]) => [k, s.label])), PROFILE.cham.shape, 'cham.shape', 'shape')
        + chips('Face', EYES, PROFILE.cham.eyes, 'cham.eyes', 'eyes') + swatches('Name tag colour', TAG_COLORS, PROFILE.tag, 'tag')
        + '<p class="note">Every chameleon starts pure white. The face disappears once you paint over it. Drag the preview to spin it.</p>';
      if (!Preview.cham || Preview.cham.shape !== PROFILE.cham.shape || Preview.cham.eyes !== PROFILE.cham.eyes) Preview.showCham(PROFILE.cham.shape, PROFILE.cham.eyes);
    } else if (this.charTab === 'hunter') {
      box.innerHTML = swatches('Suit colour', HUNTER_COLORS, PROFILE.hunter.color, 'hunter.color') + chips('Hat', HATS, PROFILE.hunter.hat, 'hunter.hat', 'hat') + chips('Face', VISORS, PROFILE.hunter.visor, 'hunter.visor', 'visor') + chips('Weapon', TOOLS, PROFILE.hunter.tool, 'hunter.tool', 'tool');
      Preview.showHunter(PROFILE.hunter);
    } else {
      const S = PROFILE.stats;
      box.innerHTML = `<div class="statgrid">${[['Rounds played', S.games], ['Wins', S.wins], ['Times survived', S.survived], ['Chameleons found', S.found], ['Taunts', S.taunts], ['Best hider score', S.bestScore], ['Total XP', PROFILE.xp], ['Level', L.level]].map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join('')}</div>
        <h4>Unlocks</h4><div class="unlocklist">${Object.entries(UNLOCKS).flatMap(([kind, o]) => Object.entries(o).filter(([, l]) => l > 1).map(([k, l]) => [kind, k, l])).sort((a, b) => a[2] - b[2]).map(([kind, k, l]) => `<span class="vchip ${myLevel() >= l ? 'mine' : ''}">${myLevel() >= l ? ico('check') : ico('lock')}${esc(unlockName(kind, k))} <small>Lv ${l}</small></span>`).join('')}</div>`;
      if (!Preview.cham) Preview.showCham(PROFILE.cham.shape, PROFILE.cham.eyes);
    }
    box.onclick = (e) => {
      const b = e.target.closest('.chips button'); if (!b) return;
      if (b.classList.contains('locked')) { toast(b.title, 'warn'); return; }
      const key = b.parentElement.dataset.key.split('.');
      if (key.length === 2) PROFILE[key[0]][key[1]] = b.dataset.v; else PROFILE[key[0]] = b.dataset.v;
      saveProfile(); Sound.click(); this.renderChar();
      if (G.online) Net.send({ t: 'profile', name: PROFILE.name, profile: PROFILE });
    };
  },

  /* ---------- server browser ---------- */
  browserTimer: null,
  startBrowser() {
    this.stopBrowser();
    const run = async () => {
      const rows = [];
      if (window.mcNative) { for (const s of await mcNative.lanList()) rows.push({ ...s, src: 'LAN' }); }
      const favs = JSON.parse(localStorage.getItem('mc_servers') || '[]');
      const infos = await Promise.all(favs.map((a) => fetchInfo(a)));
      favs.forEach((a, i) => { const inf = infos[i]; const [h, p] = Net.normalize(a).split(':'); if (!rows.some((r) => r.host === h && +r.port === +p)) rows.push(inf ? { ...inf, src: 'Saved' } : { name: a, host: h, port: +p, src: 'Saved', offline: true }); });
      if (!$('#screen-online').classList.contains('hidden')) this.renderServers(rows);
    };
    run(); this.browserTimer = setInterval(run, 2500);
    $('#hostNote').textContent = window.mcNative ? '' : 'Hosting needs the desktop app. You can still join by address.';
    $('#hostBtn').disabled = !window.mcNative;
  },
  stopBrowser() { clearInterval(this.browserTimer); this.browserTimer = null; },
  renderServers(rows) {
    const el = $('#serverList');
    if (!rows.length) { el.innerHTML = `<div class="empty">${ico('globe')}<b>No servers on your network yet</b><span>Host one below, or join a friend by address.</span></div>`; return; }
    el.innerHTML = rows.map((r) => `<div class="srv ${r.offline ? 'off' : ''}" data-addr="${r.host}:${r.port}" data-locked="${r.locked ? 1 : 0}">
      <i class="srvthumb" style="${THUMBS[r.map] ? `background-image:url(${THUMBS[r.map]})` : ''}"></i>
      <div class="srvname"><b>${esc(r.name)}${r.locked ? ' ' + ico('lock') : ''}</b><span>${r.src} · ${r.host}:${r.port}</span></div>
      <div class="meta">${r.offline ? 'Offline' : `${MAPS[r.map]?.name || r.map}<span>${r.mode === 'infection' ? 'Infection' : 'Classic'}${r.inGame ? ' · round in progress' : ' · in lobby'}</span>`}</div>
      <div class="cnt">${r.offline ? '–' : `${r.players}<span>/${r.max}</span>`}</div>
      <button class="primary" ${r.offline ? 'disabled' : ''}>Join</button></div>`).join('');
    el.onclick = (e) => { const row = e.target.closest('.srv'); if (!row || !e.target.closest('button')) return; joinServer(row.dataset.addr, row.dataset.locked === '1'); };
  },
};

/* ================= online flows ================= */
async function joinServer(addr, locked, password) {
  if (locked && password == null) { const pw = prompt('Server password'); if (pw == null) return; password = pw; }
  UI.loading(true, 'Connecting to ' + addr + '…');
  try {
    const w = await Net.connect(addr, password || '');
    enterLobby(w);
    const favs = JSON.parse(localStorage.getItem('mc_servers') || '[]'); const a = Net.normalize(addr);
    if (!favs.includes(a) && !/^127\.|^localhost/.test(a)) { favs.unshift(a); localStorage.setItem('mc_servers', JSON.stringify(favs.slice(0, 12))); }
  } catch (e) { UI.loading(false); UI.screen('online'); toast(e.message, 'bad'); }
}
function enterLobby(w) {
  Sound.init();
  G.online = true; G.myId = Net.id; G.isHost = Net.isHost; G.party = null;
  const L = G.lobby; L.players = new Map(w.players.map((p) => [p.id, p])); L.chat = []; L.inGame = !!w.lobby.inGame;
  if (w.lobby.settings && Object.keys(w.lobby.settings).length) L.settings = { ...L.settings, ...w.lobby.settings };
  UI.loading(false);
  enterHub();
  UI.addChat('', `Connected to ${Net.server?.name || 'server'}.` + (L.inGame ? ' A round is running; you will join the next one.' : ''), true);
}
function backToHub() {
  if (document.pointerLockElement) document.exitPointerLock();
  G.isHost = Net.isHost; enterHub();
}
Net.on('join', (m) => { G.lobby.players.set(m.player.id, m.player); UI.addChat('', `${m.player.name} joined.`, true); UI.renderHub(); });
Net.on('leave', (m) => {
  const p = G.lobby.players.get(m.id); G.lobby.players.delete(m.id);
  if (p) UI.addChat('', `${p.name} left.`, true);
  if (G.hub) { const o = G.hub.others.get(m.id); if (o) { o.cham.dispose(); G.hiders = G.hiders.filter((c) => c !== o.cham); G.hub.others.delete(m.id); } }
  const c = G.phase !== 'hub' && G.findCham(m.id); if (c && !c.caught) { c.caught = true; c.root.visible = false; }
  const h = G.findHunter(m.id) || G.findHunter(m.id + '_h'); if (h && G.phase !== 'hub') { h.dispose(); G.hunters = G.hunters.filter((x) => x !== h); }
  if (G.isHost && G.phase === 'hunt' && !G.realHiders().some((x) => !x.caught)) G.hostEnd();
  UI.renderHub();
});
Net.on('host', () => {
  G.isHost = Net.isHost; G.lobby.inGame = false;
  UI.addChat('', Net.isHost ? 'You are now the host.' : 'The host changed.', true);
  if (playing() || G.phase === 'end') { toast('Host left. Back to the lobby.', 'warn'); backToHub(); }
  else UI.renderHub();
});
Net.on('lobby', (m) => { G.lobby.settings = { ...G.lobby.settings, ...(m.lobby.settings || {}) }; G.lobby.inGame = !!m.lobby.inGame; UI.renderHub(); });
Net.on('profile', (m) => { const p = G.lobby.players.get(m.id); if (p) { p.name = m.name; p.profile = m.profile; } UI.renderHub(); });
Net.on('chat', (m) => UI.addChat(m.name, m.text, false, m.from));
Net.on('relay', (m) => G.onRelay(m.from, m.d));
Net.on('closed', () => { toast('Disconnected from server.', 'bad'); G.online = false; G.clearRound(); G.phase = 'menu'; UI.hud(false); UI.hubHud(false); showMenuScene(); UI.screen('online'); });

async function hostServer() {
  const opts = { name: $('#hName').value || `${PROFILE.name}'s server`, port: +$('#hPort').value || 7777, password: $('#hPass').value, max: +$('#hMax').value || 12 };
  UI.loading(true, 'Starting server…');
  const r = await mcNative.hostStart(opts);
  if (!r.ok) { UI.loading(false); UI.screen('online'); toast(r.error, 'bad'); return; }
  const rank = (a) => (a.startsWith('192.168.56.') || a.startsWith('172.') ? 0 : a.startsWith('100.') ? 1 : 2);
  UI.hostIPs = r.ips.filter((i) => rank(i.address) > 0).sort((a, b) => rank(b.address) - rank(a.address)); UI.hostPort = r.port;
  try { const w = await Net.connect('127.0.0.1:' + r.port, opts.password); enterLobby(w); toast('Server is up. Press Tab for lobby settings.', 'good'); }
  catch (e) { UI.loading(false); UI.screen('online'); toast(e.message, 'bad'); }
}

/* ================= wiring ================= */
G.partyCfg = { humans: 2, ai: 1, map: 'mansion', diff: 'normal' };
function wire() {
  $$('[data-ico]').forEach((el) => el.insertAdjacentHTML('afterbegin', ico(el.dataset.ico)));
  $('#mPlay').onclick = () => { UI.screen('solo'); renderSolo(); };
  $('#mParty').onclick = () => { UI.screen('party'); renderParty(); };
  $('#mOnline').onclick = () => UI.screen('online');
  $('#mChar').onclick = () => { UI.returnTo = 'menu'; UI.screen('char'); };
  $('#mSettings').onclick = () => { UI.settingsBack = 'menu'; UI.screen('settings'); renderSettings(); };
  $('#mQuit').onclick = () => (window.mcNative ? mcNative.quit() : window.close());
  $('#mQuit').classList.toggle('hidden', !window.mcNative);
  $$('.back').forEach((b) => (b.onclick = () => { Sound.click(); UI.screen('menu'); }));
  $('#soloStart').onclick = () => G.startSolo();
  $('#soloHub').onclick = () => { Sound.init(); G.online = false; G.isHost = true; G.myId = 'me'; enterHub(); toast('Practice club: try poses, paint yourself, test your camo. Ready pad starts a round.', 'good'); };
  $('#partyStart').onclick = () => G.startParty(G.partyCfg.humans, G.partyCfg.ai, G.partyCfg.map, G.partyCfg.diff);
  $('#handGo').onclick = () => G.handGo();
  $('#againBtn').onclick = () => { if (G.online) backToHub(); else if (G.party) G.startParty(G.partyCfg.humans, G.partyCfg.ai, G.partyCfg.map, G.partyCfg.diff); else G.startSolo(); };
  $('#menuBtn').onclick = () => G.toMenu();
  $('#revealBtn').onclick = () => G.startReveal();
  $('#resumeBtn').onclick = () => { G.paused = false; UI.screen(null); G.lock(); };
  $('#pauseSettings').onclick = () => { UI.settingsBack = 'pause'; UI.screen('settings'); renderSettings(); };
  $('#pauseChar').onclick = () => { UI.returnTo = 'hub'; UI.screen('char'); };
  $('#quitBtn').onclick = () => { G.paused = false; G.toMenu(); };
  $('#setBack').onclick = () => { Sound.click(); if (UI.settingsBack === 'pause') UI.pause(true); else UI.screen('menu'); };
  $('#paintDone').onclick = () => togglePaint();
  $$('[data-tool]').forEach((b) => (b.onclick = () => UI.tool(b.dataset.tool)));
  $('#color').oninput = (e) => UI.setColor(e.target.value, false);
  $('#color').onchange = (e) => UI.setColor(e.target.value, true);
  $('#swatches').onclick = (e) => { if (e.target.dataset.c) UI.setColor(e.target.dataset.c, false); };
  $('#brushSize').oninput = (e) => { UI.brush = +e.target.value; $('#sizeVal').textContent = UI.brush; };
  $('#rough').oninput = (e) => UI.setRough(+e.target.value / 100);
  $('#metal').oninput = (e) => { if (!G.my) return; G.my.mat.metalness = +e.target.value / 100; $('#metalVal').textContent = G.my.mat.metalness.toFixed(2); };
  $('#undoBtn').onclick = undo;
  $('#clearBtn').onclick = () => { if (!G.my) return; pushUndo(); G.my.blank(); };
  $('#shapeSeg').innerHTML = segHTML(Object.fromEntries(Object.entries(SHAPES).filter(([k]) => isUnlocked('shape', k)).map(([k, s]) => [k, s.label])));
  $('#shapeSeg').onclick = (e) => { const b = e.target.closest('button'); if (b && G.my) { G.my.setShape(b.dataset.v); UI.refreshBars(); } };
  $('#sizeSeg').onclick = (e) => { const b = e.target.closest('button'); if (b && G.my) { G.my.setSize(b.dataset.v); UI.refreshBars(); } };
  $('#rotL').onclick = () => G.my?.setYaw(G.my.yaw + Math.PI / 12);
  $('#rotR').onclick = () => G.my?.setYaw(G.my.yaw - Math.PI / 12);
  $('#paintPoses').innerHTML = POSE_ORDER.map((k) => `<button data-pose="${k}">${POSES[k].label}</button>`).join('');
  $('#paintPoses').onclick = (e) => { const b = e.target.closest('[data-pose]'); if (b && G.my) { setPose(b.dataset.pose); G.my.rebake(); } };
  $('#poseWheel').onclick = (e) => {
    const b = e.target.closest('[data-pose],[data-emote]');
    if (b) { Sound.click(); if (b.dataset.emote) G.my?.setEmote(b.dataset.emote); else setPose(b.dataset.pose); }
    if (b || e.target === $('#poseWheel')) { UI.wheel(false); G.lock(); }
  };
  $('#abilities').onclick = (e) => {
    const b = e.target.closest('.ab'); if (!b) return;
    if (b.id === 'readyBtn') { if (G.phase === 'prep') G.finishPrep(); return; }
    const a = b.dataset.ab;
    if (!controllable()) return;
    if (a === 'brush') togglePaint(); else if (a === 'clone') makeClone(); else if (a === 'taunt') taunt(); else if (a === 'decoy') decoy(); else if (a === 'pose') UI.wheel(true);
  };
  $('#charTabs').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; UI.charTab = b.dataset.v; Sound.click(); UI.renderChar(); };
  $('#nameInput').onchange = (e) => { PROFILE.name = (e.target.value.trim() || PROFILE.name).slice(0, 20); saveProfile(); if (G.online) Net.send({ t: 'profile', name: PROFILE.name, profile: PROFILE }); };
  $('#randomChar').onclick = () => {
    const pickU = (kind, o) => pick(Object.keys(o).filter((k) => isUnlocked(kind, k)));
    PROFILE.cham = { shape: pickU('shape', SHAPES), eyes: pickU('eyes', EYES) };
    PROFILE.hunter = { color: pick(HUNTER_COLORS), hat: pickU('hat', HATS), visor: pickU('visor', VISORS), tool: pickU('tool', TOOLS) };
    PROFILE.tag = pick(TAG_COLORS); saveProfile(); UI.renderChar();
  };
  $('#charBack').onclick = () => {
    if (UI.returnTo === 'hub' && G.phase === 'hub') {
      UI.returnTo = null; UI.screen(null);
      if (G.my && !G.my.painted && (G.my.shape !== PROFILE.cham.shape || G.my.eyes !== PROFILE.cham.eyes)) { G.my.eyes = PROFILE.cham.eyes; G.my.setShape(PROFILE.cham.shape); G.my.blank(); }
      G.lock();
    } else { UI.screen('menu'); showMenuScene(); }
  };
  $('#refreshBtn').onclick = () => UI.startBrowser();
  $('#connectBtn').onclick = () => joinServer($('#addrInput').value, false, $('#addrPass').value);
  $('#hostBtn').onclick = () => { $('#hostForm').classList.toggle('hidden'); if (!$('#hName').value) $('#hName').value = `${PROFILE.name}'s server`; };
  $('#hostGo').onclick = hostServer;
  $('#hpStart').onclick = () => { UI.hubPanel(false); if (G.online) { if (Net.isHost) G.hostStartOnline(topVote() || G.lobby.settings.map); } else hubStart(); };
  $('#hpClose').onclick = () => UI.hubPanel(false);
  $('#hpLeave').onclick = () => { UI.hubPanel(false); G.toMenu(); };
  $('#hpChar').onclick = () => { UI.hubPanel(false); UI.returnTo = 'hub'; UI.screen('char'); };
  $('#gameChatInput').onkeydown = (e) => { if (e.key === 'Enter') UI.closeChat(true); if (e.key === 'Escape') UI.closeChat(false); e.stopPropagation(); };
  $('#lsHunters').innerHTML = segHTML({ 1: '1', 2: '2', 3: '3' }); $('#lsAiHunters').innerHTML = segHTML({ 0: '0', 1: '1', 2: '2', 3: '3' }); $('#lsAiHiders').innerHTML = segHTML({ 0: '0', 1: '1', 2: '2', 3: '3', 4: '4' });
  $('#lsPrep').innerHTML = segHTML({ 45: '45s', 60: '60s', 90: '90s' }); $('#lsHunt').innerHTML = segHTML({ 120: '2m', 180: '3m', 240: '4m', 300: '5m' });
  $('#lsMode').innerHTML = segHTML({ classic: 'Classic', infection: 'Infection' }); $('#lsDiff').innerHTML = segHTML({ easy: 'Easy', normal: 'Normal', hard: 'Hard' });
  $$('button').forEach((b) => b.addEventListener('mouseenter', () => Sound.hover()));
  document.addEventListener('mouseover', (e) => { const b = e.target.closest?.('.mapcard,.modecard,.srv button,.chips button'); if (b && b !== UI._hov) { UI._hov = b; Sound.hover(); } });
  UI.setColor('#7a4a2c', true);
}
function renderSolo() {
  const s = G.solo;
  $$('#soloKind .modecard').forEach((b) => b.classList.toggle('on', b.dataset.v === s.kind));
  $('#soloKind').onclick = (e) => { const b = e.target.closest('.modecard'); if (!b) return; s.kind = b.dataset.v; Sound.click(); renderSolo(); };
  seg('#soloDiff', s.diff, (v) => { s.diff = v; });
  mapCards($('#soloMaps'), s.map, (v) => { s.map = v; });
}
function renderParty() {
  const p = G.partyCfg;
  seg('#partyHumans', p.humans, (v) => { p.humans = +v; }); seg('#partyAI', p.ai, (v) => { p.ai = +v; }); seg('#partyDiff', p.diff, (v) => { p.diff = v; });
  mapCards($('#partyMaps'), p.map, (v) => { p.map = v; });
}
function renderSettings() {
  const S = SETTINGS;
  const apply = () => { saveSettings(); camera.fov = S.fov; camera.updateProjectionMatrix(); Sound.setVolume(S.vol); };
  const bind = (id, key, fmt) => { const el = $(id); el.value = S[key]; $(id + 'Val').textContent = fmt(S[key]); el.oninput = () => { S[key] = Number(el.value); $(id + 'Val').textContent = fmt(S[key]); apply(); }; };
  bind('#setSens', 'sens', (v) => (+v).toFixed(2)); bind('#setVol', 'vol', (v) => Math.round(v * 100) + '%'); bind('#setFov', 'fov', (v) => v + '°');
  seg('#setQuality', S.quality, (v) => { S.quality = v; saveSettings(); applyQuality(); });
  seg('#setInvert', S.invertY ? 'on' : 'off', (v) => { S.invertY = v === 'on'; saveSettings(); });
  $('#fsBtn').onclick = () => (window.mcNative ? mcNative.fullscreen() : document.documentElement.requestFullscreen?.());
}

/* Pose thumbnails for the pose wheel: a white doll rendered once per pose on a transparent background. */
function makePoseThumbs() {
  const S = 160, rt = new THREE.WebGLRenderTarget(S, S), buf = new Uint8Array(S * S * 4);
  const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xffffff, 0x6a7488, 1.0));
  const d = new THREE.DirectionalLight(0xffffff, 0.55); d.position.set(2, 3, 4); sc.add(d);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'), img = g.createImageData(S, S);
  const doll = new Cham({ name: 'thumb', parent: sc }); doll.mat.map = null; doll.mat.color.set('#eef1f6'); doll.mat.needsUpdate = true;
  const css = [], prevClear = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha();
  renderer.setClearColor(0x000000, 0);
  for (const k of POSE_ORDER) {
    doll.setPose(k, true); doll.setYaw(0.5); doll.root.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(doll.mesh), ctr = bb.getCenter(new V3()), sz = bb.getSize(new V3());
    const dist = Math.max(sz.x, sz.y, sz.z) * 2.2 + 0.6;
    cam.position.set(ctr.x + dist * 0.3, ctr.y + dist * 0.35, ctr.z + dist * 0.9); cam.lookAt(ctr);
    renderer.setRenderTarget(rt); renderer.clear(); renderer.render(sc, cam); renderer.readRenderTargetPixels(rt, 0, 0, S, S, buf); renderer.setRenderTarget(null);
    for (let y = 0; y < S; y++) img.data.set(buf.subarray((S - 1 - y) * S * 4, (S - y) * S * 4), y * S * 4);
    g.putImageData(img, 0, 0);
    css.push(`.pz-${k}{background-image:url(${c.toDataURL('image/png')})}`);
  }
  renderer.setClearColor(prevClear, prevA);
  doll.dispose(); rt.dispose();
  const st = document.createElement('style'); st.textContent = css.join('\n'); document.head.appendChild(st);
}

/* ================= boot ================= */
(async () => {
  wire();
  UI.loading(true, 'Setting up the club…');
  try { await makeThumbs(); } catch (e) { console.warn('thumbs', e); }
  try { makePoseThumbs(); } catch (e) { console.warn('pose thumbs', e); }
  showMenuScene();
  G.phase = 'menu';
  UI.screen('menu');
  requestAnimationFrame(frame);
})();
window.__mc = { G, scene, camera, renderer, autoCamo, Cham, Hunter, findSpot, env, colliders, bonk, togglePaint, paintAt, UI, Net, loadMap, enterHub, shootPaint, hunterPing, decoy, step: (dt, n = 1) => { for (let i = 0; i < n; i++) step(dt); } };
