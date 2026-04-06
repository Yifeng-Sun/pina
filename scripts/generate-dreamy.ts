/**
 * generate-dreamy.ts
 *
 * Generates the "dreamy" UI sound profile for pina.
 * Character: soft, ethereal, holy, celestial — cathedral reverb, angelic bells,
 * heavenly choir pads, ambient washes. Weightless, warm, sacred.
 *
 * Synthesis philosophy:
 *   - Long, soft attacks (the sound blooms into existence, never strikes)
 *   - Detuned oscillator pairs produce gentle beating and shimmer
 *   - Pseudo-reverb via comb filtering (summed delayed copies, no dependencies)
 *   - Choir-like harmonics: stacked pure integer partials with independent slow decays
 *   - Error uses a warm low hum — never harsh, always comforting
 *
 * Format: 44100 Hz, mono, 16-bit PCM WAV. No external dependencies.
 *
 * Run with:  npx tsx scripts/generate-dreamy.ts
 */

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SAMPLE_RATE  = 44100;
const BIT_DEPTH    = 16;
const NUM_CHANNELS = 1;

// ---------------------------------------------------------------------------
// WAV writer — identical approach to generate-sounds.ts
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
  buf.writeUInt16LE(1, 20);
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

/** Convert note name + octave to Hz. A4 = 440 Hz, equal temperament. */
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

/** Shift a frequency by a given number of semitones. */
function shiftSemitones(hz: number, semitones: number): number {
  return hz * Math.pow(2, semitones / 12);
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

/** Exponential decay — starts at 1, decays to ~0.001 over decayTime seconds. */
function expDecay(numSamples: number, decayTime: number): Float32Array {
  const env = new Float32Array(numSamples);
  const k   = Math.log(1000) / (decayTime * SAMPLE_RATE);
  for (let i = 0; i < numSamples; i++) {
    env[i] = Math.exp(-k * i);
  }
  return env;
}

/**
 * Smooth raised-cosine fade-in envelope — reaches 1 at the end.
 * More organic than linear, with zero derivative at both endpoints.
 */
function cosAttack(numSamples: number, attackSamples: number): Float32Array {
  const env  = new Float32Array(numSamples);
  const fade = Math.min(attackSamples, numSamples);
  for (let i = 0; i < numSamples; i++) {
    if (i < fade) {
      env[i] = 0.5 * (1 - Math.cos(Math.PI * i / fade));
    } else {
      env[i] = 1.0;
    }
  }
  return env;
}

/** Normalise so the peak absolute value equals targetPeak. */
function normalise(samples: Float32Array, targetPeak = 0.82): void {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i]) > peak) peak = Math.abs(samples[i]);
  }
  if (peak === 0) return;
  const gain = targetPeak / peak;
  for (let i = 0; i < samples.length; i++) samples[i] *= gain;
}

/** Short raised-cosine fade-in and fade-out to eliminate clicks at buffer edges. */
function declick(samples: Float32Array, fadeSamples = 128): void {
  const fade = Math.min(fadeSamples, Math.floor(samples.length / 4));
  for (let i = 0; i < fade; i++) {
    const gain = 0.5 * (1 - Math.cos(Math.PI * i / fade));
    samples[i]                      *= gain;
    samples[samples.length - 1 - i] *= gain;
  }
}

/** Mix a source buffer into a destination buffer at a given sample offset. */
function mixIn(
  dest: Float32Array,
  src: Float32Array,
  startSample: number,
  gainMultiplier = 1.0
): void {
  const end = Math.min(dest.length, startSample + src.length);
  for (let i = startSample; i < end; i++) {
    dest[i] += src[i - startSample] * gainMultiplier;
  }
}

/**
 * Pseudo-reverb via comb filtering.
 *
 * Adds N delayed copies of the signal back into itself at exponentially
 * decreasing gain. This approximates the dense early reflections and tail
 * of a cathedral reverb without any convolution or external data.
 *
 * @param samples   Input/output buffer (modified in place)
 * @param roomSize  Controls delay times — larger = longer reverb tail (0..1)
 * @param wetMix    How much of the wet (reverbed) signal to blend in (0..1)
 */
