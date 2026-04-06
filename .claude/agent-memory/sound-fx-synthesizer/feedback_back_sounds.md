---
name: back.wav design philosophy
description: User preference for back sounds — extremely soft, well below other UI sounds, never harsh
type: feedback
---

Back sounds across all profiles should be the quietest sounds in each profile — a soft whisper, not a statement.

**Why:** The original back sounds (sawtooth/triangle blend, 0.55 peak; sawtooth+bit-crush for cyberpunk; bandpass noise for forest) were reported as "too harsh on the ears" in April 2026. The user needed them significantly softer and gentler.

**How to apply:**
- Use pure sine waves or very gently filtered noise only — no sawtooth, no triangle, no bit-crush on back sounds
- Normalise to 20–25% peak maximum (not 0.55 like the originals)
- Always use a raised-cosine (Hann) fade-in of at least 15–25% of the total duration — never a hard start
- Fade-out should be long relative to fade-in: 60–70% of the duration dissolving to silence
- For cyberpunk: FM modulation index must start very low (≤0.15) and taper to zero — character without harshness
- For forest: LP-filtered noise sweep only, no sine layer underneath
- For dreamy: two detuned sines (+7 cents) are softer than a single louder oscillator
- The script `/Users/yifengsun/dev/pina/scripts/regenerate-back.ts` contains the approved synthesis for all four profiles
