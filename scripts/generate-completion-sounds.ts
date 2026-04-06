/**
 * generate-completion-sounds.ts
 *
 * Generates two richly satisfying completion sounds for the pina CLI:
 *
 *   completion.wav      — ~450ms, C major arpeggio (C5-E5-G5-C6) + sparkle shimmer
 *   ultra-completion.wav — ~900ms, full seven-note fanfare rising to a sustained
 *                          major chord with a glissando sweep and long shimmering decay
 *
 * Both share the same musical DNA (C major, bell-like timbres, ascending motion)
 * but ultra-completion is conspicuously bigger in every dimension.
 *
 * Format: 44100 Hz, mono, 16-bit PCM WAV.
 * No external dependencies — pure Node.js Buffer manipulation.
 *
 * Run with:  npx tsx scripts/generate-completion-sounds.ts
 */

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SAMPLE_RATE = 44100;
const BIT_DEPTH   = 16;
const NUM_CHANNELS = 1;

// ---------------------------------------------------------------------------
// WAV writer (identical approach to generate-sounds.ts)
// ---------------------------------------------------------------------------

function samplesToWav(samples: Float32Array): Buffer {
  const numSamples = samples.length;
  const dataSize   = numSamples * (BIT_DEPTH / 8) * NUM_CHANNELS;
  const headerSize = 44;
  const buf        = Buffer.alloc(headerSize + dataSize);

  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);

  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);                                              // PCM
  buf.writeUInt16LE(NUM_CHANNELS, 22);
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * NUM_CHANNELS * (BIT_DEPTH / 8), 28);
  buf.writeUInt16LE(NUM_CHANNELS * (BIT_DEPTH / 8), 32);
  buf.writeUInt16LE(BIT_DEPTH, 34);

  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);

  const MAX_INT16 = 32767;
  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(clamped * MAX_INT16), headerSize + i * 2);
  }
  return buf;
}

function writeSoundFile(outDir: string, name: string, samples: Float32Array): void {
  const buf     = samplesToWav(samples);
  const outPath = join(outDir, name);
  writeFileSync(outPath, buf);
  const ms = (samples.length / SAMPLE_RATE * 1000).toFixed(0);
  console.log(`  wrote ${name}  (${samples.length} samples, ${ms} ms)`);
}

// ---------------------------------------------------------------------------
// DSP building blocks
// ---------------------------------------------------------------------------

function alloc(durationSec: number): Float32Array {
  return new Float32Array(Math.ceil(SAMPLE_RATE * durationSec));
}

/**
 * Convert note name + octave → frequency (Hz).
 * A4 = 440 Hz, equal temperament.
 */
function noteToHz(note: string, octave: number): number {
  const NOTES: Record<string, number> = {
    C: 0, "C#": 1, Db: 1,
    D: 2, "D#": 3, Eb: 3,
    E: 4,
    F: 5, "F#": 6, Gb: 6,
    G: 7, "G#": 8, Ab: 8,
    A: 9, "A#": 10, Bb: 10,
    B: 11,
  };
  const semitone = NOTES[note];
  if (semitone === undefined) throw new Error(`Unknown note: ${note}`);
  const midi = (octave + 1) * 12 + semitone;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * ADSR envelope — returns a per-sample multiplier array.
 * All times in seconds. Sustain is a level 0..1.
 */
function adsr(
  numSamples: number,
  attack: number,
  decay: number,
  sustain: number,
  release: number
): Float32Array {
  const env      = new Float32Array(numSamples);
  const aSamples = Math.floor(attack  * SAMPLE_RATE);
  const dSamples = Math.floor(decay   * SAMPLE_RATE);
  const rSamples = Math.floor(release * SAMPLE_RATE);
  const sSamples = Math.max(0, numSamples - aSamples - dSamples - rSamples);

  for (let i = 0; i < numSamples; i++) {
    if (i < aSamples) {
      env[i] = i / aSamples;
    } else if (i < aSamples + dSamples) {
      const t = (i - aSamples) / dSamples;
      env[i] = 1 - t * (1 - sustain);
    } else if (i < aSamples + dSamples + sSamples) {
      env[i] = sustain;
    } else {
      const t = (i - aSamples - dSamples - sSamples) / Math.max(1, rSamples);
      env[i] = sustain * (1 - t);
    }
  }
  return env;
}

/** Exponential decay — starts at 1, decays to ~0 over decayTime seconds. */
function expDecay(numSamples: number, decayTime: number): Float32Array {
  const env = new Float32Array(numSamples);
  // Solve e^(-k * decayTime * sr) ≈ 0.001  →  k ≈ ln(1000) / (decayTime * sr)
  const k = Math.log(1000) / (decayTime * SAMPLE_RATE);
  for (let i = 0; i < numSamples; i++) {
    env[i] = Math.exp(-k * i);
  }
  return env;
}

/** Sine oscillator — returns one sample at time t (seconds). */
function sine(freq: number, t: number): number {
  return Math.sin(2 * Math.PI * freq * t);
}

/** Normalise so the peak absolute value equals targetPeak. */
function normalise(samples: Float32Array, targetPeak = 0.85): void {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i]) > peak) peak = Math.abs(samples[i]);
  }
  if (peak === 0) return;
  const gain = targetPeak / peak;
  for (let i = 0; i < samples.length; i++) samples[i] *= gain;
}