function addReverb(samples: Float32Array, roomSize = 0.4, wetMix = 0.35): void {
  const n = samples.length;
  // Delay times in milliseconds — prime-spaced to avoid metallic comb artefacts
  const delayMs  = [17, 31, 53, 71, 97, 127];
  const baseGain = 0.45;

  const wet = new Float32Array(n);

  for (let d = 0; d < delayMs.length; d++) {
    const delaySamples = Math.floor((delayMs[d] * roomSize * 3.5 + 4) * SAMPLE_RATE / 1000);
    const gain         = baseGain * Math.pow(0.62, d);   // each reflection quieter
    for (let i = delaySamples; i < n; i++) {
      wet[i] += samples[i - delaySamples] * gain;
    }
  }

  for (let i = 0; i < n; i++) {
    samples[i] = samples[i] * (1 - wetMix * 0.5) + wet[i] * wetMix;
  }
}

/**
 * Angelic shimmer oscillator — two detuned sines a few cents apart.
 *
 * The slight frequency difference creates a gentle, organic beating
 * (amplitude fluctuation at ~detune Hz) that sounds alive and ethereal.
 *
 * @param freq       Centre frequency (Hz)
 * @param detuneHz   Frequency offset for the second oscillator (Hz)
 * @param t          Time in seconds
 * @param phase      External phase accumulator (for coherent chirps etc.)
 */
function shimmerOsc(freq: number, detuneHz: number, t: number): number {
  return (
    Math.sin(2 * Math.PI * freq * t) * 0.6 +
    Math.sin(2 * Math.PI * (freq + detuneHz) * t) * 0.4
  );
}

/**
 * Choir partial stack — renders a single voiced tone with 4 harmonics,
 * each at a progressively quieter amplitude with its own decay rate.
 * The result resembles a breathy, open-vowel choir voice.
 *
 * @param freq       Fundamental frequency
 * @param t          Time in seconds
 * @param partialAmp Amplitude scaling per partial [h1, h2, h3, h4]
 * @param tDecay     Time used for per-partial decay differentiation
 */
function choirPartials(
  freq: number,
  t: number,
  partialAmps: number[],
  tDecay: number
): number {
  let v = 0;
  for (let h = 0; h < partialAmps.length; h++) {
    const harmonic    = h + 1;
    // Higher harmonics decay faster — simulates vowel formant smearing over time
    const decayFactor = Math.exp(-tDecay * harmonic * 0.8);
    v += Math.sin(2 * Math.PI * freq * harmonic * t) * partialAmps[h] * decayFactor;
  }
  return v;
}

// ---------------------------------------------------------------------------
// navigate.wav — soft crystalline chime, tiny glass bell, ~50ms
// ---------------------------------------------------------------------------
//
// Design: pure sine fundamental at E6 (a high, delicate frequency) with a
// single inharmonic partial at x2.756 (the bell partial ratio) for a
// crystalline glass-bell quality.  Very soft attack (3ms cosine ramp),
// exponential decay with a reverb tail.  Deliberately quiet.

function synthNavigate(semitoneShift = 0): Float32Array {
  const dur  = 0.05;
  const buf  = alloc(dur);
  const base = noteToHz("E", 6);     // 1318 Hz — high, glass-like, unobtrusive
  const freq = shiftSemitones(base, semitoneShift);

  // Bell partials: [ratio, amplitude, individual decay time]
  const partials: Array<[number, number, number]> = [
    [1.000, 1.00, 0.042],   // fundamental — the pure glass tone
    [2.756, 0.28, 0.018],   // bell partial — adds crystalline shimmer, decays faster
    [4.000, 0.08, 0.010],   // 2nd octave — tiny air at the top
  ];

  for (let i = 0; i < buf.length; i++) {
    const t          = i / SAMPLE_RATE;
    const atkSamples = Math.floor(0.003 * SAMPLE_RATE);
    const atkGain    = i < atkSamples ? 0.5 * (1 - Math.cos(Math.PI * i / atkSamples)) : 1.0;
    let   v          = 0;
    for (const [ratio, amp, dTime] of partials) {
      v += Math.sin(2 * Math.PI * freq * ratio * t) * amp * Math.exp(-t / dTime);
    }
    buf[i] = v * atkGain;
  }

  addReverb(buf, 0.55, 0.30);
  normalise(buf, 0.28);   // extra quiet — this fires constantly while navigating
  declick(buf, 48);
  return buf;
}

