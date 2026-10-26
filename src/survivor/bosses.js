// MANO SURVIVOR — the extra special bosses (balance.json → extraBosses), the
// ordinary bosses' skills (balance.json → bossSkills: the same attacks,
// smaller, run by game.js between their own moves) and the warnings, blows
// and shots any boss puts on the field. Pure rules, no drawing.
//
// In the chapters the data lists, after the chapter's own boss has fallen,
// one more boss comes (game.js runs the field around it: the clearing, the
// WARNING!, its entry). Its attacks cover the whole play area: rings that
// run out to its edges, bands that cross it, beams through it, fans and
// circles over all of it. Each is planned whole when it starts: its warnings
// are on the ground at once in their real shapes, with the safe ground (a
// ring's gaps, a band's gaps) shown too; then a timeline of things that
// happen once each. Its stages follow the clock: ready and charge while the
// warning shows (attack frames 0 and 1), strike (2), recover (3), then it
// drifts again. Damage comes only from the warned shapes and its body; the
// pictures and the sparks never hurt.
//
// Fairness, kept by the data and checked by the tests: every blow is warned
// at least minWarn before it lands; a ring always has a gap and a band a
// passage, the first of them within Mano's reach; one attack runs at a time
// (the last boss's combos chain two it has already shown, one after the
// other); a hit makes Mano untouchable a moment; when it falls, everything
// of its attack goes with it.

// ── shapes ──────────────────────────────────────────────────────────────────

const angleOff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)))

// is a circle of radius pr at (px, py) touching the still hazard h
export function touches(h, px, py, pr) {
  const dx = px - h.x
  const dy = py - h.y
  if (h.kind === 'circle') return dx * dx + dy * dy < (h.r + pr) ** 2
  if (h.kind === 'cone') {
    const d = Math.hypot(dx, dy)
    if (d > h.range + pr) return false
    if (h.inner && d < h.inner - pr) return false
    if (d < pr + 6) return !h.inner
    // the edge of the cone, widened by the circle's own size at that distance
    return angleOff(Math.atan2(dy, dx), h.dir) <= h.angle / 2 + Math.asin(Math.min(1, pr / d))
  }
  if (h.kind === 'line') {
    const t = dx * h.dx + dy * h.dy
    if (t < -pr || t > h.len + pr) return false
    return Math.abs(dx * -h.dy + dy * h.dx) < h.half + pr
  }
  return false
}

// a moving hazard: where its front is at time t (a ring's radius, a band's
// middle along its axis)
export const frontAt = (h, t) => (h.kind === 'wave' ? (t - h.at) * h.speed : h.pos0 + h.speed * (t - h.at))

// is (px, py) inside one of a moving hazard's gaps (safe from it however it passes)
export function inGap(h, px, py, pr) {
  if (h.kind === 'wave') {
    const d = Math.hypot(px - h.x, py - h.y)
    if (d < 1) return false
    const a = Math.atan2(py - h.y, px - h.x)
    const m = Math.asin(Math.min(1, pr / d))
    return h.gaps.some(([g, half]) => angleOff(a, g) <= half - m)
  }
  const c = h.axis === 'x' ? py : px
  return h.gaps.some(([lo, hi]) => c - pr >= lo && c + pr <= hi)
}

// is a circle at (px, py) touching the moving hazard h at time t
export function touchesAt(h, px, py, pr, t) {
  if (t < h.at || t > h.until) return false
  const f = frontAt(h, t)
  if (h.kind === 'wave') {
    const d = Math.hypot(px - h.x, py - h.y)
    if (Math.abs(d - f) > h.width / 2 + pr) return false
  } else {
    const c = h.axis === 'x' ? px : py
    if (Math.abs(c - f) > h.width / 2 + pr) return false
  }
  return !inGap(h, px, py, pr)
}

// when the moving hazard's front reaches (px, py) (null if it never does)
export function reachesAt(h, px, py) {
  if (h.kind === 'wave') return h.at + Math.hypot(px - h.x, py - h.y) / h.speed
  const c = h.axis === 'x' ? px : py
  const t = h.at + (c - h.pos0) / h.speed
  return t >= h.at ? t : null
}

// ── which boss a chapter has ────────────────────────────────────────────────

// the extra special boss of a chapter (its id), or null
export function extraOf(D, chapter) {
  return D.balance.extraBosses.chapters[String(chapter)] || null
}
// its data, with the defaults filled in
export function extraSpec(D, id) {
  const X = D.balance.extraBosses
  const b = X.bosses[id]
  return { ...b, intro: { ...X.intro, ...b.intro }, size: b.size ?? X.size, radius: b.radius ?? X.radius, hpMul: b.hpMul ?? X.hpMul, downSeconds: b.downSeconds ?? X.downSeconds, blowCap: b.blowCap ?? X.blowCap }
}

// ── the boss itself ─────────────────────────────────────────────────────────

const toward = (from, x, y) => {
  const dx = x - from.x
  const dy = y - from.y
  const d = Math.hypot(dx, dy) || 1
  return [dx / d, dy / d]
}

// the attacks it uses now (the last boss's change with its HP)
function phaseOf(run, e) {
  const B = run.D.balance.extraBosses.bosses[e.extra]
  if (!B.phases) return { i: 0, ph: B }
  const f = e.hp / e.maxHp
  let i = B.phases.findIndex((ph) => f > ph.above)
  if (i < 0) i = B.phases.length - 1
  return { i, ph: B.phases[i] }
}