/** Short linear fade-in / fade-out to suppress clicks at buffer edges. */
function declick(samples: Float32Array, fadeSamples = 64): void {
  const fade = Math.min(fadeSamples, Math.floor(samples.length / 4));
  for (let i = 0; i < fade; i++) {
    const gain = i / fade;
    samples[i]                      *= gain;
    samples[samples.length - 1 - i] *= gain;
  }
}

/**
 * Mix a source buffer into a destination buffer at a given start sample.
 * Clips quietly if the source runs past the end of the destination.
 */
function mixIn(
  dest: Float32Array,
  src:  Float32Array,
  startSample: number,
  gainMultiplier = 1.0
): void {
  const end = Math.min(dest.length, startSample + src.length);
  for (let i = startSample; i < end; i++) {
    dest[i] += src[i - startSample] * gainMultiplier;
  }
}

// ---------------------------------------------------------------------------
// Shared synthesis primitive — bell-note voice
// ---------------------------------------------------------------------------

/**
 * Render a single bell-note voice into a new Float32Array.
 *
 * Uses a fundamental sine plus two inharmonic partials (approximate bell
 * ratios), each with its own independent exponential decay so that higher
 * partials die away faster — the hallmark of a struck bell or chime.
 *
 * @param freq         Fundamental frequency (Hz)
 * @param duration     Total voice duration (seconds)
 * @param attack       Attack time (seconds) — kept very short for a struck feel
 * @param decayTime    Decay time constant for the fundamental (seconds)
 * @param partials     Array of [frequencyRatio, amplitude, relDecayMultiplier]
 *                     relDecayMultiplier < 1 → partial decays faster than fundamental
 */
function bellNote(
  freq: number,
  duration: number,
  attack: number,
  decayTime: number,
  partials: Array<[number, number, number]>
): Float32Array {
  const numSamples = Math.ceil(duration * SAMPLE_RATE);
  const buf        = new Float32Array(numSamples);
  const aSamples   = Math.max(1, Math.floor(attack * SAMPLE_RATE));

  for (let i = 0; i < numSamples; i++) {
    const t          = i / SAMPLE_RATE;
    // Simple linear attack then exponential decay envelope
    const attackGain = i < aSamples ? i / aSamples : 1.0;
    let sample = 0;
    for (const [ratio, amp, decayMul] of partials) {
      const partialDecay = Math.exp(-Math.log(1000) / (decayTime * decayMul * SAMPLE_RATE) * i);
      sample += sine(freq * ratio, t) * amp * partialDecay;
    }
    buf[i] = sample * attackGain;
  }
  return buf;
}

// ---------------------------------------------------------------------------
// completion.wav
// ---------------------------------------------------------------------------
//
// Design: C major arpeggio — C5, E5, G5, C6 — played as a rapid but distinct
// sequence, each note a rich bell-chime voice.  Notes are staggered ~85 ms
// apart with a generous tail so they ring together by the time the last note
// hits.  After C6 lands, a "sparkle shimmer" layer — a high cluster of E6 and
// G6 at low amplitude with a slow fade — floats on top to give that earned,
// glittering feeling of completion.
//
// Total duration: 475 ms.

