// MANO SURVIVOR — the red ball against the friend cats: real damage per
// second (what the monsters really lost, overkill apart), measured.
//
//   node scripts/survivor-cats-dps.mjs bench [chapter=10] [seeds=4]
//     A still Mano among monsters kept at a set number (a fallen one is
//     replaced somewhere around her) — few (4), many (30) — or one boss that
//     cannot fall. After k cards of one line (ball: 개수, 피해, 주기, 반사 in
//     turn; cat: 친구냥이 first, then 발톱 갈기, 친구냥이, 빠르게 할퀴기, 뚱냥이,
//     스피드냥이 in turn), 20 s are measured: ball and cat DPS, overkill,
//     balls that hit nothing, scratches that hit nothing, the cats' time
//     scratching (uptime), and the time a game step takes.
//   node scripts/survivor-cats-dps.mjs ai [chapter=10] [seeds=6]
//     The friend cats alone (the ball held back) with set builds — 4 cats,
//     8 cats (with 발톱 갈기 and 뚱냥이), 16 cats — in three scenes: many (30
//     monsters of four kinds coming from every side, a fallen one replaced),
//     boss (one boss that cannot fall), mixed (that boss and 25 monsters);
//     the monsters as strong as at 2:00 into the chapter.
//     20 s measured: the monsters' real loss a second, overkill, kills, how
//     many cats were on the monster each scratch struck (and the most on one
//     monster at a time), scratches at a fallen target, target changes, the
//     time a step takes. For comparing the targeting before and after.
//   node scripts/survivor-cats-dps.mjs runs [seeds=12] [chapters=6,10,15,20]
//     Whole chapters played by the bot (survivor-bot.mjs) with three ways of
//     picking: A ball (the ball's cards first, rerolls for them), B cat (the
//     cats' cards first, rerolls for them), C unlucky (the first card shown,
//     no rerolls; POLICIES=…,mixed adds both lines in turn). Clear %, time, mob kills a minute before the boss, the
//     boss's time, DPS by source, overkill and misses, picks of each line.
// FIELD=pc plays the runs on the PC game's field.
// CAT_TUNE='{"friendCats": {…}, "effects": {"catClaw": {…}}}' tries other
// numbers over balance.json's (for tuning; nothing is written).
// A bot is not a person: these numbers show trends, not win rates.
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads'
import os from 'os'

// what a player has on arrival (about what survivor-campaign.mjs's bots have)
export const LOAD = {
  6: { grade: 'S', perma: { hp: 14, damage: 15, interval: 15, crit: 8, move: 3, coins: 2 } },
  10: { grade: 'S', perma: { hp: 30, damage: 32, interval: 32, crit: 18, move: 6, coins: 4 } },
  15: { grade: 'SS', perma: { hp: 46, damage: 48, interval: 48, crit: 28, move: 8, coins: 6 } },
  20: { grade: 'SSS', perma: { hp: 62, damage: 64, interval: 64, crit: 38, move: 10, coins: 8 } },
}
const BALL = ['count', 'damage', 'interval', 'bounce']
const CAT = ['catSummon', 'catClaw', 'catSummon', 'catRate', 'catSize', 'catSpeed']

async function data() {
  const { D } = await import('./survivor-data.mjs')
  const T = JSON.parse(process.env.CAT_TUNE || '{}')
  if (T.friendCats) Object.assign(D.balance.friendCats, T.friendCats)
  for (const [k, v] of Object.entries(T.effects || {})) Object.assign(D.balance.upgrades.effects[k], v)
  return D
}

