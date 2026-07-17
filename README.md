# Family Feud — Couch Party Edition

A multiplayer Family Feud for everyone in the same room: one phone hosts, one screen is the TV board, everyone else buzzes in on their phones. Real-time sync over Socket.IO, no database — games are in-memory sessions.

## Quick start (local)

```bash
npm install
npm run dev
```

- Vite dev server: http://localhost:5173 (open this on every device — use your computer's LAN IP, e.g. `http://192.168.1.x:5173`, for phones)
- Game server: port 3210 (proxied automatically; override with the `PORT` env var)

To let phones on your wifi reach the dev server, run Vite with `--host`:
`npm run dev:client -- --host` (plus `npm run dev:server` in another terminal), or just deploy it.

## How a game runs

1. **Host** taps *Create room* — a 4-letter code appears.
2. Point a big screen at the app and join with the code as **TV screen**.
3. Everyone else joins as **Player**; the host assigns them to teams on the *Players* panel.
4. Host picks a question — the panel suggests **5 random unplayed questions**; tap *🎲 New 5* to re-roll all of them, or *⇄ Swap* on one card to browse the full bank (grouped by category, searchable) and hand-pick its replacement. Playing a question automatically backfills its slot for the next round. Then the **face-off**: host selects one contestant per team, arms the buzzers, and the two contestants' phones turn into giant buzzer buttons. Fastest buzz wins (timing is **server-authoritative** — the server stamps arrival time; client clocks are never trusted).
5. Contestants/players say answers **out loud**; the host taps *Reveal* on matching answers or *Strike* for misses. Nothing is typed by players.
6. After the face-off winner's team chooses play/pass, the host taps *Team X plays*.
7. Three strikes → automatic **steal** phase for the other team (one guess).
8. Host banks the pot to the winning team (*Bank → Team*), flips any remaining answers for the reveal-through, and hits *Next round*.
9. Optional **⚡ Fast Money**: 5 quick questions × 2 passes. Players answer aloud; the host matches each answer from a dropdown and reveals them one by one on the TV with a running total (200 to win).

Also on the host panel: score nudge buttons (±5/±10/±25), round multiplier (×1/×2/×3), strike undo, buzzer re-arm, rename teams, remove players.

Reconnects are handled: every device keeps a stable client id, so a page refresh or wifi blip re-attaches you to your seat (team, role, and host status survive).

## Deploying to Render

The repo includes `render.yaml`, so you can create a **Blueprint** from it — or set up a single Web Service manually:

- **Build command:** `npm install && npm run build`
- **Start command:** `npm start`
- **Environment:** Node 20+

One service does everything: Express serves the built client from `dist/client` and Socket.IO rides the same HTTP server, so websockets work out of the box on Render. Note the free tier spins down when idle — the first visit after a break takes ~30s to wake.

## The question bank

~148 board questions ship in two files:

- [server/questions.ts](server/questions.ts) — the starter set, plus the place to add your own
- [server/questions-classpoint.ts](server/questions-classpoint.ts) — 130 questions imported from the ClassPoint "131 Most Hilarious Family Feud Questions" PDF (one duplicate dropped)

A question looks like:

```ts
{
  id: 'q19',                        // any unique string
  prompt: 'Name something…',
  category: 'Food & Drink',         // groups it in the host's question browser
  answers: [
    { text: 'Top answer', points: 40 },   // list in descending points
    { text: 'Second', points: 25 },
    // 4–8 answers, totals near 100 feel right
  ],
}
```

Append to `questionBank` (main board rounds) or `fastMoneyBank` (Fast Money draws 5 per round). Restart the server and they appear in the host's picker. Categories are free-form strings — new ones just become new groups in the browser. Current categories: Around the House, Animals & Nature, Body & Health, Food & Drink, Grab Bag, Kids & Family, Love & Marriage, People & Habits, Places, Silly & Hypothetical, Wordplay & Fill-Ins, Work & Money.

## Tests

```bash
npm test        # vitest — game engine rules
npm run typecheck
```

The whole rule engine (buzzer ordering, strikes/steal transitions, pot & multiplier math, answer redaction per role, Fast Money scoring) is a pure class in [server/game.ts](server/game.ts) with no socket code, covered by [server/game.test.ts](server/game.test.ts).

## Layout

```
server/index.ts     Socket.IO wiring, rooms, static serving
server/game.ts      Game rules (pure, unit-tested)
server/questions.ts Question banks — edit me!
shared/types.ts     Types shared by client & server
src/App.tsx         Join flow + role routing
src/views/          HostView / TVView / PlayerView
src/components/     Board, strike overlay, score bar
```