// One tick of an extra boss (api: the game's own chase). It drifts toward
// Mano, keeping some room, then attacks; a new phase starts with its next
// attack (an attack under way finishes as planned, and a phase passed by a
// strong build is simply skipped, never made up later).
export function updateExtra(run, e, dt, api) {
  const X = run.D.balance.extraBosses
  const { i, ph } = phaseOf(run, e)
  if (i !== e.phase) {
    if (e.phase !== undefined) run.events.push({ type: 'phase', x: e.x, y: e.y, core: !!ph.core })
    e.phase = i
    e.core = !!ph.core
    e.atkNo = -1
  }
  if (!e.atk) {
    e.walkT = (e.walkT || 0) + dt
    const d = Math.hypot(run.player.x - e.x, run.player.y - e.y)
    if (d > 150) api.chase(run, e, dt)
    if (e.walkT >= (ph.walk ?? X.walk)) {
      e.walkT = 0
      const list = ph.attacks
      const spec = list[(e.atkNo = ((e.atkNo ?? -1) + 1) % list.length)]
      startAttack(run, e, spec)
    }
    return
  }
  tickAttack(run, e, dt)
}

// any boss's attack (an extra boss's, or an ordinary boss's skill: game.js):
// planned whole now, then run by tickAttack until it ends
export function startAttack(run, e, spec) {
  e.atk = plan(run, e, spec)
  return e.atk
}

// one tick of the attack under way; false once it has ended
export function tickAttack(run, e, dt) {
  const a = e.atk
  if (!a) return false
  a.t += dt
  // (a dash under way: it runs its lane)
  if (e.dash) {
    const k = Math.min(1, (run.t - e.dash.t0) / e.dash.dur)
    e.x = e.dash.x0 + (e.dash.x1 - e.dash.x0) * k
    e.y = e.dash.y0 + (e.dash.y1 - e.dash.y0) * k
    if (k >= 1) e.dash = null
  }
  while (a.next < a.steps.length && a.t >= a.steps[a.next].at) a.steps[a.next++].run(run, e)
  e.stage = a.t < a.strikeAt / 2 ? 'ready' : a.t < a.strikeAt ? 'charge' : a.t < a.strikeAt + 0.35 ? 'strike' : 'recover'
  if (a.t >= a.endAt) {
    e.atk = null
    e.stage = null
    e.dash = null
    return false
  }
  return true
}

// a boss down: nothing of its attack stays
export function clearOwned(run, id) {
  run.hazards = run.hazards.filter((h) => h.owner !== id)
  run.shots = run.shots.filter((s) => s.owner !== id)
  run.floors = run.floors.filter((f) => f.owner !== id)
}

// ── the ordinary bosses' skills (balance.json → bossSkills) ─────────────────

// the episode a chapter is in, from 0 (chapters 1–5) to 6 (31–35)
export const tierOf = (chapter) => Math.max(0, Math.min(6, Math.floor((chapter - 1) / 5)))

// the skills an ordinary boss of this way (A B C D) and kind (the mid-boss,
// the boss) has in a chapter, in the order it uses them
export function bossSkills(D, btype, type, chapter) {
  const S = D.balance.bossSkills
  const n = (S.count[type] || S.count.boss)[tierOf(chapter)]
  return S.byType[btype].slice(0, n)
}

// (the numbers that count things: whole)
const COUNTS = new Set(['count', 'waves', 'bursts', 'shots', 'arms', 'salvos', 'ring', 'gap', 'reach'])

// one of its skills as an attack (plan's spec): the skill's numbers at the
// chapter's tier (each `per` a tier added), its warning never under minWarn,
// its blows `hit` × the boss's own charge hit
export function bossSkill(D, name, chapter, def) {
  const S = D.balance.bossSkills
  const base = S.skills[name]
  const t = tierOf(chapter)
  const spec = { ...base }
  for (const [k, per] of Object.entries(base.per || {})) {
    const v = base[k] + per * t
    spec[k] = COUNTS.has(k) ? Math.round(v) : Math.round(v * 1000) / 1000
  }
  spec.warn = Math.max(S.minWarn, Math.round((base.warn - S.warnPerTier * t) * 1000) / 1000)
  if (spec.speed) spec.speed = Math.round(spec.speed * (1 + S.speedPerTier * t))
  spec.damage = def.chargeDamage * base.hit
  if (base.width === 'body') spec.width = def.radius * 2
  delete spec.per
  delete spec.hit
  return spec
}

// ── planning an attack ──────────────────────────────────────────────────────

// a warning on the ground now that strikes at run.t + delay
function hazard(run, e, h, delay) {
  const H = { owner: e.id, born: run.t, at: run.t + delay, done: false, linger: e.extra ? 0.45 : 0.3, look: e.look, ...h }
  run.hazards.push(H)
  return H
}

// the area the fight is in (the PC camera holds still for it)
export const fightBox = (run) => (run.extra && run.extra.box) || run.view

const clampTo = (B, x, y, m) => [Math.max(B[0] + m, Math.min(B[2] - m, x)), Math.max(B[1] + m, Math.min(B[3] - m, y))]