// ---------------------------------------------------------------------------
// enter.wav — warm pad swell, breath of light, ~80ms
// ---------------------------------------------------------------------------
//
// Design: a soft, choir-pad swell on E5.  Two detuned sines (shimmer pair)
// with a slow raised-cosine attack (25ms) so it blooms gently.  A faint
// fifth harmonic adds warmth and richness.  No percussive transient at all —
// it simply appears, warm and welcoming.

function synthEnter(): Float32Array {
  const dur  = 0.08;
  const buf  = alloc(dur);
  const freq = noteToHz("E", 5);   // 659 Hz — warm, bright, gentle confirm

  const atkSamples = Math.floor(0.025 * SAMPLE_RATE);   // 25ms soft bloom
  const env        = adsr(buf.length, 0.025, 0.015, 0.75, 0.030);

  for (let i = 0; i < buf.length; i++) {
    const t  = i / SAMPLE_RATE;
    // Detuned pair for shimmer (5 cents = 0.05 semitones ≈ freq * 0.00289)
    const shimmer = shimmerOsc(freq, freq * 0.00289, t);
    // Add a quiet fifth (G#5 / x1.5) for a warm halo
    const fifth   = Math.sin(2 * Math.PI * freq * 1.498 * t) * 0.25;
    buf[i] = (shimmer * 0.75 + fifth) * env[i];
  }

  addReverb(buf, 0.45, 0.40);
  normalise(buf, 0.58);
  declick(buf, 64);
  return buf;
}

// ---------------------------------------------------------------------------
// back.wav — soft descending harp-like glissando, feathery, ~100ms
// ---------------------------------------------------------------------------
//
// Design: a gentle pitch sweep from B5 down to E5 (a falling perfect fourth),
// rendered with the shimmer oscillator so it has that airy, harp-like quality.
// Phase-accumulator based (no discontinuities), soft cosine attack, slow release.
// Light reverb tail extends the featherweight feel.

function synthBack(): Float32Array {
  const dur      = 0.10;
  const buf      = alloc(dur);
  const freqHi   = noteToHz("B", 5);   // 987 Hz
  const freqLo   = noteToHz("E", 5);   // 659 Hz — descending perfect fifth
  let   phase1   = 0;
  let   phase2   = 0;
  const env      = adsr(buf.length, 0.008, 0.030, 0.55, 0.045);

  for (let i = 0; i < buf.length; i++) {
    const progress  = i / buf.length;
    // Logarithmic interpolation — sounds like a natural harp string
    const instFreq  = freqHi * Math.pow(freqLo / freqHi, progress * progress);
    const detune    = instFreq * 0.0035;   // slight shimmer
    const dt        = 1 / SAMPLE_RATE;
    phase1 += instFreq         * dt;
    phase2 += (instFreq + detune) * dt;
    const v = Math.sin(2 * Math.PI * phase1) * 0.62 +
              Math.sin(2 * Math.PI * phase2) * 0.38;
    buf[i] = v * env[i];
  }

  addReverb(buf, 0.50, 0.38);
  normalise(buf, 0.52);
  declick(buf, 64);
  return buf;
}

// ---------------------------------------------------------------------------
// action.wav — angelic "ting", like a blessing or a star appearing, ~120ms
// ---------------------------------------------------------------------------
//
// Design: a bell voice on A5 (880 Hz) with the classic inharmonic bell partial
// recipe (1.0 : 2.756 : 5.404), but rendered with shimmer detuning on each
// partial independently — so the partials themselves gently beat against each
// other.  The effect is a bell that seems to shimmer and glow rather than
// simply ring.  Each partial has its own independent decay rate.

