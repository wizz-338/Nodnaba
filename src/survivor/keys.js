// MANO SURVIVOR — moving Mano with the keyboard (the PC game). Pure: no DOM.

// keys that move Mano: physical keys (KeyboardEvent.code), so WASD works on a
// Korean keyboard layout (ㅈㅁㄴㅇ) too, and arrows and WASD mix freely
export const MOVE_KEYS = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
}

// the direction of the keys held: their sum made length 1 (a diagonal is no
// faster than a straight line); opposite keys cancel; nothing held, still
export function keyVector(held) {
  let x = 0
  let y = 0
  for (const code of held) {
    const v = MOVE_KEYS[code]
    if (v) ((x += v[0]), (y += v[1]))
  }
  // W and ↑ together are still one "up"
  x = Math.sign(x)
  y = Math.sign(y)
  const d = Math.hypot(x, y)
  return d ? { x: x / d, y: y / d } : { x: 0, y: 0 }
}
