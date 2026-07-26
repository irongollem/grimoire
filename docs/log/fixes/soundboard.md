# Fixes — Soundboard

Resolved bugs in the **Soundboard** area, newest first. Part of the Grimoire fix log — see the [log index](../index.md).

- [x] Blocked autoplay left the UI claiming a sound was playing — `play()` did `audio.play().catch(() => {})` and then set `state.isPlaying = true` unconditionally on the next line, so when the browser refused to start playback the card showed a playing sound while the room heard silence. An inline comment asserted the button stayed stopped; it did not. `isPlaying` now flips only inside the resolved branch and is cleared on rejection, so the control reflects what is actually audible. (`src/stores/soundboard.ts`)

- [x] Soundboard card badges ("No Safari", "Retry") overflowed narrow cards (#464) — conditional badges on sound cards were rendered in a non-wrapping `flex` container, causing wide badges to overflow the card's right edge on narrow screens (especially mobile). Fixed by adding `flex-wrap` to the container so overflowing badges wrap to the next line; normal cards with short content remain single-line and are visually unchanged. (`src/components/soundboard/SoundCard.vue`)

- [x] Soundboard pause button acted as stop — `togglePlay` called `stop()` which does `audio.pause() + currentTime = 0`, resetting position. Added a `pause()` action (pause only, no seek) to the store and updated `SoundCard.togglePlay` to call it. (#410)