async function bench({ chapter, seed, line, k, scene }) {
  const D = await data()
  const G = await import('../src/survivor/game.js')
  const run = G.createRun(D, { chapter, weaponId: 'bouncy_ball', seed, cats: true, rerolls: 0, ...LOAD[chapter] })
  run.player.hp = run.player.maxHp = 1e15
  run.nextEvent = 1e9
  const order = line === 'ball' ? BALL : CAT
  for (let i = 0; i < k; i++) {
    const id = order[i % order.length]
    run.state = 'levelup'
    run.pending = 1
    run.choices = [id]
    G.choose(run, id, run.choiceSeq)
  }
  run.state = 'play'
  const p = run.player
  const want = scene === 'boss' ? 1 : scene === 'many' ? 30 : 4
  const place = () => {
    const a = run.rng() * Math.PI * 2
    const d = 70 + run.rng() * 130
    const [x0, y0, x1, y1] = run.view
    return { x: Math.max(x0 + 20, Math.min(x1 - 20, p.x + Math.cos(a) * d)), y: Math.max(y0 + 20, Math.min(y1 - 20, p.y + Math.sin(a) * d)) }
  }
  const keep = () => {
    run.spawnT = -1e9
    const live = run.enemies.filter((e) => e.state === 'live' || e.state === 'spawn').length
    for (let i = live; i < want; i++) {
      const e = G.spawnAt(run, scene === 'boss' ? 'boss' : 'imp', place())
      if (e && scene === 'boss') (e.hp = e.maxHp = 1e15), (e.speed = 12)
    }
  }
  const input = { x: 0, y: 0 }
  let t0 = null
  let snap = null
  let ms = 0
  let steps = 0
  for (let t = 0; t < 23; t += G.FIXED) {
    keep()
    const a = performance.now()
    G.step(run, G.FIXED, input)
    ms += performance.now() - a
    steps++
    run.events.length = 0
    if (run.state !== 'play') run.state = 'play'
    p.hp = 1e15
    if (t >= 3 && !snap) (snap = JSON.parse(JSON.stringify(run.stats))), (t0 = run.t), (snap.kills = run.kills)
  }
  const T = run.t - t0
  const by = (s, k2) => (s.by[k2] || { raw: 0, eff: 0, over: 0, hits: 0 })
  const d = (k2, f) => by(run.stats, k2)[f] - by(snap, k2)[f]
  const S = run.stats
  const diff = (f) => (S[f] || 0) - (snap[f] || 0)
  return {
    chapter, line, k, scene,
    ball: d('ball', 'eff') / T,
    cat: d('cat', 'eff') / T,
    ballOver: d('ball', 'raw') ? d('ball', 'over') / d('ball', 'raw') : 0,
    catOver: d('cat', 'raw') ? d('cat', 'over') / d('cat', 'raw') : 0,
    miss: diff('launched') + diff('children') ? diff('missed') / (diff('launched') + diff('children')) : 0,
    whiff: diff('catSwings') ? diff('catWhiffs') / diff('catSwings') : 0,
    uptime: diff('catBusy') + diff('catChase') + diff('catIdle') ? diff('catBusy') / (diff('catBusy') + diff('catChase') + diff('catIdle')) : 0,
    kills: (run.kills - snap.kills) / T,
    cats: run.friends.length,
    stepMs: ms / steps,
  }
}

// the set cat builds of the 'ai' mode
const BUILDS = {
  '4 cats': ['catSummon', 'catSummon', 'catSummon', 'catSummon', 'catClaw', 'catClaw'],
  '8 cats': [...Array(8).fill('catSummon'), 'catClaw', 'catClaw', 'catSize', 'catSize', 'catRate'],
  '16 cats': [...Array(16).fill('catSummon'), 'catClaw', 'catClaw', 'catSize', 'catRate'],
}
const MOBS = ['imp', 'slime', 'bone_beast', 'spider']

