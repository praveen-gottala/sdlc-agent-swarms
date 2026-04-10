# Tic-Tac-Toe — Product Requirements Document

**Version:** 1.0  
**Status:** Draft  
**Complexity:** Mid  

---

## 1. Executive Summary

A browser-based Tic-Tac-Toe game with AI opponent, multiplayer support, match history, and configurable board sizes. Designed as a polished single-page app — not a toy demo, but a complete game experience with progression, theming, and replayability.

---

## 2. Target Users

**Casual Gamer:** Wants a quick 2-minute game. Expects smooth animations, satisfying win/draw feedback, and an AI that isn't trivially beatable.

**Competitive Player:** Wants to play against friends (local or online), track win/loss stats, and challenge themselves on larger boards (4×4, 5×5).

---

## 3. Functional Requirements

### 3.1 Game Modes

| Mode | Description | Priority |
|------|-------------|----------|
| **vs AI** | Play against computer with 3 difficulty levels | Must |
| **Local Multiplayer** | Two players on same device, alternating turns | Must |
| **Online Multiplayer** | Real-time match via shareable room code | Should |

### 3.2 AI Difficulty

- **Easy:** Random valid moves. Wins ~20% of the time.
- **Medium:** Blocks obvious wins, takes center/corners. Uses heuristic scoring. Wins ~50%.
- **Hard:** Minimax algorithm with alpha-beta pruning. Unbeatable on 3×3. Near-optimal on larger boards with depth-limited search.

### 3.3 Board Configuration

- **3×3** (classic) — win condition: 3 in a row
- **4×4** — win condition: 4 in a row
- **5×5** — win condition: 4 in a row (keeps games from dragging)

Board size is selected before a match starts. Cannot change mid-game.

### 3.4 Game Flow

```
Main Menu → Select Mode → (Select Difficulty if AI) → Select Board Size
  → Game Board → Play → Win/Draw/Loss Screen → Rematch / Back to Menu
```

- Turn indicator shows whose move it is (with avatar/color)
- 10-second move timer in online multiplayer (optional in other modes)
- Undo last move (single undo, local/AI modes only)
- Game auto-detects win, draw, or stalemate

### 3.5 Match History & Stats

- Persistent stats per player profile (stored locally, synced if online account exists)
- **Tracked:** wins, losses, draws, win streak, total games, win rate by board size, win rate by difficulty
- Match history: last 50 games with opponent, result, board size, duration, date
- Stats reset option

### 3.6 Theming & Customization

- 3 built-in themes: Classic (X/O), Emoji (🔥/❄️), Neon (dark mode with glow effects)
- Custom player markers (pick from 12 icon options)
- Sound effects: place marker, win, draw, error (with mute toggle)
- Animations: marker placement (scale-in), winning line highlight (glow + strike-through), board shake on draw

---

## 4. Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| First Contentful Paint | < 1.5s |
| Move response (AI hard, 3×3) | < 200ms |
| Move response (AI hard, 5×5) | < 1s |
| Bundle size | < 300KB gzipped |
| Offline support | Full gameplay (vs AI + local) works offline via service worker |
| Accessibility | WCAG AA — keyboard navigation, screen reader announcements for moves/wins |
| Browser support | Chrome, Firefox, Safari, Edge (last 2 versions) |
| Mobile responsive | Fully playable on 360px+ screens, touch-optimized tap targets (48px min) |

---

## 5. Data Model

### Player
| Field | Type | Notes |
|-------|------|-------|
| id | string (uuid) | Auto-generated |
| name | string | User-entered or "Player 1"/"Player 2" default |
| avatar | string (icon key) | From preset list |
| theme | enum | classic, emoji, neon |
| stats | PlayerStats | Embedded |

### PlayerStats
| Field | Type |
|-------|------|
| wins | number |
| losses | number |
| draws | number |
| currentStreak | number |
| bestStreak | number |
| gamesByBoardSize | Record<"3x3" \| "4x4" \| "5x5", {wins, losses, draws}> |
| gamesByDifficulty | Record<"easy" \| "medium" \| "hard", {wins, losses, draws}> |

### GameRecord
| Field | Type | Notes |
|-------|------|-------|
| id | string (uuid) | |
| boardSize | 3 \| 4 \| 5 | |
| mode | "ai" \| "local" \| "online" | |
| difficulty | "easy" \| "medium" \| "hard" \| null | null for non-AI |
| result | "win" \| "loss" \| "draw" | Relative to player 1 |
| moves | Array<{position: [row, col], player: "X" \| "O"}> | Full move sequence for replay |
| duration | number (seconds) | |
| timestamp | ISO datetime | |