function synthAction(): Float32Array {
  const dur         = 0.12;
  const buf         = alloc(dur);
  const fundamental = noteToHz("A", 5);   // 880 Hz

  // [ratio, amplitude, decayTime seconds, detuneCents]
  const partials: Array<[number, number, number, number]> = [
    [1.000, 1.00, 0.105, 4],    // fundamental — glows longest
    [2.756, 0.32, 0.050, 7],    // bell partial — decays in half the time
    [5.404, 0.11, 0.025, 12],   // bright upper shimmer — quick sparkle
    [8.000, 0.04, 0.012, 18],   // airy crown — just a whisper
  ];

  const atkSamples = Math.floor(0.006 * SAMPLE_RATE);

  for (let i = 0; i < buf.length; i++) {
    const t       = i / SAMPLE_RATE;
    const atkGain = i < atkSamples ? 0.5 * (1 - Math.cos(Math.PI * i / atkSamples)) : 1.0;
    let   v       = 0;
    for (const [ratio, amp, dTime, detuneCents] of partials) {
      const f1 = fundamental * ratio;
      const f2 = f1 * Math.pow(2, detuneCents / 1200);   // detuned copy
      const decay = Math.exp(-t / dTime);
      v += (Math.sin(2 * Math.PI * f1 * t) * 0.6 +
            Math.sin(2 * Math.PI * f2 * t) * 0.4) * amp * decay;
    }
    buf[i] = v * atkGain;
  }

  addReverb(buf, 0.60, 0.35);
  normalise(buf, 0.62);
  declick(buf, 48);
  return buf;
}

// ---------------------------------------------------------------------------
// success.wav — ascending pad with choir harmonics, warm and holy, ~200ms
// ---------------------------------------------------------------------------
//
// Design: two notes ascending (C#5 → F#5, a perfect fourth), each rendered as
// a choir-pad voice with choirPartials().  The second note enters at 90ms with
// slight overlap so the voices blend into a warm, open-fifth chord.
// A shimmer layer at E6 floats above both notes for the final ~80ms —
// a tiny angelic overtone shimmer.  Long reverb tail.

function synthSuccess(): Float32Array {
  const dur    = 0.20;
  const buf    = alloc(dur);
  const note1  = noteToHz("C#", 5);   // 554 Hz
  const note2  = noteToHz("F#", 5);   // 740 Hz — perfect fourth up

  // Choir partial amplitudes (harmonic 1..4)
  const chAmp1 = [1.00, 0.35, 0.18, 0.08];
  const chAmp2 = [1.00, 0.30, 0.14, 0.06];

  const n1Start = 0;
  const n2Start = Math.floor(0.090 * SAMPLE_RATE);
  const envLen1 = buf.length - n1Start;
  const envLen2 = buf.length - n2Start;
  const env1    = adsr(envLen1, 0.018, 0.025, 0.72, 0.120);
  const env2    = adsr(envLen2, 0.015, 0.020, 0.70, 0.095);

  for (let i = n1Start; i < buf.length; i++) {
    const t  = i / SAMPLE_RATE;
    const tD = Math.max(0, t - n1Start / SAMPLE_RATE);
    const v  = choirPartials(note1, t, chAmp1, tD * 2.5);
    buf[i] += v * env1[i - n1Start];
  }
  for (let i = n2Start; i < buf.length; i++) {
    const t  = i / SAMPLE_RATE;
    const tD = Math.max(0, t - n2Start / SAMPLE_RATE);
    const v  = choirPartials(note2, t, chAmp2, tD * 2.5);
    buf[i] += v * env2[i - n2Start];
  }

  // Shimmer crown — E6 floats above both voices in the final stretch
  const shimStart = Math.floor(0.120 * SAMPLE_RATE);
  const shimFreq  = noteToHz("E", 6);   // 1318 Hz
  for (let i = shimStart; i < buf.length; i++) {
    const t      = i / SAMPLE_RATE;
    const tLocal = (i - shimStart) / SAMPLE_RATE;
    const decay  = Math.exp(-tLocal / 0.095);
    buf[i] += shimmerOsc(shimFreq, 3.2, t) * decay * 0.14;
  }

  addReverb(buf, 0.65, 0.42);
  normalise(buf, 0.72);
  declick(buf, 80);
  return buf;
}

// ---------------------------------------------------------------------------
// error.wav — low, soft, warm hum — gentle "hmm" of concern, ~150ms
// ---------------------------------------------------------------------------
//
// Design: G3 (196 Hz) as the fundamental — low but not threatening.  Three
// harmonics rendered with smooth attack and gentle pitch sag (frequency drifts
// down very slightly over time, like a voice dropping in concern).  No noise,
// no harsh buzz.  Warm and empathetic.