async function ai({ chapter, seed, build, scene }) {
  const D = await data()
  const G = await import('../src/survivor/game.js')
  const run = G.createRun(D, { chapter, weaponId: 'bouncy_ball', seed, cats: true, rerolls: 0, ...LOAD[chapter] })
  run.player.hp = run.player.maxHp = 1e15
  run.nextEvent = 1e9
  for (const id of BUILDS[build]) {
    run.state = 'levelup'
    run.pending = 1
    run.choices = [id]
    G.choose(run, id, run.choiceSeq)
  }
  run.state = 'play'
  // the middle of a fight (2:00): the monsters as strong as then
  run.t = 120
  const p = run.player
  const mobs = scene === 'boss' ? 0 : scene === 'mixed' ? 25 : 30
  let boss = null
  // from every side, at the screen's edge or so: they come at Mano
  const place = () => {
    const a = run.rng() * Math.PI * 2
    const d = 120 + run.rng() * 140
    const [x0, y0, x1, y1] = run.view
    return { x: Math.max(x0 + 14, Math.min(x1 - 14, p.x + Math.cos(a) * d)), y: Math.max(y0 + 14, Math.min(y1 - 14, p.y + Math.sin(a) * d)) }
  }
  const keep = () => {
    run.spawnT = -1e9
    run.fireT = 1e9 // the ball held back: the cats alone
    if (scene !== 'many' && (!boss || (boss.state !== 'live' && boss.state !== 'spawn'))) {
      boss = G.spawnAt(run, 'boss', { x: p.x, y: p.y - 120 })
      if (boss) (boss.hp = boss.maxHp = 1e15), (boss.speed = 12)
    }
    const live = run.enemies.filter((e) => (e.state === 'live' || e.state === 'spawn') && e !== boss).length
    for (let i = live; i < mobs; i++) G.spawnAt(run, MOBS[Math.floor(run.rng() * MOBS.length)], place())
  }
  let t0 = null
  let snap = null
  let ms = 0
  let steps = 0
  let most = 0
  let spreadSum = 0
  let spreadN = 0
  let nextLook = 0
  for (let t = 0; t < 23; t += G.FIXED) {
    keep()
    const a = performance.now()
    G.step(run, G.FIXED, { x: 0, y: 0 })
    ms += performance.now() - a
    steps++
    run.events.length = 0
    if (run.state !== 'play') run.state = 'play'
    p.hp = 1e15
    if (t >= 3 && !snap) (snap = JSON.parse(JSON.stringify(run.stats))), (t0 = run.t), (snap.kills = run.kills)
    // every 0.25 s: the most cats on one monster, and distinct targets per cat
    if (snap && t >= nextLook) {
      nextLook = t + 0.25
      const n = new Map()
      for (const c of run.friends) if (c.target && c.target.state === 'live') n.set(c.target.id, (n.get(c.target.id) || 0) + 1)
      if (n.size) {
        let m = 0
        for (const [id, k2] of n) if (!(boss && id === boss.id)) m = Math.max(m, k2)
        most = Math.max(most, m)
        spreadSum += n.size / run.friends.length
        spreadN++
      }
    }
  }
  const T = run.t - t0
  const S = run.stats
  const by = (s2) => s2.by.cat || { raw: 0, eff: 0, over: 0, hits: 0, kills: 0, boss: 0 }
  const d = (f) => by(S)[f] - by(snap)[f]
  const diff = (f) => (S[f] || 0) - (snap[f] || 0)
  return {
    chapter, build, scene,
    dps: d('eff') / T,
    bossDps: d('boss') / T,
    mobDps: (d('eff') - d('boss')) / T,
    over: d('raw') ? d('over') / d('raw') : 0,
    kills: d('kills') / T,
    perTarget: diff('catStrikes') ? diff('catStrikeClaims') / diff('catStrikes') : 0,
    most,
    spread: spreadN ? spreadSum / spreadN : 0,
    dead: diff('catSwings') ? diff('catDeadSwings') / diff('catSwings') : 0,
    whiff: diff('catSwings') ? diff('catWhiffs') / diff('catSwings') : 0,
    switches: diff('catSwitches') / T / run.friends.length,
    swings: diff('catSwings') / T / run.friends.length,
    uptime: diff('catBusy') + diff('catChase') + diff('catIdle') ? diff('catBusy') / (diff('catBusy') + diff('catChase') + diff('catIdle')) : 0,
    stepMs: ms / steps,
  }
}

async function playOne({ chapter, seed, policy }) {
  const D = await data()
  const { playRun } = await import('./survivor-bot.mjs')
  const t0 = performance.now()
  const arena = process.env.FIELD === 'pc' ? D.balance.logicalArenaPc : D.balance.logicalArena
  const { run } = playRun(D, { policy, seed: seed * 7919 + chapter, chapter, cats: true, rerolls: 2, ...LOAD[chapter], arena, maxTime: 420 })
  const ms = performance.now() - t0
  const S = run.stats
  const by = (k2) => S.by[k2] || { raw: 0, eff: 0, over: 0, hits: 0, kills: 0, boss: 0 }
  const lines = { ball: 0, cat: 0, other: 0 }
  for (const id of run.log) lines[BALL.includes(id) ? 'ball' : id.startsWith('cat') ? 'cat' : 'other']++
  return {
    chapter, policy, seed,
    clear: !!(run.result && run.result.cleared),
    t: run.t,
    preBossKpm: S.preBossKills ? (S.preBossKills * 60) / 210 : 0,
    bossT: S.bossDownAt && S.bossAt ? S.bossDownAt - S.bossAt : null,
    ball: by('ball').eff / run.t,
    cat: by('cat').eff / run.t,
    bless: by('bless').eff / run.t,
    ballBoss: by('ball').boss,
    catBoss: by('cat').boss,
    ballOver: by('ball').raw ? by('ball').over / by('ball').raw : 0,
    catOver: by('cat').raw ? by('cat').over / by('cat').raw : 0,
    miss: S.launched + S.children ? S.missed / (S.launched + S.children) : 0,
    whiff: S.catSwings ? (S.catWhiffs || 0) / S.catSwings : 0,
    uptime: S.catBusy ? S.catBusy / (S.catBusy + (S.catChase || 0) + (S.catIdle || 0)) : 0,
    level: run.level,
    cats: run.cat.n,
    lines,
    rerolls: S.rerolls || 0,
    msPerSec: ms / run.t,
  }
}