### GameState (runtime, not persisted)
| Field | Type |
|-------|------|
| board | (null \| "X" \| "O")[][] |
| currentPlayer | "X" \| "O" |
| status | "playing" \| "won" \| "draw" |
| winner | "X" \| "O" \| null |
| winningCells | [row, col][] \| null |
| moveCount | number |
| timerRemaining | number \| null |

---

## 6. Screens

### 6.1 Main Menu
- Game title + animated logo
- Three mode buttons: vs AI, Local Multiplayer, Online (with "coming soon" badge if not built yet)
- Stats button → opens stats panel
- Settings button → theme picker, sound toggle, name editor
- Footer: version number

### 6.2 Game Setup
- Board size selector (3×3 / 4×4 / 5×5) with visual preview
- Difficulty selector (AI mode only) with description tooltips
- Player name inputs
- "Start Game" CTA

### 6.3 Game Board
- Responsive grid with clear cell boundaries
- Current turn indicator (top bar) with player name + marker
- Move timer bar (if enabled)
- Undo button (bottom left, disabled when no moves or in online mode)
- Forfeit/Quit button (bottom right, with confirmation dialog)
- Score display for current session (X wins – Draws – O wins)

### 6.4 Result Screen
- Large result text: "X Wins!" / "It's a Draw!"
- Winning line animation on the board (visible behind result overlay)
- Session score update
- Three buttons: Rematch (same settings), Change Settings, Back to Menu
- Confetti animation on win (subtle, 2-second burst)

### 6.5 Stats Panel
- Overall record: W-L-D with win percentage
- Current streak + best streak
- Breakdown by board size (bar chart)
- Breakdown by AI difficulty (bar chart)
- Last 10 matches list with result badges
- "Reset Stats" with confirmation modal

---

## 7. Technical Stack (Recommended)

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Framework | React + TypeScript | Component model fits game UI; strict typing prevents state bugs |
| Styling | Tailwind CSS | Utility-first, easy theming via CSS variables |
| State | Zustand | Lightweight, no boilerplate, good for game state |
| AI Engine | Pure TypeScript (minimax) | No server dependency, runs client-side |
| Persistence | localStorage | Stats + preferences; no backend needed for v1 |
| Online (future) | WebSocket (Socket.io or PartyKit) | Real-time turn sync |
| Build | Vite | Fast dev server, small production builds |
| Testing | Vitest + Playwright | Unit for game logic, e2e for full flows |

---

## 8. AI Implementation Notes

The minimax algorithm is the core differentiator between "toy" and "mid-complexity."

**3×3 board:** Full minimax with alpha-beta pruning. The state space (9! = 362,880 max nodes) is trivially searchable. Hard mode is provably unbeatable — always achieves win or draw.

**4×4 and 5×5 boards:** Depth-limited minimax (depth 6–8) with a heuristic evaluation function that scores based on: number of marks in each potential winning line, blocking opponent's near-complete lines, and center/corner control weighting. At medium difficulty, the heuristic is intentionally weakened (ignores blocking in 30% of cases).

**Move delay:** AI moves are instant computationally but displayed with a 300–600ms artificial delay so the game feels like the AI is "thinking." Without this, instant responses feel broken.

---

## 9. Acceptance Criteria (Key Scenarios)

1. **AI never loses on Hard 3×3.** Run 1,000 automated games with random player moves — AI must win or draw every game.
2. **Undo reverses exactly one move** and restores the previous player's turn. Undo on an empty board is a no-op.
3. **Win detection works for all orientations** — horizontal, vertical, both diagonals — on all three board sizes.
4. **Stats persist across browser sessions.** Close tab, reopen, stats are intact.
5. **Keyboard-only gameplay.** A user can navigate cells with arrow keys, place a marker with Enter/Space, and access all menus without a mouse.
6. **Mobile touch targets.** No tap target smaller than 48×48px. Board cells scale proportionally on small screens without requiring horizontal scroll.
7. **Theme switch is instant.** Changing theme mid-game updates all visuals without resetting the board.

---

## 10. Out of Scope (v1)

- Online multiplayer (deferred to v2 — requires server infrastructure)
- User accounts / cloud sync
- Leaderboards
- Tournament/bracket mode
- Board sizes beyond 5×5
- Custom win-condition lengths
- Spectator mode

---

## 11. Milestones

| Milestone | Scope | Estimate |
|-----------|-------|----------|
| **M1: Core Engine** | Game logic, win detection, AI (all difficulties), board sizes | 2 days |
| **M2: UI Shell** | All 5 screens, navigation, responsive layout, basic theme | 2 days |
| **M3: Polish** | Animations, sound, all themes, accessibility pass | 1.5 days |
| **M4: Stats & Persistence** | Match history, stat tracking, localStorage | 1 day |
| **M5: Testing & QA** | Unit tests for AI, e2e for critical flows, cross-browser check | 1.5 days |

**Total estimate:** ~8 days for a solo developer.

---

*— End of PRD —*