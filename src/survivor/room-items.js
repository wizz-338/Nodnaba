// MANO SURVIVOR — 마노의 방 (room.js): which pieces the room has. Pure.
//
// The room fills with the coin stats' levels added up (data/room.json): each
// piece comes at its own total and stays. Nothing of it is stored: it is
// always made again from the save's levels.

// the coin stats' levels added up
export const roomTotal = (perma = {}) => Object.values(perma).reduce((a, n) => a + (Number.isFinite(n) && n > 0 ? n : 0), 0)
// the pieces there at a total
export const roomItems = (D, total) => D.room.items.filter((it) => total >= it.need)
// the next piece to come (null: the room is complete)
export const roomNext = (D, total) => D.room.items.find((it) => total < it.need) || null
