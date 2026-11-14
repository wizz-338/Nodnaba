# PROJECT ZERO (`#/artist/tizzzz/project-zero`)

Admin-only test page for PROJECT ZERO v0.1.0 (CASE 001 "최후의 거래"), entered from the card in
Tizzzz's large view on ARTIST (`EntryCard.jsx`, `entry-card.css`). The first address `#/project-zero`
still works: it is moved to the same place under the new one. Not in the site menu.

- **No case content in this repository.** The briefing, evidence, puzzles, hints, answers,
  clues and epilogue live only in Supabase. The schema is `supabase/project-zero.sql`;
  the content goes in with a private seed file that is never committed.
- **Access:** the guestbook's admin sign-in (Supabase Auth, email + password) and the
  same `guestbook_admins` check. Without an admin session the page shows only a sign-in
  screen and receives nothing; RLS and the functions' own checks enforce it on the server.
- **Answers are checked on the server** (`pz_verify_answer`). The page never knows an answer.
  A clue comes back only for a correct answer; the epilogue only once all five are solved.
- **Saved:** which puzzles are solved → the server (`pz_attempts`, so it survives a refresh
  or another phone). Investigator name, documents read, hints shown, wrong answers and
  notes → this phone's localStorage (`nodnaba:project-zero:save`, versioned; a broken
  record is backed up to `…:backup` and started clean).
- **Not set up yet** (no Supabase settings in the build, or the SQL not run): a "준비 중" screen.

Files: `ProjectZeroPage.jsx` (sign-in gate, state, screen routing), `api.js` (every Supabase
call), `routes.js` (`#/project-zero/...` addresses), `save.js`, `progress.js`, `ui.jsx`,
`screens/`, `pz.css` (every rule under `.pz`, so the site's styles are untouched).
The site itself only gained the route (`src/route.js`) and the lazy page (`src/App.jsx`).