function plan(run, e, spec, at0 = 0) {
  const X = run.D.balance.extraBosses
  const p = run.player
  const B = fightBox(run)
  const [bx0, by0, bx1, by1] = B
  const W = bx1 - bx0
  const H = by1 - by0
  const cx = (bx0 + bx1) / 2
  const cy = (by0 + by1) / 2
  const far = Math.hypot(W, H) // further than any corner of the area from anywhere in it
  // (each blow at most blowCap of Mano's full HP: one mistake is never the end)
  const dmg = (n) => Math.min(n * e.damageMul, (e.blowCap ?? Infinity) * p.maxHp)
  const steps = []
  const at = (t, fn) => steps.push({ at: at0 + t, run: fn })
  const warn = spec.warn
  let strikeAt = warn
  let endAt = warn + (spec.recover ?? X.recover)
  const [ux, uy] = toward(e, p.x, p.y)
  e.face = ux >= 0 ? 1 : -1
  const put = (h, delay) => hazard(run, e, h, at0 + delay)
  const rnd = () => run.rng()
  switch (spec.type) {
    case 'ringwave': {
      // rings out of it to the area's edges; gaps of gapDeg to stand in, the
      // first a little to one side of Mano (a step or two away), the others
      // evenly round
      const half = ((spec.gapDeg / 2) * Math.PI) / 180
      const toMano = Math.atan2(p.y - e.y, p.x - e.x)
      const g0 = toMano + (rnd() < 0.5 ? -1 : 1) * half * (0.5 + 0.6 * rnd())
      const gaps = []
      for (let k = 0; k < spec.gaps; k++) gaps.push([g0 + (k / spec.gaps) * Math.PI * 2, half])
      const h = put({ kind: 'wave', x: e.x, y: e.y, speed: spec.speed, width: spec.width, gaps, damage: dmg(spec.damage), until: 0 }, warn)
      h.until = h.at + far / spec.speed
      endAt = warn + (far / spec.speed) * 0.6 + (spec.recover ?? X.recover)
      break
    }
    case 'sweep': {
      // a band from one side of the area to the other (across its long way
      // and its short way by turns), with gaps of gap px to stand in, the
      // first within reach
      const axis = (e.sweeps = (e.sweeps || 0) + 1) % 2 ? (W >= H ? 'x' : 'y') : W >= H ? 'y' : 'x'
      const fromLow = rnd() < 0.5
      const [lo, hi] = axis === 'x' ? [bx0, bx1] : [by0, by1]
      const [plo, phi] = axis === 'x' ? [by0, by1] : [bx0, bx1]
      const pc = axis === 'x' ? p.y : p.x
      const gaps = []
      const first = Math.max(plo + spec.gap / 2, Math.min(phi - spec.gap / 2, pc + (rnd() - 0.5) * 140))
      gaps.push([first - spec.gap / 2, first + spec.gap / 2])
      for (let k = 1; k < spec.gaps; k++) {
        // the others spread over the rest of the way across
        let c = first + ((phi - plo) / spec.gaps) * k
        if (c > phi - spec.gap / 2) c -= phi - plo
        c = Math.max(plo + spec.gap / 2, c)
        gaps.push([c - spec.gap / 2, c + spec.gap / 2])
      }
      const pos0 = fromLow ? lo - spec.width / 2 : hi + spec.width / 2
      const speed = fromLow ? spec.speed : -spec.speed
      const h = put({ kind: 'band', axis, pos0, speed, width: spec.width, gaps, damage: dmg(spec.damage), push: spec.push || 0, span: [plo, phi], until: 0 }, warn)
      h.until = h.at + (hi - lo + spec.width) / spec.speed
      endAt = warn + (hi - lo + spec.width) / spec.speed + (spec.recover ?? X.recover)
      break
    }
    case 'bloom': {
      // petal fans out of it, one after another; `skip` neighbouring petals
      // are never filled: a wide fan of safe ground
      const a0 = rnd() * Math.PI * 2
      const skipAt = Math.floor(rnd() * spec.petals)
      let n = 0
      for (let k = 0; k < spec.petals; k++) {
        if ((k - skipAt + spec.petals) % spec.petals < spec.skip) continue
        put({ kind: 'cone', x: e.x, y: e.y, dir: a0 + (k / spec.petals) * Math.PI * 2, angle: (spec.petalDeg * Math.PI) / 180, range: far, inner: spec.inner || 0, damage: dmg(spec.damage), order: n + 1, petal: true }, warn + n * spec.step)
        n++
      }
      endAt = warn + (n - 1) * spec.step + (spec.recover ?? X.recover)
      break
    }
    case 'spores': {
      // big circles over the area, one by one: one where Mano is, the others
      // spread out (never on top of each other), much of the area left clear
      const spots = []
      spots.push(clampTo(B, p.x, p.y, spec.r))
      for (let tries = 0; tries < 80 && spots.length < spec.count; tries++) {
        const x = bx0 + spec.r + rnd() * (W - 2 * spec.r)
        const y = by0 + spec.r + rnd() * (H - 2 * spec.r)
        if (spots.every(([sx, sy]) => Math.hypot(sx - x, sy - y) > spec.r * 2.6)) spots.push([x, y])
      }
      spots.forEach(([x, y], k) => put({ kind: 'circle', x, y, r: spec.r, damage: dmg(spec.damage), order: k + 1, puff: true }, warn + k * spec.step))
      endAt = warn + (spots.length - 1) * spec.step + (spec.recover ?? X.recover)
      break
    }
    case 'web': {
      // threads across the whole area through it; `fire` of them (never two
      // side by side) light up one after another as beams
      const a0 = rnd() * Math.PI
      const threads = []
      for (let k = 0; k < spec.threads; k++) threads.push(a0 + (k / spec.threads) * Math.PI)
      const start = Math.floor(rnd() * spec.threads)
      const pick = []
      for (let k = 0; k < spec.fire; k++) pick.push((start + k * 2) % spec.threads)
      const line = (a, h, delay) => put({ kind: 'line', x: e.x - Math.cos(a) * far, y: e.y - Math.sin(a) * far, dx: Math.cos(a), dy: Math.sin(a), len: far * 2, ...h }, delay)
      // (the unlit threads show as the web, harmless)
      threads.forEach((a, k) => !pick.includes(k) && line(a, { half: 2, harmless: true, thread: true, keep: 0.6 }, warn + (spec.fire - 1) * spec.step))
      pick.forEach((k, n) => line(threads[k], { half: spec.width / 2, damage: dmg(spec.damage), order: n + 1, beam: true }, warn + n * spec.step))
      endAt = warn + (spec.fire - 1) * spec.step + (spec.recover ?? X.recover)
      break
    }
    case 'rows': {
      // the area in rows (a staff); every other row rises at once, the next
      // time the others
      const odd = (e.rowsNo = (e.rowsNo || 0) + 1) % 2
      const rh = H / spec.rows
      for (let k = 0; k < spec.rows; k++) {
        const y = by0 + rh * (k + 0.5)
        if (k % 2 === odd) put({ kind: 'line', x: bx0 - 20, y, dx: 1, dy: 0, len: W + 40, half: rh / 2, damage: dmg(spec.damage), row: true }, warn)
        else put({ kind: 'line', x: bx0 - 20, y, dx: 1, dy: 0, len: W + 40, half: rh / 2 - 6, harmless: true, safe: true }, warn)
      }
      break
    }
    case 'branches': {
      // fans out of it like a snowflake's arms; every other arm strikes
      const a0 = rnd() * Math.PI * 2
      const odd = (e.branchNo = (e.branchNo || 0) + 1) % 2
      const cone = (dir, h) => put({ kind: 'cone', x: e.x, y: e.y, dir, angle: (spec.branchDeg * Math.PI) / 180, range: far, inner: 24, ...h }, warn)
      for (let k = 0; k < spec.count; k++) {
        const dir = a0 + (k / spec.count) * Math.PI * 2
        if (k % 2 === odd) cone(dir, { damage: dmg(spec.damage), arm: true })
        else cone(dir, { harmless: true, arm: true, idle: true })
      }
      break
    }
    case 'pillars': {
      // a fan of rays toward Mano; pillars rise along them, nearest first
      const a0 = Math.atan2(uy, ux)
      const spread = (spec.spreadDeg * Math.PI) / 180
      const reach = Math.min(far * 0.7, Math.max(W, H))
      for (let j = 0; j < spec.perRay; j++)
        for (let k = 0; k < spec.rays; k++) {
          const a = a0 + (spec.rays > 1 ? (k / (spec.rays - 1) - 0.5) * spread : 0)
          const d = 60 + ((reach - 60) * (j + 0.5)) / spec.perRay
          const x = e.x + Math.cos(a) * d
          const y = e.y + Math.sin(a) * d
          if (x < bx0 - spec.r || x > bx1 + spec.r || y < by0 - spec.r || y > by1 + spec.r) continue
          put({ kind: 'circle', x, y, r: spec.r, damage: dmg(spec.damage), order: j + 1, pillar: true }, warn + j * spec.step)
        }
      endAt = warn + (spec.perRay - 1) * spec.step + (spec.recover ?? X.recover)
      break
    }
    case 'clock': {
      // a dial over the whole area; the hand sweeps `lit` of its sectors in
      // turn from the hour it points at (its middle is safe)
      const k0 = Math.floor(rnd() * spec.sectors)
      const dirOf = (k) => -Math.PI / 2 + ((k + 0.5) / spec.sectors) * Math.PI * 2
      const ang = (Math.PI * 2) / spec.sectors
      for (let n = 0; n < spec.lit; n++) put({ kind: 'cone', x: cx, y: cy, dir: dirOf(k0 + n), angle: ang, range: far, inner: spec.inner, damage: dmg(spec.damage), order: n + 1, sector: true }, warn + n * spec.step)
      put({ kind: 'circle', x: cx, y: cy, r: spec.inner - 6, harmless: true, safe: true, dial: true }, warn + (spec.lit - 1) * spec.step)
      endAt = warn + (spec.lit - 1) * spec.step + (spec.recover ?? X.recover)
      break
    }
    case 'chess': {
      // a board over the area; `lines` of its rows and columns (one at least
      // of each) are cut through at once, the rest of the board stays clear
      const cw = W / spec.cols
      const ch = H / spec.rows
      const rows = new Set([Math.floor(rnd() * spec.rows)])
      const cols = new Set([Math.floor(rnd() * spec.cols)])
      for (let tries = 0; tries < 40 && rows.size + cols.size < spec.lines; tries++) {
        if (rnd() < 0.5 && rows.size < spec.rows - 2) rows.add(Math.floor(rnd() * spec.rows))
        else if (cols.size < spec.cols - 2) cols.add(Math.floor(rnd() * spec.cols))
      }
      for (const r of rows) put({ kind: 'line', x: bx0 - 20, y: by0 + ch * (r + 0.5), dx: 1, dy: 0, len: W + 40, half: ch / 2, damage: dmg(spec.damage), blade: true }, warn)
      for (const c of cols) put({ kind: 'line', x: bx0 + cw * (c + 0.5), y: by0 - 20, dx: 0, dy: 1, len: H + 40, half: cw / 2, damage: dmg(spec.damage), blade: true }, warn)
      put({ kind: 'board', x: cx, y: cy, cols: spec.cols, rows: spec.rows, box: B, harmless: true, keep: 0.4 }, warn)
      break
    }
    case 'volley': {
      // fans of shots at Mano: `bursts` of `shots`, `step` s apart, each aimed
      // where she is when its lanes show (laneWarn before it fires; the first
      // at the start)
      for (let k = 0; k < spec.bursts; k++) {
        const fireAt = warn + k * spec.step
        const dirs = []
        at(k ? fireAt - spec.laneWarn : 0, (run, e) => {
          // (lead: at where she will be that many seconds on, if she keeps going)
          const q = run.player
          const L = spec.lead || 0
          const a = Math.atan2(q.y + (q.vy || 0) * L - e.y, q.x + (q.vx || 0) * L - e.x)
          const spread = (spec.spreadDeg * Math.PI) / 180
          for (let j = 0; j < spec.shots; j++) {
            const d = a + (spec.shots > 1 ? (j / (spec.shots - 1) - 0.5) * spread : 0)
            dirs.push(d)
            hazard(run, e, { kind: 'line', x: e.x, y: e.y, dx: Math.cos(d), dy: Math.sin(d), len: far * 0.5, half: 2, harmless: true, thread: true, keep: 0.15 }, k ? spec.laneWarn : warn)
          }
        })
        at(fireAt, (run, e) => {
          for (const d of dirs) bullet(run, e, d, spec, dmg(spec.damage))
          run.events.push({ type: 'bossShot', x: e.x, y: e.y, look: e.look })
        })
      }
      endAt = warn + (spec.bursts - 1) * spec.step + (spec.recover ?? X.recover)
      break
    }
    case 'spiral': {
      // streams of shots wheeling out of it: `arms` of them, one each `every`
      // s for `seconds`, turning spin rad/s (twin: a second wheel turning the
      // other way); a ring round it while it gathers
      const a0 = rnd() * Math.PI * 2
      const turn = rnd() < 0.5 ? -1 : 1
      put({ kind: 'circle', x: e.x, y: e.y, r: e.r + 46, harmless: true, thread: true, keep: 0 }, warn)
      const n = Math.max(1, Math.round(spec.seconds / spec.every))
      for (let k = 0; k < n; k++)
        at(warn + k * spec.every, (run, e) => {
          for (let j = 0; j < spec.arms; j++) {
            const base = a0 + (j / spec.arms) * Math.PI * 2
            bullet(run, e, base + turn * spec.spin * k * spec.every, spec, dmg(spec.damage))
            if (spec.twin) bullet(run, e, base + Math.PI / spec.arms - turn * spec.spin * k * spec.every, spec, dmg(spec.damage))
          }
        })
      endAt = warn + spec.seconds + (spec.recover ?? X.recover)
      break
    }
    case 'dash': {
      // it charges straight through where Mano is to the far side of the
      // area: its lane shown, then the blow along it as it runs; `count`
      // times, each from where the last one stopped
      for (let k = 0; k < spec.count; k++) {
        const d = {}
        const t0 = k * (warn + spec.dur)
        at(t0, (run, e) => {
          const a = Math.atan2(run.player.y - e.y, run.player.x - e.x)
          const dx = Math.cos(a)
          const dy = Math.sin(a)
          const m = e.r + 10
          // (to the area's edge along it)
          const tx = dx > 0 ? (bx1 - m - e.x) / dx : dx < 0 ? (bx0 + m - e.x) / dx : Infinity
          const ty = dy > 0 ? (by1 - m - e.y) / dy : dy < 0 ? (by0 + m - e.y) / dy : Infinity
          const len = Math.max(40, Math.min(tx, ty))
          hazard(run, e, { kind: 'line', x: e.x, y: e.y, dx, dy, len, half: spec.width / 2, damage: dmg(spec.damage), blade: true }, warn)
          Object.assign(d, { x0: e.x, y0: e.y, x1: e.x + dx * len, y1: e.y + dy * len })
        })
        at(t0 + warn, (run, e) => (e.dash = { ...d, t0: run.t, dur: spec.dur }))
      }
      endAt = spec.count * (warn + spec.dur) + (spec.recover ?? X.recover)
      break
    }
    case 'rain': {
      // circles falling all over the area in quick turns: the first where
      // Mano is, the next where she is heading, the rest spread out
      const spots = [clampTo(B, p.x, p.y, spec.r), clampTo(B, p.x + (p.vx || 0) * 0.6, p.y + (p.vy || 0) * 0.6, spec.r)]
      for (let tries = 0; tries < 200 && spots.length < spec.count; tries++) {
        const x = bx0 + spec.r + rnd() * (W - 2 * spec.r)
        const y = by0 + spec.r + rnd() * (H - 2 * spec.r)
        if (spots.every(([sx, sy]) => Math.hypot(sx - x, sy - y) > spec.r * 1.7)) spots.push([x, y])
      }
      spots.forEach(([x, y], k) => put({ kind: 'circle', x, y, r: spec.r, damage: dmg(spec.damage), puff: true }, warn + k * spec.step))
      endAt = warn + (spots.length - 1) * spec.step + (spec.recover ?? X.recover)
      break
    }
    case 'cross': {
      // a cross through where Mano is, across the whole area (then an X, by
      // turns): `count` of them, each on where she is when it shows
      for (let k = 0; k < spec.count; k++)
        at(k * spec.step, (run, e) => {
          const q = run.player
          const tilt = ((e.crossNo = (e.crossNo || 0) + 1) % 2) * (Math.PI / 4)
          for (const a of [tilt, tilt + Math.PI / 2]) hazard(run, e, { kind: 'line', x: q.x - Math.cos(a) * far, y: q.y - Math.sin(a) * far, dx: Math.cos(a), dy: Math.sin(a), len: far * 2, half: spec.width / 2, damage: dmg(spec.damage), blade: true }, warn)
        })
      endAt = (spec.count - 1) * spec.step + warn + (spec.recover ?? X.recover)
      break
    }
    case 'nova': {
      // rings of shots out of it all round: `waves` rings of `count`, `every`
      // s apart, each turned half a step from the last (so standing still
      // between two shots of one ring is no shelter from the next); a ring
      // round it while it gathers
      put({ kind: 'circle', x: e.x, y: e.y, r: e.r + 40, harmless: true, thread: true, keep: 0 }, warn)
      const a0 = rnd() * Math.PI * 2
      for (let k = 0; k < spec.waves; k++)
        at(warn + k * spec.every, (run, e) => {
          for (let j = 0; j < spec.count; j++) bullet(run, e, a0 + ((j + (k % 2) * 0.5) / spec.count) * Math.PI * 2, spec, dmg(spec.damage))
          run.events.push({ type: 'bossShot', x: e.x, y: e.y, look: e.look })
        })
      endAt = warn + (spec.waves - 1) * spec.every + (spec.recover ?? X.recover)
      break
    }
    case 'homing': {
      // seeking orbs: `count` of them thrown out wide (away from Mano's side,
      // then round), each turning toward her at most `turn` rad/s for `seek`
      // s, then flying straight on: a quick step aside lets them pass
      put({ kind: 'circle', x: e.x, y: e.y, r: e.r + 30, harmless: true, thread: true, keep: 0 }, warn)
      for (let k = 0; k < (spec.salvos || 1); k++)
        at(warn + k * (spec.every || 0.6), (run, e) => {
          const toMano = Math.atan2(run.player.y - e.y, run.player.x - e.x)
          const spread = (spec.spreadDeg * Math.PI) / 180
          for (let j = 0; j < spec.count; j++) {
            const a = toMano + Math.PI + (spec.count > 1 ? (j / (spec.count - 1) - 0.5) * spread : 0)
            bullet(run, e, a, spec, dmg(spec.damage), { turn: spec.turn, seek: spec.seek })
          }
          run.events.push({ type: 'bossShot', x: e.x, y: e.y, look: e.look })
        })
      endAt = warn + ((spec.salvos || 1) - 1) * (spec.every || 0.6) + (spec.recover ?? X.recover)
      break
    }
    case 'cage': {
      // a ring of blows round where Mano is with one way out (`gap` places
      // left out side by side), then, `after` s later, all of its inside
      const R = spec.ring
      const [cx0, cy0] = clampTo(B, p.x, p.y, Math.min(R * 0.6, Math.min(W, H) / 2 - 1))
      const g0 = Math.floor(rnd() * spec.count)
      for (let k = 0; k < spec.count; k++) {
        if ((k - g0 + spec.count) % spec.count < spec.gap) continue
        const a = (k / spec.count) * Math.PI * 2
        put({ kind: 'circle', x: cx0 + Math.cos(a) * R, y: cy0 + Math.sin(a) * R, r: spec.r, damage: dmg(spec.damage), order: 1, puff: true }, warn)
      }
      put({ kind: 'circle', x: cx0, y: cy0, r: R - spec.r * 0.5, damage: dmg(spec.damage), order: 2 }, warn + spec.after)
      endAt = warn + spec.after + (spec.recover ?? X.recover)
      break
    }
    case 'stalk': {
      // blows that follow her: `count` circles, each shown where she is (and
      // a little ahead, lead s) when its turn comes, `step` s apart
      for (let k = 0; k < spec.count; k++)
        at(k * spec.step, (run, e) => {
          const q = run.player
          const L = spec.lead || 0
          const [x, y] = clampTo(B, q.x + (q.vx || 0) * L, q.y + (q.vy || 0) * L, spec.r * 0.5)
          hazard(run, e, { kind: 'circle', x, y, r: spec.r, damage: dmg(spec.damage), puff: true }, warn)
        })
      endAt = (spec.count - 1) * spec.step + warn + (spec.recover ?? X.recover)
      break
    }
    case 'crossfire': {
      // crossfire: `lines` lines across the whole area at once, crossing
      // where Mano is when they show, evenly turned (a star); `waves` of
      // them, `step` s apart (the data keeps it no shorter than the warning:
      // one star at a time), each at where she is then. She is clear only by
      // going far enough between two of them before they land
      for (let k = 0; k < spec.waves; k++)
        at(k * spec.step, (run, e) => {
          const q = run.player
          const a0 = run.rng() * Math.PI
          for (let j = 0; j < spec.lines; j++) {
            const a = a0 + (j / spec.lines) * Math.PI
            hazard(run, e, { kind: 'line', x: q.x - Math.cos(a) * far, y: q.y - Math.sin(a) * far, dx: Math.cos(a), dy: Math.sin(a), len: far * 2, half: spec.width / 2, damage: dmg(spec.damage), blade: true, order: k + 1 }, warn)
          }
        })
      endAt = (spec.waves - 1) * spec.step + warn + (spec.recover ?? X.recover)
      break
    }
    case 'slam': {
      // a blow all round it (radius reach), and on it `ring` shots out of it
      put({ kind: 'circle', x: e.x, y: e.y, r: spec.reach, damage: dmg(spec.damage), slam: true }, warn)
      if (spec.ring)
        at(warn, (run, e) => {
          const a0 = Math.atan2(run.player.y - e.y, run.player.x - e.x) + Math.PI / spec.ring
          for (let j = 0; j < spec.ring; j++) bullet(run, e, a0 + (j / spec.ring) * Math.PI * 2, spec, dmg(spec.shotDamage ?? spec.damage * 0.5))
        })
      break
    }
    case 'combo': {
      // attacks it has already shown, one after the other: the next is
      // planned (and shown) only when its time comes, from where things are then
      const first = plan(run, e, spec.parts[0], at0)
      for (const s of first.steps) steps.push(s)
      let t = first.strikeAt - at0
      for (let k = 1; k < spec.parts.length; k++) {
        t += spec.after[k - 1]
        const part = spec.parts[k]
        const when = at0 + t
        at(t, (run, e) => {
          const p2 = plan(run, e, part, 0)
          for (const s of p2.steps) e.atk.steps.push({ at: s.at + when, run: s.run })
          e.atk.steps.sort((a, b) => a.at - b.at)
          e.atk.endAt = Math.max(e.atk.endAt, when + p2.endAt)
        })
      }
      strikeAt = first.strikeAt - at0
      endAt = Math.max(first.endAt - at0, t + 0.1)
      break
    }
    default:
      throw new Error('unknown attack: ' + spec.type)
  }
  steps.sort((a, b) => a.at - b.at)
  return { spec, t: 0, next: 0, steps, strikeAt: at0 + strikeAt, endAt: at0 + endAt }
}