function synthError(): Float32Array {
  const dur  = 0.15;
  const buf  = alloc(dur);
  const base = noteToHz("G", 3);   // 196 Hz — low, round, gentle

  const env        = adsr(buf.length, 0.020, 0.040, 0.60, 0.070);
  let   phase1 = 0, phase2 = 0, phase3 = 0;

  for (let i = 0; i < buf.length; i++) {
    const t        = i / SAMPLE_RATE;
    const dt       = 1 / SAMPLE_RATE;
    // Subtle pitch sag — frequency drifts down 3% by the end (the "hmm" inflection)
    const sagMult  = 1 - (t / dur) * 0.03;
    const f1       = base * sagMult;
    const f2       = base * 2 * sagMult;
    const f3       = base * 3 * sagMult;
    phase1 += f1 * dt;
    phase2 += f2 * dt;
    phase3 += f3 * dt;
    // Harmonic blend — third harmonic very quiet to keep it smooth and round
    const v =
      Math.sin(2 * Math.PI * phase1) * 1.00 +
      Math.sin(2 * Math.PI * phase2) * 0.22 +
      Math.sin(2 * Math.PI * phase3) * 0.06;
    buf[i] = v * env[i];
  }

  addReverb(buf, 0.30, 0.28);
  normalise(buf, 0.55);
  declick(buf, 64);
  return buf;
}

// ---------------------------------------------------------------------------
// toggle.wav — whisper-soft click with airy reverb tail, ~60ms
// ---------------------------------------------------------------------------
//
// Design: a tiny, inaudible-attack shimmer tone at C6 (1047 Hz) — imagine a
// glass fingertip brush.  Very short, very quiet.  Smooth attack (4ms), fast
// exponential decay.  The reverb tail is the whole sound — it evaporates like
// a breath.

function synthToggle(): Float32Array {
  const dur  = 0.06;
  const buf  = alloc(dur);
  const freq = noteToHz("C", 6);   // 1047 Hz — airy, delicate

  const atkSamples = Math.floor(0.004 * SAMPLE_RATE);

  for (let i = 0; i < buf.length; i++) {
    const t       = i / SAMPLE_RATE;
    const atkGain = i < atkSamples ? 0.5 * (1 - Math.cos(Math.PI * i / atkSamples)) : 1.0;
    const decay   = Math.exp(-t / 0.032);
    // Shimmer pair at C6 — two sines 8 cents apart
    const v = shimmerOsc(freq, freq * 0.00462, t);
    buf[i]  = v * decay * atkGain;
  }

  addReverb(buf, 0.70, 0.50);   // heavy reverb — the tail IS the sound
  normalise(buf, 0.38);          // whisper quiet
  declick(buf, 32);
  return buf;
}

// ---------------------------------------------------------------------------
// delete.wav — soft dissolving shimmer, stardust fading, ~150ms
// ---------------------------------------------------------------------------
//
// Design: a cluster of three frequencies (E5, G#5, B5 — E major triad) that
// each have very soft attacks and slow decays, but are staggered by a few ms
// so they appear to dissolve sequentially rather than all at once.  The
// combined fade produces the "stardust dispersing" quality — like watching
// light scatter and disappear.

function synthDelete(): Float32Array {
  const dur  = 0.15;
  const buf  = alloc(dur);

  // E major triad — bright but not harsh, distinctly ethereal when fading
  const notes: Array<[number, number, number]> = [
    [noteToHz("E",  5), 0.000, 1.00],   // E5  — root
    [noteToHz("G#", 5), 0.008, 0.82],   // G#5 — major third (8ms stagger)
    [noteToHz("B",  5), 0.016, 0.65],   // B5  — fifth (16ms stagger — dissolves last)
  ];

  for (const [freq, onsetSec, relAmp] of notes) {
    const onsetSample = Math.floor(onsetSec * SAMPLE_RATE);
    for (let i = onsetSample; i < buf.length; i++) {
      const t       = i / SAMPLE_RATE;
      const tLocal  = (i - onsetSample) / SAMPLE_RATE;
      // Soft 8ms cosine attack
      const atkSamp = Math.floor(0.008 * SAMPLE_RATE);
      const atkGain = (i - onsetSample) < atkSamp
        ? 0.5 * (1 - Math.cos(Math.PI * (i - onsetSample) / atkSamp))
        : 1.0;
      // Decay rate is different per note — higher frequencies fade faster
      const dTime  = 0.085 - (freq / noteToHz("B", 5)) * 0.015;
      const decay  = Math.exp(-tLocal / Math.max(0.020, dTime));
      buf[i] += shimmerOsc(freq, freq * 0.0035, t) * decay * atkGain * relAmp;
    }
  }

  addReverb(buf, 0.65, 0.45);
  normalise(buf, 0.52);
  declick(buf, 64);
  return buf;
}

