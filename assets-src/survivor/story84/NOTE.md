# 마노의 탱탱볼 모험 — 84-image story package (MANO_COMPLETE_84)

The originals (84 PNG, 181 MB, delivered as MANO_84_PART_01..08_OF_08.zip) are
**not** kept in the repository: they would make every clone and every Pages
deploy pull 181 MB. Kept here: the package's own README, image list, prompts
and index page.

- `src/survivor/data/story-assets.json` — the resource map: each image's id,
  use, region, its path in the package, the game file, sizes and the
  original's sha256 (to tell whether a package is the same one).
- `scripts/survivor-story-assets.py <MANO_COMPLETE_84 folder>` — rebuilds the
  game files (`src/survivor/assets/s84/`) from the originals.

Unpack all eight ZIPs into one folder (their `MANO_COMPLETE_84` folders merge),
then run the script on it. The package also carried a stray partial file,
`01_monsters/05_설산/.01_얼음늑대.png.gRBkKe` (not in image_list.json); it is ignored.