function synthCompletion(): Float32Array {
  const DUR         = 0.475;
  const out         = alloc(DUR);

  // C major arpeggio frequencies
  const C5 = noteToHz("C", 5);   //  523.25 Hz
  const E5 = noteToHz("E", 5);   //  659.25 Hz
  const G5 = noteToHz("G", 5);   //  783.99 Hz
  const C6 = noteToHz("C", 6);   // 1046.50 Hz

  // Bell partial recipe — fundamental dominates, two upper partials add shimmer.
  // Ratios approximate a struck metal bar / chime.
  // [ratio, amplitude, decaySpeedMultiplier]  (higher ratio → faster decay via mul < 1)
  const recipe: Array<[number, number, number]> = [
    [1.000, 1.00, 1.00],   // fundamental — longest decay
    [2.756, 0.28, 0.55],   // near-octave bell partial — dies away in ~half the time
    [5.404, 0.10, 0.30],   // bright upper ring — short life
  ];

  const noteDur   = 0.30;   // each voice is 300 ms long (they overlap beautifully)
  const noteDecay = 0.22;   // fundamental decay time constant (seconds)
  const attack    = 0.003;  // 3 ms attack — struck feel

  // Stagger onsets: C5 at 0ms, E5 at 80ms, G5 at 165ms, C6 at 255ms
  const onsets: Array<[number, number]> = [
    [C5, 0.000],
    [E5, 0.080],
    [G5, 0.165],
    [C6, 0.255],
  ];

  // Amplitude scaling: slightly louder as we ascend (the top note should sing)
  const amps = [0.80, 0.85, 0.88, 1.00];

  for (let n = 0; n < onsets.length; n++) {
    const [freq, onset] = onsets[n];
    const voice = bellNote(freq, noteDur, attack, noteDecay, recipe);
    mixIn(out, voice, Math.floor(onset * SAMPLE_RATE), amps[n]);
  }

  // --- Sparkle shimmer layer ---
  // E6 and G6 at very low amplitude with a slower, longer decay — this is the
  // "glitter" that trails after the final arpeggio note lands.
  const shimmerOnset  = 0.270;  // begins just after C6 lands
  const shimmerDecay  = 0.32;   // floats longer than the main notes
  const shimmerDur    = DUR - shimmerOnset;
  const E6 = noteToHz("E", 6);  // 1318.51 Hz
  const G6 = noteToHz("G", 6);  // 1567.98 Hz

  const shimmerRecipe: Array<[number, number, number]> = [
    [1.000, 1.00, 1.00],
    [2.000, 0.18, 0.60],  // clean octave — adds a crystalline overtone
  ];

  const shimE6 = bellNote(E6, shimmerDur, 0.005, shimmerDecay, shimmerRecipe);
  const shimG6 = bellNote(G6, shimmerDur, 0.008, shimmerDecay, shimmerRecipe);

  mixIn(out, shimE6, Math.floor(shimmerOnset * SAMPLE_RATE), 0.22);
  mixIn(out, shimG6, Math.floor(shimmerOnset * SAMPLE_RATE), 0.18);

  normalise(out, 0.80);
  declick(out, 48);
  return out;
}

// ---------------------------------------------------------------------------
// ultra-completion.wav
// ---------------------------------------------------------------------------
//
// Design: same C major DNA, but every dimension is expanded.
//
// PHASE 1 — Fanfare ascent (0–520ms)
//   A seven-note rising run: C4, G4, C5, E5, G5, C6, E6
//   Each note is a richer three-partial bell voice.
//   A bass C3 pedal tone enters at t=0 and sustains through the whole sound,
//   anchoring the harmony and adding gravitas.
//   Notes are spaced ~65ms apart — faster than completion, more momentum.
//
// PHASE 2 — Chord resolution (500ms–900ms)
//   At ~500ms, a full C major chord (C4+E4+G4+C5) lands simultaneously —
//   the "big hit" moment.  Each voice has a fast attack (5ms) so the chord
//   strikes with impact, then decays slowly with a 400ms release tail.
//   A gentle vibrato (rate 5 Hz, depth 0.3%) gradually creeps in after 50ms,
//   giving the sustained chord a living, breathing quality.
//
// PHASE 3 — Glissando sweep + crown sparkle (490ms–900ms)
//   A sine frequency sweep rises from C6 (1047 Hz) to C7 (2093 Hz) over
//   200ms — a "shooting star" arc that leads the ear upward into the sparkle.
//   After the sweep, E7+G7 shimmer at very low amplitude for the last 250ms.
//
// Total duration: 900 ms.