// ---------------------------------------------------------------------------
// completion.wav — ascending angelic chord with shimmering overtones, ~475ms
// ---------------------------------------------------------------------------
//
// Design: C major arpeggio (C5-E5-G5-C6), but each voice is a rich choir-pad
// tone — not a bell.  Slower attacks (12ms per voice), voices staggered 80ms
// apart, building into a soft-wash chord by the end.  Each voice uses the
// detuned shimmer oscillator for that heavenly quality.
//
// Final phase: a shimmer crown of E6+G6 fades in at 300ms at very low level,
// giving the impression of light pouring through stained glass — warm and rich.

function synthCompletion(): Float32Array {
  const DUR = 0.475;
  const out = alloc(DUR);

  const C5 = noteToHz("C", 5);   //  523.25 Hz
  const E5 = noteToHz("E", 5);   //  659.25 Hz
  const G5 = noteToHz("G", 5);   //  783.99 Hz
  const C6 = noteToHz("C", 6);   // 1046.50 Hz

  // Each arpeggio voice: [freq, onsetSec, relAmp, decayTimeForChoirPartials]
  const voices: Array<[number, number, number]> = [
    [C5, 0.000, 0.78],
    [E5, 0.080, 0.84],
    [G5, 0.165, 0.90],
    [C6, 0.255, 1.00],
  ];

  // Choir pad partial amplitudes
  const chAmps = [1.00, 0.42, 0.20, 0.09, 0.04];

  for (const [freq, onsetSec, relAmp] of voices) {
    const onset     = Math.floor(onsetSec * SAMPLE_RATE);
    const voiceLen  = out.length - onset;
    const env       = adsr(voiceLen, 0.012, 0.025, 0.78, Math.max(0.060, (DUR - onsetSec - 0.037 - 0.025)));

    for (let i = 0; i < voiceLen; i++) {
      const t      = (onset + i) / SAMPLE_RATE;
      const tDecay = i / SAMPLE_RATE;
      // Main choir tone
      const choir  = choirPartials(freq, t, chAmps, tDecay * 1.2);
      // Detuned shimmer (8 cents)
      const shim   = shimmerOsc(freq, freq * 0.00462, t) * 0.30;
      out[onset + i] += (choir * 0.70 + shim) * env[i] * relAmp;
    }
  }

  // Shimmer crown — E6 + G6 fades in gently at 300ms
  const E6          = noteToHz("E", 6);
  const G6          = noteToHz("G", 6);
  const crownOnset  = Math.floor(0.300 * SAMPLE_RATE);

  for (let i = crownOnset; i < out.length; i++) {
    const t      = i / SAMPLE_RATE;
    const tLocal = (i - crownOnset) / SAMPLE_RATE;
    // Slow bloom — takes 80ms to fully appear
    const bloom  = Math.min(1.0, tLocal / 0.080);
    const decay  = Math.exp(-tLocal / 0.220);
    out[i] += shimmerOsc(E6, 2.8, t) * bloom * decay * 0.18;
    out[i] += shimmerOsc(G6, 3.5, t) * bloom * decay * 0.13;
  }

  addReverb(out, 0.70, 0.40);
  normalise(out, 0.78);
  declick(out, 96);
  return out;
}

