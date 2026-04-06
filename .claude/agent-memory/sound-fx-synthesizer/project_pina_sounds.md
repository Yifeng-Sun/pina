---
name: Project: pina sound system
description: Sound effects generated for the pina CLI — file locations, format, and synthesis approach
type: project
---

Generator scripts:
- `/Users/yifengsun/dev/pina/scripts/generate-sounds.ts` — core UI sounds (default profile)
- `/Users/yifengsun/dev/pina/scripts/generate-completion-sounds.ts` — completion/ultra-completion (default profile)
- `/Users/yifengsun/dev/pina/scripts/generate-forest.ts` — forest profile (22 files)
- `/Users/yifengsun/dev/pina/scripts/generate-dreamy.ts` — dreamy profile (22 files, single script)
- `/Users/yifengsun/dev/pina/scripts/regenerate-dreamy-navigate.ts` — regenerates only dreamy navigate.wav + navigate_0–11.wav (softer redesign, 2026-04-05)
- `/Users/yifengsun/dev/pina/scripts/generate-cyberpunk.ts` — cyberpunk profile (22 files, single script)

Output directories:
- `/Users/yifengsun/dev/pina/sounds/` — default profile
- `/Users/yifengsun/dev/pina/sounds/forest/` — forest profile
- `/Users/yifengsun/dev/pina/sounds/cyberpunk/` — cyberpunk profile
- `/Users/yifengsun/dev/pina/sounds/dreamy/` — dreamy profile

Run with: `npx tsx scripts/<script>.ts`

Format: 44100 Hz, mono, 16-bit PCM WAV, no external dependencies.

**Default profile sounds (22 total):**
- `navigate.wav` — 50ms, soft triangle+sine tick at G5 (784 Hz), normalised to 0.35 peak (deliberately quiet)
- `enter.wav` — 80ms, bright sine pop at E5 (659 Hz) with a high transient partial
- `back.wav` — 100ms, pure sine chirp E5 → C#5 (minor third), Hann envelope (30% fade-in / 60% fade-out), normalised to 0.25 peak — softest version, regenerated 2026-04-05
- `action.wav` — 120ms, bell tone at A5 (880 Hz) with inharmonic partials
- `success.wav` — 200ms, two-note ascending chime C#5 → F#5 with slight overlap
- `error.wav` — 150ms, low buzz/thud at A#2 (116 Hz) with descending chirp + filtered noise
- `toggle.wav` — 60ms, dual-layer click: high transient G6 + low body G3
- `delete.wav` — 150ms, descending whoosh D5 → G3 with noise+sine blend
- `navigate_0.wav` through `navigate_11.wav` — 12 semitone-shifted variants for list scrolling
- `completion.wav` — 475ms, C major arpeggio bell-chime voices staggered 80ms apart
- `ultra-completion.wav` — 900ms, seven-note fanfare with bass pedal, chord hit, glissando sweep

**Forest profile sounds (22 total) — organic, natural, echoing, rainy character:**
- `navigate.wav` — 85ms, FM water-drop plunk at G5 with noise click transient, light reverb; 0.38 peak
- `enter.wav` — 130ms, wood resonance (E3+B3+E4) with noise tap transient, forest echo
- `back.wav` — 100ms, LP-filtered noise with cutoff sweep 900→300 Hz, Hann (15%/70%), 0.20 peak — regenerated 2026-04-05 (was bandpass+sine, too harsh)
- `action.wav` — 150ms, FM bird chirp D6→A6 with 4.1x modulator ratio and pitch glide
- `success.wav` — 280ms, three wind chimes (G5 A5 C6) staggered 50ms, chime partials, lush reverb
- `error.wav` — 220ms, bandpass noise at 82 Hz (thunder) with LFO tremor + low sine boom
- `toggle.wav` — 90ms, HP-filtered noise crack + low sine body (D3), twig-snap character
- `delete.wav` — 220ms, bandpass noise sweep 3000→300 Hz + descending sine A4→D3
- `navigate_0–11.wav` — 12 semitone FM-plunk variants (G5 base, chromatic up)
- `completion.wav` — 550ms, 5-drop ascending pentatonic FM cascade (G4 A4 C5 E5 G5), cave reverb
- `ultra-completion.wav` — 1050ms, four-movement forest awakening: bird chirps → wind chimes → warm pad swell → G major resolution chord with shimmer tail; 0.82 peak

**Key DSP technique: forest reverb** — four Schroeder comb filters at 31/37/41/53ms (prime-ish to avoid metallic resonance), LP-filtered tail at 6kHz to simulate foliage absorption.

