# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla-JS Tetris (HTML5 Canvas + CSS). Three source files, no `package.json`, no build step, no bundler, no transpiler, no test suite, no linter. Everything ships as-is to the browser.

## Running

```bash
start index.html            # Windows: open directly, works with no server
python3 -m http.server 8000 # or any static server; then http://localhost:8000
```

There is nothing to install, build, lint, or test. Verification is manual: open the page and play.

## Architecture

All game logic lives in `game.js` (~300 lines) as top-level functions over **module-global mutable state** (`board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId`). There are no classes, modules, or `export`s — the script is loaded with a plain `<script src>` and `init()` runs at the bottom of the file. New code should follow that style rather than introducing modules or a framework.

Key representations:

- `board` is a `ROWS × COLS` array of numbers: `0` = empty, `1–7` = piece type, which doubles as the index into `COLORS` and `PIECES`. Piece identity, board occupancy, and render color are the same value everywhere.
- A piece is `{ type, shape, x, y }` where `shape` is a square matrix filled with that piece's type number. Rotation is a fresh transpose+reverse matrix from `rotateCW`; `tryRotate` retries kicks `[0,-1,1,-2,2]` on the x axis only (no SRS kick tables, no wall kick on y).
- `collide(shape, ox, oy)` is the single spatial predicate — movement, rotation, ghost projection, and game-over detection all go through it. Anything new that moves a piece should test with it rather than reimplementing bounds checks.

Frame flow: `init()` → `spawn()` → `requestAnimationFrame(loop)`. `loop` accumulates `dt` into `dropAccum` and, past `dropInterval`, either drops one row or calls `lockPiece()` (= `merge` → `clearLines` → `spawn`). Rendering redraws the whole canvas every frame: grid, board, ghost (`globalAlpha 0.2`), then current piece.

Input is one `keydown` listener at the bottom of `game.js`; it early-returns when `paused || gameOver` (except `P`) and calls `updateHUD()` after every handled key.

## Gotchas

- **Canvas size is hardcoded in `index.html`.** Changing `COLS`, `ROWS`, or `BLOCK` in `game.js` requires updating `width`/`height` on `<canvas id="board">` to `COLS*BLOCK × ROWS*BLOCK`, otherwise the board renders scaled/clipped.
- **`loop` stops itself via the `gameOver || paused` guard placed after `draw()`, not via `endGame()`'s `cancelAnimationFrame`.** `lockPiece` (and therefore `endGame`) runs from inside `loop`, so cancelling the pending frame there is useless — `loop` would re-schedule right after. The guard draws one final frame, sets `animId = null`, and returns. Any new early-exit condition belongs in that guard, and nothing after it may re-schedule unconditionally.
- `init()` cancels the pending frame *first*, before rebuilding state, so a restart never leaves two loops running (which would double the drop speed).
- **UI strings and README are in Spanish**; code identifiers and comments are in English. Match that split.