// ---------------------------------------------------------------------------
// ultra-completion.wav — full celestial choir moment, ~900ms
// ---------------------------------------------------------------------------
//
// Design: a transcendent, multi-phase experience.
//
// PHASE 1 — Choir ascent (0–550ms)
//   A seven-note rising choir-pad sequence: C4, G4, C5, E5, G5, C6, E6.
//   Each voice is a rich choir tone (5 harmonics, shimmer detuning) with a
//   slow 20ms attack.  Notes are spaced ~65ms apart.
//   A bass C3 pedal (pure warm sine with slow decay) enters at t=0, providing
//   a deep, cathedral-organ foundation.
//
// PHASE 2 — Angelic chord bloom (480ms–900ms)
//   At 480ms, C major voices (C4, E4, G4, C5) all swell in simultaneously
//   with a 40ms attack — a gentle "opening of the heavens" rather than a
//   struck chord.  Each voice uses choirPartials() for maximum warmth.
//   Slow LFO tremolo (2.5 Hz, 3% depth) gives the sustained chord a breathing
//   quality — like a choir sustaining a final vowel.
//
// PHASE 3 — Cascade shimmer (650ms–900ms)
//   A cascade of high shimmer tones (E6, G6, C7, E7) enter in quick
//   succession, each tiny and brief, cascading down in amplitude like light
//   streaming through a high window — the "golden light" effect.
//
// PHASE 4 — Long reverb dissolution
//   The heavy reverb (roomSize=0.85) means the entire sound floats on a
//   cathedral-scale reverb cloud for its entire duration.