// one of an extra boss's own shots, at angle a, of `damage` (already capped)
// (more: { turn, seek } for a seeking orb). An extra boss's shots look and
// fly its own way (balance.json → extraBosses.bosses[*].shot, shotMove:
// shotMove below)
function bullet(run, e, a, spec, damage, more = null) {
  const dx = Math.cos(a)
  const dy = Math.sin(a)
  const B = e.extra && run.D.balance.extraBosses.bosses[e.extra]
  const kind = spec.look || (B && B.shot) || 'spark'
  let mv = !more && B && B.shotMove
  if (mv && mv.type === 'mix') mv = mv.of[Math.floor(run.rng() * mv.of.length)]
  // (every other one turns the other way)
  const side = (e.shotNo = (e.shotNo || 0) + 1) % 2 ? 1 : -1
  run.shots.push({ owner: e.id, x: e.x + dx * e.r * 0.6, y: e.y + dy * e.r * 0.6, vx: dx * spec.speed, vy: dy * spec.speed, r: spec.r, damage, ttl: spec.ttl ?? 5, kind, age: 0, sp: spec.speed, mv: mv || null, side, ...more })
}

// how an extra boss's shot flies, each step before it moves (s.mv; fair as
// any shot: it is always seen, and hurts as any other). Returns the shots
// it splits into, if it does
function shotMove(run, s, dt) {
  const m = s.mv
  const age = (s.age += dt)
  const turnBy = (a) => {
    const c = Math.cos(a)
    const n = Math.sin(a)
    ;[s.vx, s.vy] = [s.vx * c - s.vy * n, s.vx * n + s.vy * c]
  }
  const setSpeed = (v) => {
    const d = Math.hypot(s.vx, s.vy) || 1
    s.vx = (s.vx / d) * v
    s.vy = (s.vy / d) * v
  }
  switch (m.type) {
    case 'curve':
      turnBy(m.turn * s.side * dt)
      break
    case 'accel':
    case 'decel':
      setSpeed(s.sp * (m.from + (m.to - m.from) * Math.min(1, age / m.over)))
      break
    case 'wave': {
      // side to side about its straight line
      const d = Math.hypot(s.vx, s.vy) || 1
      const w = m.amp * Math.PI * 2 * m.freq * Math.cos(age * Math.PI * 2 * m.freq) * s.side * dt
      s.x += (-s.vy / d) * w
      s.y += (s.vx / d) * w
      break
    }
    case 'return':
      if (!s.back && age >= m.at) (s.back = true), turnBy(Math.PI)
      break
    case 'zigzag':
      if (age >= (s.zig ?? m.every)) (s.zig = age + m.every), turnBy(((m.deg * Math.PI) / 180) * (s.side = -s.side))
      break
    case 'turn':
      if (!s.turned && age >= m.at) (s.turned = true), turnBy(((m.deg * Math.PI) / 180) * s.side)
      break
    case 'tick':
      // stops a moment every so often, then goes on as it was
      if ((age % m.every) > m.every - m.hold) return (s.held = true), null
      s.held = false
      break
    case 'retarget':
      // stops, then flies at where Mano is now
      if (age >= m.at && age < m.at + m.hold) return (s.held = true), null
      if (age >= m.at + m.hold && !s.aimed) {
        s.aimed = true
        s.held = false
        const p = run.player
        const d = Math.hypot(p.x - s.x, p.y - s.y) || 1
        s.vx = ((p.x - s.x) / d) * s.sp
        s.vy = ((p.y - s.y) / d) * s.sp
      }
      break
    case 'bounce': {
      const [x0, y0, x1, y1] = (run.extra && run.extra.box) || run.arena.bounds
      if (!s.bounced && (s.x < x0 + s.r || s.x > x1 - s.r)) (s.vx = -s.vx), (s.bounced = true)
      if (!s.bounced && (s.y < y0 + s.r || s.y > y1 - s.r)) (s.vy = -s.vy), (s.bounced = true)
      break
    }
    case 'split':
      if (age >= m.at) {
        // into n smaller ones, fanned out (360: all round)
        const a0 = Math.atan2(s.vy, s.vx)
        const spread = (m.spreadDeg * Math.PI) / 180
        const full = m.spreadDeg >= 360
        const out = []
        for (let i = 0; i < m.n; i++) {
          const a = full ? a0 + (i / m.n) * Math.PI * 2 : a0 + (m.n > 1 ? (i / (m.n - 1) - 0.5) * spread : 0)
          out.push({ ...s, vx: Math.cos(a) * s.sp, vy: Math.sin(a) * s.sp, r: s.r * 0.75, damage: s.damage * 0.6, mv: null, age: 0 })
        }
        return out
      }
      break
  }
  return null
}
// (the ordinary bosses' shooter, type C, puts its lanes and shots here too: game.js)
function shot(run, e, dx, dy, spec) {
  // (exactly on the lane that was shown)
  run.shots.push({ owner: e.id, x: e.x + dx * (e.r * 0.6), y: e.y + dy * (e.r * 0.6), vx: dx * spec.speed, vy: dy * spec.speed, r: spec.r, damage: spec.damage * e.damageMul, ttl: spec.ttl ?? 6, kind: spec.look || 'seed' })
}
export { hazard as addHazard, shot as fireShot }

