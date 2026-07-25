# Festival 8-Ball 🎱

Shake your phone to decide which festival act to go see — a magic 8-ball for
festival FOMO. Currently loaded with the **Hardly Strictly Bluegrass** schedule.

## Features
- **Single pick** — shake (or tap the ball) to get one act playing *right now*,
  or at any time you set later in the day.
- **Plan my evening** — build a conflict-free itinerary across the rest of the
  day. Star your **must-sees** and the plan locks them in and fills the gaps
  around them, with walking buffers between stages.
- Day + stage filters, works offline (PWA), installable to your home screen.

## Stack
Static site — vanilla HTML/CSS/JS, no build step. Schedule lives in
`schedule.json`. Service worker (`sw.js`) is network-first with offline
fallback.

## Run locally
```bash
python3 -m http.server 8757
# then open http://localhost:8757
```
(Needs to be served over HTTP — `file://` won't work because of `fetch()` and
the service worker.)

## Updating the schedule
Edit `schedule.json`. Format: a festival with `days`, `stages`, and `sets`
(each set = day, stage id, artist, `start`/`end` in 24h `HH:MM`).