function synthUltraCompletion(): Float32Array {
  const DUR = 0.900;
  const out = alloc(DUR);

  // Frequency table
  const C3 = noteToHz("C", 3);   //  130.81 Hz
  const C4 = noteToHz("C", 4);   //  261.63 Hz
  const E4 = noteToHz("E", 4);   //  329.63 Hz
  const G4 = noteToHz("G", 4);   //  392.00 Hz
  const C5 = noteToHz("C", 5);   //  523.25 Hz
  const E5 = noteToHz("E", 5);   //  659.25 Hz
  const G5 = noteToHz("G", 5);   //  783.99 Hz
  const C6 = noteToHz("C", 6);   // 1046.50 Hz
  const E6 = noteToHz("E", 6);   // 1318.51 Hz
  const G6 = noteToHz("G", 6);   // 1567.98 Hz
  const C7 = noteToHz("C", 7);   // 2093.00 Hz
  const E7 = noteToHz("E", 7);   // 2637.02 Hz

  // --- PHASE 1: Choir ascent ---
  const ascentNotes: Array<[number, number, number]> = [
    [C4, 0.000, 0.72],
    [G4, 0.065, 0.76],
    [C5, 0.135, 0.80],
    [E5, 0.210, 0.85],
    [G5, 0.285, 0.90],
    [C6, 0.365, 0.95],
    [E6, 0.455, 1.00],
  ];

  const ascentAmps = [1.00, 0.40, 0.20, 0.10, 0.05];

  for (const [freq, onsetSec, relAmp] of ascentNotes) {
    const onset    = Math.floor(onsetSec * SAMPLE_RATE);
    const voiceLen = out.length - onset;
    const relLen   = Math.min(voiceLen, Math.ceil(0.42 * SAMPLE_RATE));
    const relTime  = DUR - onsetSec - 0.02 - 0.025;
    const env      = adsr(relLen, 0.020, 0.030, 0.75, Math.min(0.30, relTime));

    for (let i = 0; i < relLen; i++) {
      const t     = (onset + i) / SAMPLE_RATE;
      const tD    = i / SAMPLE_RATE;
      const choir = choirPartials(freq, t, ascentAmps, tD * 1.0);
      const shim  = shimmerOsc(freq, freq * 0.00289, t) * 0.28;
      out[onset + i] += (choir * 0.72 + shim) * env[i] * relAmp;
    }
  }

  // --- Bass pedal: C3 sine, whole duration ---
  {
    const pedalLen = Math.ceil(0.750 * SAMPLE_RATE);
    const k        = Math.log(1000) / (0.620 * SAMPLE_RATE);
    for (let i = 0; i < pedalLen; i++) {
      const t       = i / SAMPLE_RATE;
      const atkGain = i < Math.floor(0.015 * SAMPLE_RATE)
        ? i / Math.floor(0.015 * SAMPLE_RATE) : 1.0;
      const decay   = Math.exp(-k * i);
      out[i]       += (Math.sin(2 * Math.PI * C3 * t) * 0.80 +
                       Math.sin(2 * Math.PI * C3 * 2 * t) * 0.18) * atkGain * decay * 0.38;
    }
  }

  // --- PHASE 2: Angelic chord bloom at 480ms ---
  {
    const chordOnset   = Math.floor(0.480 * SAMPLE_RATE);
    const chordNotes   = [C4, E4, G4, C5];
    const chordAmps    = [0.88, 0.80, 0.82, 1.00];
    const chordAmpsArr = [1.00, 0.38, 0.18, 0.08, 0.04];

    const chordLen     = out.length - chordOnset;
    // LFO tremolo for breathing choir sustain
    const lfoRate      = 2.5;     // Hz
    const lfoDepth     = 0.030;   // 3% amplitude modulation
    const lfoRamp      = 0.080;   // seconds until tremolo reaches full depth

    for (let n = 0; n < chordNotes.length; n++) {
      const freq   = chordNotes[n];
      const amp    = chordAmps[n];
      const env    = adsr(chordLen, 0.040, 0.050, 0.82, 0.250);

      for (let i = 0; i < chordLen; i++) {
        const t          = (chordOnset + i) / SAMPLE_RATE;
        const tLocal     = i / SAMPLE_RATE;
        const lfoBloom   = Math.min(1.0, tLocal / lfoRamp);
        const tremolo    = 1.0 + lfoDepth * lfoBloom * Math.sin(2 * Math.PI * lfoRate * tLocal);
        const choir      = choirPartials(freq, t, chordAmpsArr, tLocal * 0.8);
        const shim       = shimmerOsc(freq, freq * 0.00231, t) * 0.22;
        out[chordOnset + i] += (choir * 0.78 + shim) * env[i] * amp * tremolo * 0.60;
      }
    }
  }

  // --- PHASE 3: Cascade shimmer (650ms–900ms) ---
  // High tones cascading down in a staggered waterfall of light
  const cascade: Array<[number, number, number, number]> = [
    [E7, 0.650, 0.008, 0.14],   // [freq, onset, attackSec, amp]
    [C7, 0.685, 0.010, 0.16],
    [G6, 0.718, 0.012, 0.18],
    [E6, 0.748, 0.014, 0.16],
    [C7, 0.775, 0.008, 0.10],   // second pass — E7 echoes back
    [E7, 0.800, 0.006, 0.08],
  ];

  for (const [freq, onsetSec, atkSec, amp] of cascade) {
    const onset   = Math.floor(onsetSec * SAMPLE_RATE);
    const atkSamp = Math.floor(atkSec * SAMPLE_RATE);
    for (let i = onset; i < out.length; i++) {
      const t      = i / SAMPLE_RATE;
      const tLocal = (i - onset) / SAMPLE_RATE;
      const atkGain = (i - onset) < atkSamp
        ? 0.5 * (1 - Math.cos(Math.PI * (i - onset) / atkSamp)) : 1.0;
      const decay  = Math.exp(-tLocal / 0.075);
      out[i] += shimmerOsc(freq, freq * 0.00577, t) * decay * atkGain * amp;
    }
  }

  addReverb(out, 0.85, 0.48);   // cathedral-scale reverb — the whole sound floats
  normalise(out, 0.82);
  declick(out, 128);
  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const OUT_DIR = "/Users/yifengsun/dev/pina/sounds/dreamy";

mkdirSync(OUT_DIR, { recursive: true });

console.log("\nGenerating pina dreamy sound profile...\n");

writeSoundFile(OUT_DIR, "navigate.wav",          synthNavigate(0));
writeSoundFile(OUT_DIR, "enter.wav",             synthEnter());
writeSoundFile(OUT_DIR, "back.wav",              synthBack());
writeSoundFile(OUT_DIR, "action.wav",            synthAction());
writeSoundFile(OUT_DIR, "success.wav",           synthSuccess());
writeSoundFile(OUT_DIR, "error.wav",             synthError());
writeSoundFile(OUT_DIR, "toggle.wav",            synthToggle());
writeSoundFile(OUT_DIR, "delete.wav",            synthDelete());
writeSoundFile(OUT_DIR, "completion.wav",        synthCompletion());
writeSoundFile(OUT_DIR, "ultra-completion.wav",  synthUltraCompletion());

console.log();

// navigate_0 through navigate_11 — 12 chromatic variants (celestial bells in sequence)
for (let i = 0; i < 12; i++) {
  writeSoundFile(OUT_DIR, `navigate_${i}.wav`, synthNavigate(i));
}

console.log("\nDone. All dreamy sound files written to:", OUT_DIR, "\n");