// ── the ground and the air: warnings, blows, shots ──────────────────────────

export function updateHazards(run, dt, hurt) {
  const p = run.player
  const live = run.state === 'play'
  if (run.hazards.length) {
    for (const h of run.hazards) {
      if (h.kind === 'wave' || h.kind === 'band') {
        // a moving blow: whoever its front meets outside its gaps (once)
        if (run.t < h.at || run.t > h.until) continue
        if (!h.done) (h.done = true), run.events.push({ type: 'sweep', look: h.look })
        if (h.hit || !live) continue
        if (touchesAt(h, p.x, p.y, p.hitR, run.t)) {
          h.hit = true
          if (h.push) p.push = { vx: (h.axis === 'x' ? Math.sign(h.speed) : 0) * h.push, vy: (h.axis === 'y' ? Math.sign(h.speed) : 0) * h.push, until: run.t + 0.3 }
          if (p.inv <= 0) hurt(run, h.damage, 'blast')
        }
        continue
      }
      // a still blow lands once, at its time
      if (h.done || run.t < h.at) continue
      h.done = true
      if (h.harmless || !live) continue
      run.events.push({ type: 'blast', x: h.x, y: h.y, r: h.r || 0, look: h.look, kind: h.kind })
      if (p.inv <= 0 && touches(h, p.x, p.y, p.hitR)) hurt(run, h.damage, 'blast')
    }
    run.hazards = run.hazards.filter((h) => run.t < (h.until || h.at) + (h.keep ?? (h.harmless ? 0 : h.linger)))
  }
  if (run.shots.length) {
    // (shots fly the whole field: a boss off screen may shoot from there)
    const [x0, y0, x1, y1] = (run.extra && run.extra.box) || run.arena.bounds
    const out = []
    for (const s of run.shots) {
      if (s.mv) {
        const parts = shotMove(run, s, dt)
        if (parts) {
          out.push(...parts)
          continue
        }
      }
      if (s.seek > 0) {
        // a seeking orb turns toward Mano, at most `turn` rad/s
        s.seek -= dt
        const cur = Math.atan2(s.vy, s.vx)
        let d = Math.atan2(p.y - s.y, p.x - s.x) - cur
        d = Math.atan2(Math.sin(d), Math.cos(d))
        const a = cur + Math.max(-s.turn * dt, Math.min(s.turn * dt, d))
        const v = Math.hypot(s.vx, s.vy)
        s.vx = Math.cos(a) * v
        s.vy = Math.sin(a) * v
      }
      if (!s.held) {
        s.x += s.vx * dt
        s.y += s.vy * dt
      }
      s.ttl -= dt
      if (s.ttl <= 0 || s.x < x0 - 30 || s.x > x1 + 30 || s.y < y0 - 30 || s.y > y1 + 30) continue
      if (live && (s.x - p.x) ** 2 + (s.y - p.y) ** 2 < (s.r + p.hitR) ** 2) {
        if (p.inv <= 0) hurt(run, s.damage, 'shot')
        continue
      }
      out.push(s)
    }
    run.shots = out
  }
  p.slow = 1
  if (run.floors.length) {
    run.floors = run.floors.filter((f) => run.t < f.until)
    for (const f of run.floors) if ((p.x - f.x) ** 2 + (p.y - f.y) ** 2 < f.r * f.r) p.slow = Math.min(p.slow, f.slow)
  }
  if (p.push && run.t >= p.push.until) p.push = null
}
