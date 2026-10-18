// The village layout of save format v2 (the first MANO COLONY demo): a
// 20 × 34 tile map with fixed 2×2 lots. Kept only so old saves can be moved
// onto the new map (see save.js, migrate v2 → v3).

export const V2_LOTS = {
  A1: [3, 22],
  A2: [6, 22],
  A3: [12, 22],
  A4: [15, 22],
  A5: [3, 29],
  A6: [15, 29],
  B1: [3, 12],
  B2: [6, 12],
  B3: [14, 12],
  C1: [4, 2],
  C2: [14, 2],
}

// v2 work per level, to carry a half-built site over as a fraction
export const V2_WORK = {
  house: [12, 24, 40],
  lumber: [12, 24, 40],
  quarry: [12, 24, 40],
  storage: [14, 26, 42],
}

// v2 zones: A (start), B (forest), C (hill)
export const V2_ZONES = ['A', 'B', 'C']