function synthUltraCompletion(): Float32Array {
  const DUR = 0.900;
  const out = alloc(DUR);

  // --- Frequency table ---
  const C3 = noteToHz("C", 3);   //  130.81 Hz
  const C4 = noteToHz("C", 4);   //  261.63 Hz
  const E4 = noteToHz("E", 4);   //  329.63 Hz
  const G4 = noteToHz("G", 4);   //  392.00 Hz
  const C5 = noteToHz("C", 5);   //  523.25 Hz
  const E5 = noteToHz("E", 5);   //  659.25 Hz
  const G5 = noteToHz("G", 5);   //  783.99 Hz
  const C6 = noteToHz("C", 6);   // 1046.50 Hz
  const E6 = noteToHz("E", 6);   // 1318.51 Hz
  const E7 = noteToHz("E", 7);   // 2637.02 Hz
  const G7 = noteToHz("G", 7);   // 3135.96 Hz

  // --- PHASE 1: Fanfare ascent ---
  // Richer partial recipe than completion — four partials for fullness.
  const fanfareRecipe: Array<[number, number, number]> = [
    [1.000, 1.00, 1.00],
    [2.000, 0.35, 0.70],   // clean octave (adds warmth, not bell-only character)
    [2.756, 0.22, 0.50],   // bell upper partial
    [5.404, 0.08, 0.28],   // bright shimmer ring
  ];

  // Rising fanfare: each entry is [frequency, onsetSec, relativeAmplitude]
  const fanfare: Array<[number, number, number]> = [
    [C4,  0.000, 0.75],
    [G4,  0.065, 0.78],
    [C5,  0.135, 0.82],
    [E5,  0.205, 0.85],
    [G5,  0.280, 0.88],
    [C6,  0.360, 0.94],
    [E6,  0.450, 1.00],
  ];

  const fanfareDur   = 0.38;   // each voice 380ms — plenty of ring-on overlap
  const fanfareDecay = 0.28;   // a touch longer decay than completion
  const fanfareAtk   = 0.003;

  for (const [freq, onset, amp] of fanfare) {
    const voice = bellNote(freq, fanfareDur, fanfareAtk, fanfareDecay, fanfareRecipe);
    mixIn(out, voice, Math.floor(onset * SAMPLE_RATE), amp);
  }

  // --- Bass pedal tone (C3, full duration) ---
  // A pure sine with a long slow decay gives the whole sound a solid foundation.
  // It fades out naturally before the end so it doesn't muddy the sparkle tail.
  {
    const pedalDur   = 0.700;
    const pedalDecay = 0.55;   // slow fade — still audible through chord hit
    const pedalAtk   = 0.010;
    const numPedal   = Math.ceil(pedalDur * SAMPLE_RATE);
    const pedalBuf   = new Float32Array(numPedal);
    const aSamples   = Math.floor(pedalAtk * SAMPLE_RATE);
    const k          = Math.log(1000) / (pedalDecay * SAMPLE_RATE);

    for (let i = 0; i < numPedal; i++) {
      const t          = i / SAMPLE_RATE;
      const atkGain    = i < aSamples ? i / aSamples : 1.0;
      const decayGain  = Math.exp(-k * i);
      // Two-octave bass: fundamental + octave for body
      pedalBuf[i] = (sine(C3, t) * 0.85 + sine(C3 * 2, t) * 0.20) * atkGain * decayGain;
    }
    mixIn(out, pedalBuf, 0, 0.38);
  }

  // --- PHASE 2: Chord hit (C major, C4+E4+G4+C5 simultaneously at 500ms) ---
  // Each chord voice uses an ADSR with a sharp attack, long sustain, and a
  // slow release.  Vibrato (LFO applied to phase accumulator) gradually deepens
  // from 50ms after the chord onset, giving a singing-string character.
  {
    const chordOnset     = 0.500;
    const chordDur       = DUR - chordOnset;
    const chordNotes     = [C4, E4, G4, C5];
    const chordAmps      = [0.90, 0.85, 0.85, 1.00];

    // Partial structure for the chord voices — cleaner than bell, more organ-like
    const chordPartials: Array<[number, number]> = [
      [1.0,  1.00],
      [2.0,  0.40],   // octave — warmth
      [3.0,  0.18],   // fifth above octave — presence
      [4.0,  0.10],   // double octave — air
    ];

    const numChord = Math.ceil(chordDur * SAMPLE_RATE);

    for (let n = 0; n < chordNotes.length; n++) {
      const freq      = chordNotes[n];
      const amp       = chordAmps[n];
      const chordBuf  = new Float32Array(numChord);

      // Per-partial phase accumulators (for vibrato tracking)
      const phases = chordPartials.map(() => 0.0);

      const vibratoRate  = 5.0;      // Hz
      const vibratoDepth = 0.0030;   // relative frequency deviation at full depth
      const vibratoRamp  = 0.080;    // seconds from chord onset until vibrato is full depth

      // ADSR: sharp 5ms attack, 80ms decay to 0.7 sustain, hold, 300ms release
      const env = adsr(numChord, 0.005, 0.080, 0.70, 0.300);

      for (let i = 0; i < numChord; i++) {
        const t           = i / SAMPLE_RATE;
        const dt          = 1 / SAMPLE_RATE;
        const vibratoFade = Math.min(1.0, t / vibratoRamp);
        const vibratoMod  = 1.0 + vibratoDepth * vibratoFade * Math.sin(2 * Math.PI * vibratoRate * t);

        let sample = 0;
        for (let p = 0; p < chordPartials.length; p++) {
          const [ratio, pAmp] = chordPartials[p];
          phases[p]  += freq * ratio * vibratoMod * dt;
          sample     += Math.sin(2 * Math.PI * phases[p]) * pAmp;
        }
        chordBuf[i] = sample * env[i];
      }
      mixIn(out, chordBuf, Math.floor(chordOnset * SAMPLE_RATE), amp * 0.55);
    }
  }

  // --- PHASE 3a: Glissando sweep (490ms → 690ms) ---
  // A single sine voice sweeps from C6 up to C7 over 200ms using a
  // phase-accumulator (not t-based) to avoid discontinuities in the sweep.
  {
    const sweepStart   = 0.490;
    const sweepDur     = 0.200;
    const numSweep     = Math.ceil(sweepDur * SAMPLE_RATE);
    const sweepBuf     = new Float32Array(numSweep);
    const freqLow      = noteToHz("C", 6);    // 1046.50 Hz
    const freqHigh     = noteToHz("C", 7);    // 2093.00 Hz
    let   sweepPhase   = 0.0;
    const sweepEnv     = adsr(numSweep, 0.010, 0.050, 0.70, 0.100);

    for (let i = 0; i < numSweep; i++) {
      const progress  = i / numSweep;
      // Logarithmic (exponential) interpolation — sounds more natural for pitch
      const instFreq  = freqLow * Math.pow(freqHigh / freqLow, progress * progress);
      sweepPhase     += instFreq / SAMPLE_RATE;
      sweepBuf[i]     = Math.sin(2 * Math.PI * sweepPhase) * sweepEnv[i];
    }
    mixIn(out, sweepBuf, Math.floor(sweepStart * SAMPLE_RATE), 0.30);
  }

  // --- PHASE 3b: Crown sparkle (660ms → end) ---
  // E7 and G7 at extremely low amplitude with a very slow decay — the topmost
  // "stardust" that trails the whole sound into silence.
  {
    const sparkleOnset = 0.660;
    const sparkleDur   = DUR - sparkleOnset;
    const sparkDecay   = 0.38;

    const sparkleRecipe: Array<[number, number, number]> = [
      [1.000, 1.00, 1.00],
      [2.000, 0.15, 0.55],
    ];

    const sparkE7 = bellNote(E7, sparkleDur, 0.008, sparkDecay, sparkleRecipe);
    const sparkG7 = bellNote(G7, sparkleDur, 0.012, sparkDecay, sparkleRecipe);

    mixIn(out, sparkE7, Math.floor(sparkleOnset * SAMPLE_RATE), 0.15);
    mixIn(out, sparkG7, Math.floor(sparkleOnset * SAMPLE_RATE), 0.12);
  }

  normalise(out, 0.85);
  declick(out, 64);
  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const OUT_DIR = "/Users/yifengsun/dev/pina/sounds";

mkdirSync(OUT_DIR, { recursive: true });

console.log("\nGenerating pina completion sounds...\n");

writeSoundFile(OUT_DIR, "completion.wav",       synthCompletion());
writeSoundFile(OUT_DIR, "ultra-completion.wav", synthUltraCompletion());

console.log("\nDone. Files written to:", OUT_DIR, "\n");
