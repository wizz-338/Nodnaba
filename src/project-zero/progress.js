// What is open, given the puzzles the server says are solved. Pure functions.

export const isSolved = (solved, pid) => Object.prototype.hasOwnProperty.call(solved, pid)

export function puzzleOpen(c, solved, pid) {
  const i = c.puzzles.findIndex((p) => p.id === pid)
  return i >= 0 && c.puzzles.slice(0, i).every((p) => isSolved(solved, p.id))
}

export const evidenceOpen = (solved, ev) => !ev.unlockedBy || isSolved(solved, ev.unlockedBy)

export const openEvidence = (c, solved) => c.evidence.filter((e) => evidenceOpen(solved, e))

export const unlockedBy = (c, pid) => c.evidence.filter((e) => e.unlockedBy === pid)

export const nextPuzzle = (c, solved) => c.puzzles.find((p) => !isSolved(solved, p.id)) ?? null

export const allSolved = (c, solved) => c.puzzles.every((p) => isSolved(solved, p.id))

export function stats(c, solved, local) {
  const sum = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0)
  const hints = sum(local.hints)
  const wrong = sum(local.wrong)
  const open = openEvidence(c, solved)
  return {
    solved: c.puzzles.filter((p) => isSolved(solved, p.id)).length,
    total: c.puzzles.length,
    hints,
    wrong,
    viewed: local.viewed.filter((id) => open.some((e) => e.id === id)).length,
    open: open.length,
    rank: hints === 0 && wrong <= 2 ? 'S' : hints <= 3 && wrong <= 6 ? 'A' : hints <= 8 ? 'B' : 'C',
    durationMs: local.startedAt && local.completedAt ? local.completedAt - local.startedAt : null,
  }
}