**Dreamy profile sounds (22 total) — soft, ethereal, holy, celestial:**
- `navigate.wav` — 50ms, two detuned sines ±1.5 cents at C6 (1046.50 Hz) + octave partial at 15%, 8ms cosine attack, exp decay, 0.22 peak — regenerated 2026-04-05 (user found original too harsh; new design is whisper-quiet, crystalline)
- `enter.wav` — 80ms, detuned shimmer pad at E5, 25ms cosine attack, faint fifth halo
- `back.wav` — 100ms, two detuned sines G#4→E4 (minor third) +7 cents apart, Hann (25%/65%), 0.20 peak — regenerated 2026-04-05 (softest of all four profiles)
- `action.wav` — 120ms, bell at A5 with 4 shimmer-detuned partials (4–18 cents per partial)
- `success.wav` — 200ms, choir-pad C#5+F#5 (90ms stagger) + E6 shimmer crown from 120ms
- `error.wav` — 150ms, warm hum at G3 (196 Hz), 3 harmonics with 3% pitch sag (the "hmm" inflection)
- `toggle.wav` — 60ms, airy shimmer at C6, 8-cent detuning, 70% wet reverb IS the sound; 0.38 peak
- `delete.wav` — 150ms, E major triad (E5+G#5+B5) dissolving in 8ms-staggered shimmer fade
- `completion.wav` — 475ms, choir-pad C major arpeggio, shimmer crown E6+G6 blooms at 300ms
- `ultra-completion.wav` — 900ms: choir ascent C4→E6 (7 notes) + C3 pedal + chord bloom at 480ms with 2.5Hz LFO tremolo + cascade shimmer E7/C7/G6/E6 waterfall at 650ms; cathedral reverb roomSize=0.85
- `navigate_0–11.wav` — same design as navigate.wav, chromatically shifted from C6 upward; regenerated 2026-04-05 via `/Users/yifengsun/dev/pina/scripts/regenerate-dreamy-navigate.ts`

**Key DSP techniques: dreamy profile** — `shimmerOsc()` (two detuned sines N cents apart for angelic beating), `choirPartials()` (5 stacked harmonics with per-harmonic decay), `addReverb()` (6 prime-spaced comb delays: 17/31/53/71/97/127ms, no convolution), raised-cosine attack everywhere (sounds bloom, never strike), 3% pitch sag on error (concerned "hmm").

**Cyberpunk profile sounds (22 total) — metallic, industrial, harsh-digital (Blade Runner aesthetic):**
- `navigate.wav` — 50ms, FM tick (carrier G5, modulator ×2.37), faint saw layer, HPF 800 Hz; 0.38 peak
- `enter.wav` — 80ms, FM buzz (E5 × 3.5 modulator) with hard-clipped noise burst transient overlay
- `back.wav` — 100ms, sine chirp D5→B4 (minor third) with FM index 0.15→0 (shimmer fades out), Hann (20%/65%), 0.25 peak — regenerated 2026-04-05 (was harsh sawtooth+bit-crush)
- `action.wav` — 120ms, ring-modulation (saw A5 × golden-ratio 1.618), bandpass sizzle noise, softSat
- `success.wav` — 200ms, FM chirp D4→D6 (2 octaves), comb filter resonance, mod index fades 4→0.5
- `error.wav` — 150ms, hard-clipped saw A#2 (116 Hz) with voltage-sag droop + low thud noise body
- `toggle.wav` — 60ms, FM relay ring-down (G#5 × 2.73), decaying mod index 5→0, noise impact burst
- `delete.wav` — 150ms, saw B4→F#2, progressive bit-crush (period 1→16 samples), corruption noise rise
- `completion.wav` — 475ms, FM+saw C major arpeggio (C4-E4-G4-C5) staggered 80ms, neon flicker sweep C4→C6
- `ultra-completion.wav` — 900ms: 7-note FM fanfare (C3→E5 with fifth/octave skips), hard-clipped C2 bass pedal, softSat power chord (C4/G4/C5) with vibrato at 500ms, double cross-sweep (C5→C7 rising × G6→G4 falling), E6+G#6 metallic shimmer crown tail
- `navigate_0–11.wav` — 12 chromatic FM variants (same technique, semitone-shifted carrier)

**Key DSP techniques unique to cyberpunk profile:**
- FM synthesis: modulator at non-integer carrier multiples (×2.37, ×2.73, ×3.5) → inharmonic metallic partials
- Hard clipping: clips at ±threshold, renormalises → maximum odd harmonic distortion
- Soft saturation: tanh(v × drive) → smoother distortion for "chrome wall" chord
- Bit-crush: sample-and-hold with growing period → lo-fi pixelation that ramps in over time
- Ring modulation: carrier × ring oscillator → electric arc sideband cluster
- One-pole HPF: strips warmth, leaves chrome shimmer on navigate/toggle/action
- Comb filter: delay-line feedback → metallic resonance on success

**Why:** pina is a CLI project manager using Ink; sounds provide tactile UI feedback. Navigate variants allow pitch to track list position. Completion sounds reward single-objective and full-project completion. Multiple sound profiles allow theming.
