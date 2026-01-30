# Skib

Realtime, browser-based drawing + guessing party game (Skribbl-style) built with Express and Socket.IO. This is an AI-generated project.

## Run
1. `npm install`
2. `npm start`
3. Open `http://localhost:3000`

## Gameplay
- 5 rounds, 60 seconds each
- Drawer rotates in join order
- Drawer chooses from 6 words or a custom word (once per player per game)
- Hints reveal letters at 45s, 20s, 10s, 5s
- Scoring: guesser gets max(10, ceil(time/2)); drawer gets +5 per correct guess

## Controls
- Brush / bucket fill
- Scroll to change brush size
- Hold Shift for straight lines
- Undo / clear (drawer only)
- Chat to guess
- Mute / volume slider for SFX

## Project layout
- `server.js` — game state + Socket.IO server
- `public/index.html` — single-page client (UI + canvas + audio)
