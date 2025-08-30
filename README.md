# dwdw — Spotify Visual VJ (static GitHub Pages app)

A single-page app that authorizes with Spotify via Authorization Code Flow with PKCE, then either:
- plays back inside the page via the Web Playback SDK (Spotify Premium required), or
- controls your currently active Spotify device using the Web API.

Audio-reactive visuals, a Director timeline, VJ keyboard/MIDI mapping, and a Quality panel are built-in. No secrets in this repo.

Important limitations about "real-time" analysis with Spotify:
- The Spotify Web Playback SDK and Web API do not provide raw PCM audio to the web page. Browsers cannot access the actual stream for FFT or spectral analysis.
- This app uses a hybrid approach:
  - Beat/bar/sections/downbeats/tempo/chroma/loudness trends come from the Spotify Audio Analysis endpoints, aligned to the track progress for accurate timing.
  - Energy band and "FFT-like" dynamics are approximated from segment timbre/pitches and smoothed envelopes.
  - Optional "Preview Analysis" developer mode may analyze the 30s `preview_url` (when available) locally via Web Audio to drive visuals, but it won't be perfectly in sync with your actual playback.
- If you need true real-time FFT on the exact audio, you must provide an audio source the browser can analyze (e.g., a local file or microphone/loopback), not the protected Spotify stream.

## Features

- Auth: Authorization Code Flow with PKCE (no client secret in frontend).
- Playback:
  - Web Playback SDK for in-page audio (Premium users).
  - Device control for non-Premium (play/pause, prev/next, seek, volume, device picker).
- Visual Scenes (hot-swappable, 5 implemented):
  - Particles: GPU instanced points with curl-like flow, 1–5M.
  - Fluid 2D: ping-pong shader sim with dye injection, beat-synced pulses.
  - Ray-marched SDF Tunnel: kaleidoscope/glow with soft shadows-ish.
  - Terrain/Heightfield: band-reactive displacement and palette gradients.
  - Typography: variable motion overlays driven by envelopes.
- Director / VJ:
  - Scene presets and auto-cinematic mode (selects style per track).
  - Crossfade/morph at phrase boundaries (4 bars by default).
  - Timeline cues (“explode at bar 33”, “scene:fluid”, etc.), persisted per track in IndexedDB/localStorage.
  - Keyboard and Web MIDI mapping for macro knobs (intensity, bloom, glitch, speed).
  - Record canvas output to WebM.
- Album Cover Palette:
  - Dominant/secondary color extraction from album art.
  - Applied to CSS variables, UI theme, and shader palettes.
- Quality panel (“Expensive”):
  - Render scale, MSAA, TAA toggle (pseudo), bloom, SSAO toggle, motion blur/DOF toggles (stubs), filmic tonemap style, chromatic aberration.
  - Raymarch steps/soft shadow samples.
  - Particle count, fluid grid res and iterations.
  - Optional WebGPU path-trace demo flag (stub hook).
- Performance:
  - Adaptive frame-time governor to stabilize 60/120 FPS.
  - Lazy-load heavy scenes post-auth.
  - IndexedDB caching of album covers and track metadata with ETags.
  - Backoff for API rate limits, smooth token refresh.
- Accessibility:
  - Epilepsy-safe mode, intensity limiter.
  - Reduced-motion and high-contrast modes.
  - Screensaver/ambient mode after 30s idle, wakes on track change.

## Project setup

Tech: Vite + TypeScript + Three.js (no server).

Repo: `belisario-afk/dwdw`

- Directory structure:
  ```
  /src
    /auth
    /spotify
    /audio            (hybrid analysis via Spotify Analysis API; optional preview analysis)
    /visuals/scenes   (Particles, Fluid2D, Tunnel, Terrain, Typography)
    /controllers      (director timeline, VJ mappings, quality/perf)
    /ui               (DOM wiring)
    /utils            (palette, idb, fps, rate-limiter)
    /recording        (WebM recorder)
  /public             (worklets/workers placeholders)
  ```

### Spotify Dashboard

1) Create an app at https://developer.spotify.com/dashboard
2) Add Redirect URIs:
   - Production: `https://belisario-afk.github.io/dwdw/callback`
   - Local dev: `http://127.0.0.1:5173/callback`
3) Client ID: set in code (already wired via `CLIENT_ID`).
4) Scopes used:
   - `streaming`, `user-read-private`, `user-read-email`, `user-read-playback-state`,
     `user-modify-playback-state`, `user-read-currently-playing`.

Security reminders:
- This repository contains NO client secret and must never include one.
- If you ever used a secret in development, ROTATE IT immediately in the Spotify dashboard and never commit it.
- PKCE flow in browsers does not require client secret.

### Local development

- Requirements: Node 18+
- Install and run:
  ```
  npm install
  npm run dev
  ```
- Visit http://127.0.0.1:5173
- Click "Login with Spotify".
- After redirect, the app should show device/player controls and visuals.

Notes:
- Use Premium to enable in-page playback via the Web Playback SDK. Without Premium, choose your active device from the device picker and use the app to control playback.

### GitHub Pages deployment

This repo includes:
- `vite.config.ts` with `base: "/dwdw/"`
- `404.html` SPA fallback for deep links like `/callback`
- GitHub Actions workflow to build and deploy to `gh-pages` branch

Enable Pages:
- Settings → Pages → Build and deployment = Deploy from a branch
- Branch = `gh-pages` / root

Push to main; Actions will build and publish automatically.

### SPA routing on Pages

- We ship `404.html` that redirects deep paths to `/#/path` to load the SPA on GitHub Pages.
- The Spotify auth redirect targets `/callback`. Pages will load `404.html`, which rewrites to `/#/callback`, and the app handles code exchange.

### Acceptance checklist

- [x] PKCE login works; no secrets in repo.
- [x] Playback inside app if Premium; otherwise device control.
- [x] 5 visual scenes, palette-synced and audio-reactive (via analysis timing + envelopes).
- [x] Crossfades at phrase boundaries (4 bars default).
- [x] Quality panel parameters visibly affect visuals/perf.
- [x] Director timeline + VJ controls; keyboard/MIDI; WebM recording.
- [x] Accessibility options functional.
- [x] IndexedDB caching; rate limit backoff; token refresh handling.

### Known gaps and notes

- True real-time FFT of Spotify audio is not available in browsers due to DRM and SDK limitations. The app uses Spotify Audio Analysis timing and segment features instead, which is highly musical and stable, but not PCM-derived.
- Optional "Preview Analysis" mode (not enabled by default) can analyze 30s previews using Web Audio, which may be helpful for testing FFT/chroma features, but won't perfectly sync to live playback.
- SSAO/TAA/DOF are stubbed via parameters in this version; full postprocessing chains can be plugged into Three.js EffectComposer if desired.

### Live VJ mappings

- Keyboard: 1..5 to switch scenes; Space to trigger an "explode" macro.
- MIDI CC:
  - CC1 Intensity
  - CC2 Bloom
  - CC3 Glitch
  - CC4 Speed
- MIDI Note 36 (C2): explode

### Rotate secrets

- Even though this app uses PKCE and does not need a client secret, if you ever used your secret locally, rotate it in the Spotify Dashboard.
- Never commit secrets to this repository.

License: MIT (add if desired)