if (!isMainThread && workerData && workerData.mode) {
  const out = []
  for (const j of workerData.jobs) out.push(workerData.mode === 'bench' ? await bench(j) : workerData.mode === 'ai' ? await ai(j) : await playOne(j))
  parentPort.postMessage(out)
} else if (process.argv[1] && process.argv[1].endsWith('survivor-cats-dps.mjs')) {
  const mode = process.argv[2] || 'bench'
  const jobs = []
  if (mode === 'ai') {
    const ch = +process.argv[3] || 10
    const seeds = +process.argv[4] || 6
    for (const scene of ['many', 'boss', 'mixed']) for (const build of Object.keys(BUILDS)) for (let s = 1; s <= seeds; s++) jobs.push({ chapter: ch, seed: s * 31, build, scene })
  } else if (mode === 'bench') {
    const ch = +process.argv[3] || 10
    const seeds = +process.argv[4] || 4
    for (const scene of ['few', 'many', 'boss']) for (const line of ['ball', 'cat']) for (const k of [0, 1, 2, 3, 4, 6, 8, 10, 12]) for (let s = 1; s <= seeds; s++) jobs.push({ chapter: ch, seed: s, line, k, scene })
  } else {
    const seeds = +process.argv[3] || 12
    const chs = (process.argv[4] || '6,10,15,20').split(',').map(Number)
    const POL = (process.env.POLICIES || 'ballFocus,catFocus,unlucky').split(',')
    for (const chapter of chs) for (const policy of POL) for (let s = 1; s <= seeds; s++) jobs.push({ chapter, seed: s, policy })
  }
  const T = os.cpus().length
  const parts = Array.from({ length: T }, (_, i) => jobs.filter((_, k) => k % T === i))
  const res = (await Promise.all(parts.map((p) => new Promise((ok, no) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { jobs: p, mode }, env: process.env })
    w.once('message', ok)
    w.once('error', no)
  })))).flat()
  const avg = (list, f) => (list.length ? list.reduce((a, r) => a + f(r), 0) / list.length : 0)
  const n0 = (v) => Math.round(v).toLocaleString('en-US')
  const pc = (v) => `${Math.round(v * 100)}%`
  if (mode === 'ai') {
    console.log(`the cats alone, chapter ${res[0].chapter} loadout; ${JSON.stringify(Object.fromEntries(Object.entries(BUILDS).map(([k, v]) => [k, v.length + ' cards'])))}`)
    console.log('scene  build    DPS (mobs + boss)            over  kills/s  cats/target  most on one  targets/cat  dead-target  whiff  switches/cat/s  swings/cat/s  uptime  step ms')
    for (const scene of ['many', 'boss', 'mixed'])
      for (const build of Object.keys(BUILDS)) {
        const R = res.filter((r) => r.scene === scene && r.build === build)
        console.log(`${scene.padEnd(6)} ${build.padEnd(8)} ${n0(avg(R, (r) => r.dps)).padStart(9)} (${n0(avg(R, (r) => r.mobDps))} + ${n0(avg(R, (r) => r.bossDps))})`.padEnd(48) + `${pc(avg(R, (r) => r.over)).padStart(4)}  ${avg(R, (r) => r.kills).toFixed(1).padStart(6)}  ${avg(R, (r) => r.perTarget).toFixed(2).padStart(10)}  ${Math.max(...R.map((r) => r.most)).toString().padStart(10)}  ${avg(R, (r) => r.spread).toFixed(2).padStart(10)}  ${pc(avg(R, (r) => r.dead)).padStart(10)}  ${pc(avg(R, (r) => r.whiff)).padStart(5)}  ${avg(R, (r) => r.switches).toFixed(2).padStart(13)}  ${avg(R, (r) => r.swings).toFixed(2).padStart(12)}  ${pc(avg(R, (r) => r.uptime)).padStart(6)}  ${avg(R, (r) => r.stepMs).toFixed(3)}`)
      }
  } else if (mode === 'bench') {
    console.log(`bench, chapter ${res[0].chapter} loadout ${JSON.stringify(LOAD[res[0].chapter])}; DPS = what the monsters really lost a second`)
    for (const scene of ['few', 'many', 'boss']) {
      console.log(`\n${scene === 'few' ? '4 monsters' : scene === 'many' ? '30 monsters' : 'one boss'}:`)
      console.log('  k | ball line: total DPS (ball)  over  miss  kills/s | cat line: total DPS (ball + cat)  cat over  whiff  uptime  kills/s  step ms')
      for (const k of [0, 1, 2, 3, 4, 6, 8, 10, 12]) {
        const A = res.filter((r) => r.scene === scene && r.line === 'ball' && r.k === k)
        const B = res.filter((r) => r.scene === scene && r.line === 'cat' && r.k === k)
        console.log(`  ${String(k).padStart(2)} | ${n0(avg(A, (r) => r.ball + r.cat)).padStart(12)}  ${pc(avg(A, (r) => r.ballOver)).padStart(4)}  ${pc(avg(A, (r) => r.miss)).padStart(4)}  ${avg(A, (r) => r.kills).toFixed(1).padStart(5)} | ${n0(avg(B, (r) => r.ball + r.cat)).padStart(12)} (${n0(avg(B, (r) => r.ball))} + ${n0(avg(B, (r) => r.cat))})  ${pc(avg(B, (r) => r.catOver)).padStart(4)}  ${pc(avg(B, (r) => r.whiff)).padStart(4)}  ${pc(avg(B, (r) => r.uptime)).padStart(4)}  ${avg(B, (r) => r.kills).toFixed(1).padStart(5)}  ${avg(B, (r) => r.stepMs).toFixed(3)}`)
      }
    }
  } else {
    console.log(`whole chapters on the ${process.env.FIELD === 'pc' ? 'PC' : 'phone'} field, bot movement "good"; A ballFocus, B catFocus, C unlucky (first card shown, no rerolls)`)
    console.log('ch  policy     clear  time  mobs/min  boss s  ballDPS  catDPS  ball over/miss  cat over/whiff/up  level  picks ball/cat/other  cats  ms per game s')
    for (const ch of [...new Set(res.map((r) => r.chapter))]) {
      for (const policy of ['ballFocus', 'catFocus', 'unlucky', 'mixed']) {
        const R = res.filter((r) => r.chapter === ch && r.policy === policy)
        if (!R.length) continue
        const bt = R.filter((r) => r.bossT !== null)
        console.log(`${String(ch).padStart(2)}  ${policy.padEnd(9)}  ${pc(avg(R, (r) => r.clear)).padStart(4)}  ${n0(avg(R, (r) => r.t)).padStart(4)}  ${n0(avg(R, (r) => r.preBossKpm)).padStart(8)}  ${bt.length ? n0(avg(bt, (r) => r.bossT)).padStart(6) : '     -'}  ${n0(avg(R, (r) => r.ball)).padStart(7)}  ${n0(avg(R, (r) => r.cat)).padStart(6)}  ${pc(avg(R, (r) => r.ballOver))}/${pc(avg(R, (r) => r.miss))}  ${pc(avg(R, (r) => r.catOver))}/${pc(avg(R, (r) => r.whiff))}/${pc(avg(R, (r) => r.uptime))}  ${avg(R, (r) => r.level).toFixed(1)}  ${avg(R, (r) => r.lines.ball).toFixed(1)}/${avg(R, (r) => r.lines.cat).toFixed(1)}/${avg(R, (r) => r.lines.other).toFixed(1)}  ${avg(R, (r) => r.cats).toFixed(1)}  ${avg(R, (r) => r.msPerSec).toFixed(1)}`)
      }
    }
  }
}
