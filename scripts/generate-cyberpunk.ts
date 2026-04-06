/**
 * generate-cyberpunk.ts
 *
 * Generates the "cyberpunk" UI sound profile for pina.
 * Character: metallic, industrial, harsh-digital — Blade Runner terminal aesthetics.
 *
 * Synthesis techniques used beyond the default profile:
 *   - Sawtooth oscillator (harmonically dense, aggressive timbre)
 *   - Hard clipping / soft saturation (distortion / "crunch")
 *   - FM synthesis (metallic, inharmonic bell-like tones)
 *   - Ring modulation (harsh digital artifacts)
 *   - Bit-crush effect (sample-and-hold at reduced effective rate)
 *   - One-pole high-pass filter (thin out low end for "chrome" feel)
 *   - Comb filter (metallic resonance)
 *   - Phase-accumulator oscillators (sweep without discontinuities)
 *
 * Format: 44100 Hz, mono, 16-bit PCM WAV. No external dependencies.
 * Run with:  npx tsx scripts/generate-cyberpunk.ts
 */

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SAMPLE_RATE   = 44100;
const BIT_DEPTH     = 16;
const NUM_CHANNELS  = 1;

// ---------------------------------------------------------------------------
// WAV file writer (identical approach to generate-sounds.ts)
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

function shiftSemitones(hz: number, semitones: number): number {
  return hz * Math.pow(2, semitones / 12);
}

/** ADSR envelope — all times in seconds, sustain is a level 0..1. */
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

/** Exponential decay envelope — starts at 1, decays to ~0 over decayTime seconds. */
function expDecay(numSamples: number, decayTime: number): Float32Array {
  const env = new Float32Array(numSamples);
  const k   = Math.log(1000) / (decayTime * SAMPLE_RATE);
  for (let i = 0; i < numSamples; i++) {
    env[i] = Math.exp(-k * i);
  }
  return env;
}

/** Pure sine oscillator at time t (seconds). */
function sine(freq: number, t: number): number {
  return Math.sin(2 * Math.PI * freq * t);
}

/**
 * Sawtooth wave via a band-limited sum of harmonics (Gibbs ringing minimised).
 * Uses the first N harmonics: amplitude = 1/n with alternating sign.
 * Cyberpunk uses this extensively — it is harmonically dense and aggressive.
 */
function saw(freq: number, t: number, harmonics = 12): number {
  let v = 0;
  for (let n = 1; n <= harmonics; n++) {
    v += (Math.pow(-1, n + 1) / n) * Math.sin(2 * Math.PI * freq * n * t);
  }
  return v * (2 / Math.PI); // normalise peak to ~1
}

/**
 * Square wave via band-limited sum of odd harmonics.
 * Hollow, buzzy — good for digital stutter effects.
 */
function square(freq: number, t: number, harmonics = 9): number {
  let v = 0;
  for (let n = 1; n <= harmonics * 2; n += 2) {
    v += (1 / n) * Math.sin(2 * Math.PI * freq * n * t);
  }
  return v * (4 / Math.PI); // normalise peak to ~1
}

/**
 * Hard clipping distortion — clips signal at ±threshold then scales back.
 * Creates rich odd harmonics: the signature sound of overdriven electronics.
 */
function hardClip(v: number, threshold = 0.5): number {
  return Math.max(-threshold, Math.min(threshold, v)) / threshold;
}

/**
 * Soft saturation via tanh — smoother distortion, still harmonically rich.
 * More "tube warmth" than hard clip, but still aggressive at high drive.
 */
function softSat(v: number, drive = 3.0): number {
  return Math.tanh(v * drive) / Math.tanh(drive);
}

/**
 * FM synthesis sample: carrier + modulator phase relationship.
 * The modulator sidebands create inharmonic metallic partials.
 * modIndex controls the depth of modulation — higher = more metallic.
 */
function fm(
  carrierHz: number,
  modHz: number,
  modIndex: number,
  t: number
): number {
  const modPhase = 2 * Math.PI * modHz * t;
  const carPhase = 2 * Math.PI * carrierHz * t + modIndex * Math.sin(modPhase);
  return Math.sin(carPhase);
}

/** One-pole low-pass filter. Updates state in-place. */
function lpFilter(sample: number, cutoffHz: number, state: Float32Array): number {
  const rc    = 1 / (2 * Math.PI * cutoffHz);
  const dt    = 1 / SAMPLE_RATE;
  const alpha = dt / (rc + dt);
  state[0]   += alpha * (sample - state[0]);
  return state[0];
}

/**
 * One-pole high-pass filter — removes low-frequency body.
 * Gives sounds a "thin chrome" character: useful for metallic ticks and sparks.
 */
function hpFilter(sample: number, cutoffHz: number, state: Float32Array): number {
  const rc    = 1 / (2 * Math.PI * cutoffHz);
  const dt    = 1 / SAMPLE_RATE;
  const alpha = rc / (rc + dt);
  const y     = alpha * (state[1] + sample - state[0]);
  state[0]    = sample;
  state[1]    = y;
  return y;
}

/**
 * Deterministic XOR-shift pseudo-random noise generator.
 * Returns a closure to keep state encapsulated per-sound.
 */
function makeNoiseGen(seed = 0x12345678): () => number {
  let s = seed;
  return function nextNoise(): number {
    s ^= s << 13;
    s ^= s >> 17;
    s ^= s << 5;
    return (s & 0xffff) / 0x8000 - 1;
  };
}

/**
 * Bit-crush effect — sample-and-hold at a reduced effective sample rate.
 * `crushFactor` = ratio of SAMPLE_RATE to target bit-crushed rate.
 * Creates the lo-fi, pixelated digital artifacts of old samplers and glitch art.
 * Returns a stateful function to call per-sample.
 */
function makeBitCrusher(crushFactor: number): (v: number) => number {
  let holdCounter = 0;
  let held        = 0;
  const period    = Math.max(1, Math.round(crushFactor));
  return function crush(v: number): number {
    if (holdCounter === 0) held = v;
    holdCounter = (holdCounter + 1) % period;
    return held;
  };
}

/**
 * Mix a source buffer into a destination at startSample with a gain multiplier.
 */
function mixIn(dest: Float32Array, src: Float32Array, startSample: number, gain = 1.0): void {
  const end = Math.min(dest.length, startSample + src.length);
  for (let i = startSample; i < end; i++) {
    dest[i] += src[i - startSample] * gain;
  }
}

/** Normalise so peak absolute value equals targetPeak. */
function normalise(samples: Float32Array, targetPeak = 0.85): void {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i]) > peak) peak = Math.abs(samples[i]);
  }
  if (peak === 0) return;
  const gain = targetPeak / peak;
  for (let i = 0; i < samples.length; i++) samples[i] *= gain;
}

/** Short linear fade-in/out to kill clicks at buffer edges. */
function declick(samples: Float32Array, fadeSamples = 64): void {
  const fade = Math.min(fadeSamples, Math.floor(samples.length / 4));
  for (let i = 0; i < fade; i++) {
    const g = i / fade;
    samples[i]                      *= g;
    samples[samples.length - 1 - i] *= g;
  }
}

// ---------------------------------------------------------------------------
// Sound synthesisers
// ---------------------------------------------------------------------------

/**
 * navigate — metallic chrome tick.
 *
 * Design: A short burst of FM synthesis where the modulator is tuned to a
 * non-integer ratio of the carrier, producing inharmonic metallic partials
 * (the hallmark of struck metal). High-passed to strip out warmth and leave
 * only the brittle chrome shimmer. Very fast expDecay so it vanishes instantly.
 *
 * semitoneShift: shifts the base carrier frequency for the 12-variant set.
 */
function synthNavigate(semitoneShift = 0): Float32Array {
  const dur      = 0.05;
  const samples  = alloc(dur);
  const baseHz   = noteToHz("G", 5); // 784 Hz — mid-high, unobtrusive
  const carrier  = shiftSemitones(baseHz, semitoneShift);
  // Modulator at 2.37x carrier — produces inharmonic metallic sidebands
  const modHz    = carrier * 2.37;
  const modIndex = 3.5; // deep enough for metallic character, not overly chaotic

  const env    = expDecay(samples.length, dur * 0.45);
  const hpSt   = new Float32Array(2);

  for (let i = 0; i < samples.length; i++) {
    const t = i / SAMPLE_RATE;
    // FM core — metallic inharmonic tone
    let v = fm(carrier, modHz, modIndex, t) * 0.7;
    // Add a faint saw at the carrier for extra edge
    v += saw(carrier, t, 6) * 0.25;
    // High-pass at 800 Hz — removes warmth, leaves only chrome shimmer
    v  = hpFilter(v, 800, hpSt);
    samples[i] = v * env[i];
  }

  normalise(samples, 0.38); // deliberately quiet — navigate should be subtle
  declick(samples, 32);
  return samples;
}

/**
 * enter — electronic lock engaging.
 *
 * Design: A sharp digital buzz-click in two phases:
 *   1. Brief hard-clipped square burst (the "engage" click transient)
 *   2. Short FM tone at a mid-high pitch (the magnetic latch resonance)
 * The two layers overlap and the hard clipping gives it that harsh-digital edge.
 */
function synthEnter(): Float32Array {
  const dur     = 0.08;
  const samples = alloc(dur);
  const freq    = noteToHz("E", 5); // 659 Hz — confirm tone
  const modFreq = freq * 3.5;       // FM modulator at non-integer ratio
  const noise   = makeNoiseGen(0xABCDEF01);

  // Phase 1: sharp click transient (first 15ms)
  const clickDur  = Math.floor(0.015 * SAMPLE_RATE);
  const clickEnv  = expDecay(clickDur, 0.008);

  // Phase 2: FM buzz tone with fast ADSR
  const buzzEnv = adsr(samples.length, 0.002, 0.025, 0.55, 0.035);
  const hpSt    = new Float32Array(2);

  for (let i = 0; i < samples.length; i++) {
    const t = i / SAMPLE_RATE;

    // FM buzz layer — metallic confirm tone
    let v = fm(freq, modFreq, 2.8, t) * buzzEnv[i] * 0.8;

    // Click transient overlay — hard-clipped noise burst in first 15ms
    if (i < clickDur) {
      const clickNoise = hardClip(noise() * 2.0, 0.6) * clickEnv[i] * 0.5;
      v += clickNoise;
    }

    // Light high-pass to keep it from getting muddy
    v = hpFilter(v, 300, hpSt);
    samples[i] = v;
  }

  normalise(samples, 0.65);
  declick(samples, 24);
  return samples;
}

/**
 * back — descending digital glitch/stutter.
 *
 * Design: A sawtooth wave that exponentially chirps downward (like a
 * capacitor discharging), passed through a bit-crusher that steps the
 * effective sample rate, creating the stuttering quantisation artifact.
 * The crush factor itself increases over time so the glitch gets worse
 * as the pitch drops — evoking a signal degrading.
 */
function synthBack(): Float32Array {
  const dur       = 0.1;
  const samples   = alloc(dur);
  const freqStart = noteToHz("E", 5); // 659 Hz
  const freqEnd   = noteToHz("A", 3); // 220 Hz — a major third below
  const env       = adsr(samples.length, 0.003, 0.035, 0.35, 0.055);
  const hpSt      = new Float32Array(2);
  let   sawPhase  = 0;

  for (let i = 0; i < samples.length; i++) {
    const t        = i / SAMPLE_RATE;
    const progress = t / dur;

    // Exponential frequency sweep downward
    const instFreq = freqStart * Math.pow(freqEnd / freqStart, progress);

    // Phase-accumulator saw — avoids discontinuities in the sweep
    sawPhase      += instFreq / SAMPLE_RATE;
    // Sawtooth from phase: 2*(phase - floor(phase+0.5)) normalised to -1..1
    const sawVal   = 2 * (sawPhase - Math.floor(sawPhase + 0.5));

    // Bit-crush: crush factor increases from ~2 to ~8 as pitch descends
    // (simulates an increasingly degraded digital signal)
    const crushFactor = 2 + progress * 6;
    const period      = Math.max(1, Math.round(crushFactor));
    // Inline sample-and-hold so we don't need closure state per-sample
    const slotIndex   = Math.floor(i / period) * period;
    const slotPhase   = slotIndex * instFreq / SAMPLE_RATE;
    const crushed     = 2 * (slotPhase - Math.floor(slotPhase + 0.5));

    // Blend clean and crushed (more crushed as it descends)
    const v = sawVal * (1 - progress * 0.6) + crushed * (progress * 0.6);

    samples[i] = hpFilter(v * env[i], 200, hpSt);
  }

  normalise(samples, 0.6);
  declick(samples, 32);
  return samples;
}

/**
 * action — electric spark / zap.
 *
 * Design: Fast-attack, punchy electric discharge:
 *   - Noise burst through a narrow bandpass (centre at ~3 kHz) for the
 *     "sizzle" of an electrical arc
 *   - Ring modulation between a sawtooth and a sine — creates sidebands
 *     that sound like crackling electricity
 *   - Sharp transient attack, fast exponential decay
 */
function synthAction(): Float32Array {
  const dur     = 0.12;
  const samples = alloc(dur);
  const baseHz  = noteToHz("A", 5); // 880 Hz carrier
  const ringHz  = baseHz * 1.618;   // golden ratio — maximally inharmonic, harsh
  const noise   = makeNoiseGen(0xDEADC0DE);
  const env     = adsr(samples.length, 0.001, 0.018, 0.45, 0.08);
  const decayEnv = expDecay(samples.length, 0.06);
  const lpSt    = new Float32Array(1);
  const hpSt    = new Float32Array(2);

  for (let i = 0; i < samples.length; i++) {
    const t   = i / SAMPLE_RATE;
    const envVal = env[i] * decayEnv[i]; // combine ADSR + exp for sharp punch

    // Ring modulation: carrier saw × ring sine = dense sideband cluster
    const carrier = saw(baseHz, t, 8);
    const ring    = sine(ringHz, t);
    const ringMod = carrier * ring * 0.6; // ring-mod output

    // Narrow bandpass noise: LP at 5kHz then HP at 2kHz = band ~2-5 kHz
    const rawNoise = noise();
    const bpNoise  = lpFilter(rawNoise, 5000, lpSt);

    // Mix ring-mod + sizzle noise
    let v = ringMod * 0.65 + bpNoise * 0.35;

    // Soft saturation for "electric" edge without harshness overload
    v = softSat(v, 2.5);
    v = hpFilter(v, 400, hpSt);

    samples[i] = v * envVal;
  }

  normalise(samples, 0.72);
  declick(samples, 24);
  return samples;
}

/**
 * success — ascending synth sweep with metallic resonance.
 *
 * Design: An ascending exponential frequency chirp from D4 to D6 (two octaves
 * in 200ms), using an FM oscillator so the sweep sounds metallic rather than
 * pure. A comb filter adds a resonant "singing metal" quality. The FM mod index
 * decreases as pitch rises, so it starts harsh and clears into a bright tone.
 */
function synthSuccess(): Float32Array {
  const dur       = 0.2;
  const samples   = alloc(dur);
  const freqStart = noteToHz("D", 4); // 293.66 Hz
  const freqEnd   = noteToHz("D", 6); // 1174.66 Hz — two octaves up
  const env       = adsr(samples.length, 0.005, 0.05, 0.75, 0.09);
  const hpSt      = new Float32Array(2);

  // Comb filter state: delay line for metallic resonance
  const combDelay  = Math.floor(SAMPLE_RATE / 1200); // ~37 samples @ 1200 Hz resonance
  const combBuf    = new Float32Array(combDelay);
  let   combIdx    = 0;
  const combFeedback = 0.45;

  let sweepPhase = 0;

  for (let i = 0; i < samples.length; i++) {
    const t        = i / SAMPLE_RATE;
    const progress = t / dur;

    // Exponential chirp — frequency doubles every half-duration
    const instFreq = freqStart * Math.pow(freqEnd / freqStart, progress);

    // FM mod index decreases from 4 → 0.5 as pitch rises (harsh → bright)
    const modIndex  = 4.0 * (1 - progress * 0.875) + 0.5;
    const modHz     = instFreq * 2.14; // slightly detuned octave modulator

    // Phase-accumulated FM to track the sweep smoothly
    sweepPhase     += instFreq / SAMPLE_RATE;
    const modSample = Math.sin(2 * Math.PI * modHz * t);
    const fmSample  = Math.sin(2 * Math.PI * sweepPhase + modIndex * modSample);

    // Comb filter: mix current sample with delayed sample (metallic resonance)
    const delayed   = combBuf[combIdx];
    const combOut   = fmSample + delayed * combFeedback;
    combBuf[combIdx] = combOut;
    combIdx = (combIdx + 1) % combDelay;

    // High-pass to keep the metallic shimmer, remove sub bass
    const v = hpFilter(combOut * 0.7, 150, hpSt);
    samples[i] = v * env[i];
  }

  normalise(samples, 0.65);
  declick(samples, 48);
  return samples;
}

/**
 * error — low distorted buzz, like a power failure.
 *
 * Design: A low sawtooth wave hard-clipped into a square-like waveform
 * (maximum harmonic distortion) at a low pitch (Bb2 = 116 Hz).
 * A mild frequency sag (modulated downward) mimics voltage drop.
 * Mixed with a low noise burst through a very narrow low-pass for
 * the "brownout thud" body.
 */
function synthError(): Float32Array {
  const dur     = 0.15;
  const samples = alloc(dur);
  const baseHz  = noteToHz("A#", 2); // 116 Hz — low, ominous
  const noise   = makeNoiseGen(0xBADF00D0);
  const env     = adsr(samples.length, 0.004, 0.055, 0.15, 0.08);
  const lpSt    = new Float32Array(1);
  const hpSt    = new Float32Array(2);
  let   sawPhase = 0;

  for (let i = 0; i < samples.length; i++) {
    const t        = i / SAMPLE_RATE;
    const progress = t / dur;

    // Voltage-sag: frequency drops slightly as if power is failing
    const sag      = 1 - progress * 0.12; // sags 12% from start to end
    const instFreq = baseHz * sag;

    // Phase-accumulator saw for the low buzz
    sawPhase      += instFreq / SAMPLE_RATE;
    const sawVal   = 2 * (sawPhase - Math.floor(sawPhase + 0.5));

    // Hard clip to create maximum harmonic distortion (square-wave-like buzz)
    const clipped  = hardClip(sawVal * 1.8, 0.55);

    // Low noise burst: heavily low-passed for "thud" body
    const noiseSample = lpFilter(noise() * 0.5, 300, lpSt);

    // Mix distorted saw + thud
    let v = clipped * 0.65 + noiseSample * 0.35;

    // Slight high-pass to avoid subwoofer mud
    v = hpFilter(v, 80, hpSt);
    samples[i] = v * env[i];
  }

  normalise(samples, 0.75);
  declick(samples, 32);
  return samples;
}

/**
 * toggle — mechanical relay click with slight metallic ring.
 *
 * Design: Two-part sound:
 *   1. Extremely brief hard-clipped noise burst (the mechanical impact)
 *   2. Short FM tone at a mid frequency (the relay coil ring-down)
 * The relay coil resonance uses FM with a rapidly decaying mod index — sounds
 * like metal springing back after contact, which is exactly what a relay does.
 */
function synthToggle(): Float32Array {
  const dur     = 0.06;
  const samples = alloc(dur);
  const ringHz  = noteToHz("G#", 5); // 831 Hz — metallic "ping"
  const modHz   = ringHz * 2.73;     // inharmonic modulator for metallic character
  const noise   = makeNoiseGen(0xC0FFEE01);

  // Impact: very short noise burst
  const impactDur = Math.floor(0.004 * SAMPLE_RATE);
  const impactEnv = expDecay(impactDur, 0.002);

  // Ring-down: FM tone with fast decay
  const ringEnv   = expDecay(samples.length, 0.025);
  const hpSt      = new Float32Array(2);

  for (let i = 0; i < samples.length; i++) {
    const t = i / SAMPLE_RATE;

    // FM ring-down: mod index decreases as it decays (springing back)
    const modIndex  = 5.0 * Math.exp(-t / 0.008); // fast mod decay
    const ringVal   = fm(ringHz, modHz, modIndex, t) * ringEnv[i] * 0.75;

    // Impact transient
    let v = ringVal;
    if (i < impactDur) {
      v += hardClip(noise() * 3.0, 0.7) * impactEnv[i] * 0.6;
    }

    v = hpFilter(v, 400, hpSt);
    samples[i] = v;
  }

  normalise(samples, 0.52);
  declick(samples, 16);
  return samples;
}

/**
 * delete — digital disintegration / bit-crush descending.
 *
 * Design: A sawtooth pitch-sweeps downward while bit-crush artifacts
 * progressively shred the signal. The crush ratio ramps from minimal
 * (clean at the top) to extreme (8-bit-sounding at the bottom), and
 * an additive noise layer increases as the signal degrades — like a
 * file being corrupted sector by sector.
 */
function synthDelete(): Float32Array {
  const dur       = 0.15;
  const samples   = alloc(dur);
  const freqStart = noteToHz("B", 4);  // 493.88 Hz
  const freqEnd   = noteToHz("F#", 2); // 92.5 Hz
  const env       = adsr(samples.length, 0.004, 0.05, 0.25, 0.08);
  const noise     = makeNoiseGen(0xD15EA5ED);
  const lpSt      = new Float32Array(1);
  const hpSt      = new Float32Array(2);
  let   sawPhase  = 0;

  // Running bit-crush sample-hold state
  let holdVal     = 0;
  let holdCounter = 0;

  for (let i = 0; i < samples.length; i++) {
    const t        = i / SAMPLE_RATE;
    const progress = t / dur;

    // Exponential pitch descent
    const instFreq = freqStart * Math.pow(freqEnd / freqStart, progress);

    // Phase-accumulator saw
    sawPhase      += instFreq / SAMPLE_RATE;
    const sawVal   = 2 * (sawPhase - Math.floor(sawPhase + 0.5));

    // Bit-crush: period grows from 1 (clean) to 16 (heavy 8-bit crunch)
    const crushPeriod = Math.max(1, Math.round(1 + progress * progress * 15));
    if (holdCounter === 0) holdVal = sawVal;
    holdCounter = (holdCounter + 1) % crushPeriod;

    // Corruption noise: rises from 0% to 40% mix as signal degrades
    const noiseMix  = progress * progress * 0.4;
    const noiseVal  = lpFilter(noise() * 0.7, instFreq * 3, lpSt);

    let v = holdVal * (1 - noiseMix) + noiseVal * noiseMix;

    // Soft-clip the whole thing for a gritty edge
    v = softSat(v, 2.0);
    v = hpFilter(v, 100, hpSt);

    samples[i] = v * env[i];
  }

  normalise(samples, 0.62);
  declick(samples, 48);
  return samples;
}

/**
 * completion — ascending synth arpeggio with metallic harmonics.
 * Like a neon sign powering up in sequence.
 *
 * Design: Four-note arpeggio (C4, E4, G4, C5) — a C major sequence — where
 * each note is an FM voice (metallic character) with a sawtooth layer
 * (harmonic density). Notes stagger 80ms apart with overlapping tails.
 * A rising "neon flicker" sweep runs through the entire sound — a sine
 * that ascends and adds an electric shimmer to tie all the notes together.
 *
 * Total duration: ~475ms.
 */
function synthCompletion(): Float32Array {
  const DUR = 0.475;
  const out  = alloc(DUR);

  const notes = [
    noteToHz("C", 4), // 261.63 Hz
    noteToHz("E", 4), // 329.63 Hz
    noteToHz("G", 4), // 392.00 Hz
    noteToHz("C", 5), // 523.25 Hz
  ];

  const onsets    = [0.000, 0.080, 0.165, 0.255];
  const noteAmps  = [0.78, 0.82, 0.86, 1.00];
  const noteDur   = 0.28;
  const noteDecay = 0.20;

  for (let n = 0; n < notes.length; n++) {
    const freq   = notes[n];
    // Modulator at a non-integer ratio for metallic character
    const modHz  = freq * 2.37;
    const noteBuf = alloc(noteDur);
    const env     = adsr(noteBuf.length, 0.003, 0.03, 0.55, 0.12);
    const decay   = expDecay(noteBuf.length, noteDecay);
    const hpSt    = new Float32Array(2);

    for (let i = 0; i < noteBuf.length; i++) {
      const t         = i / SAMPLE_RATE;
      const envVal    = env[i] * decay[i];

      // FM metallic tone — mod index fades from punchy to clean
      const modIndex  = 3.5 * Math.exp(-t / 0.030);
      const fmVal     = fm(freq, modHz, modIndex, t) * 0.65;

      // Sawtooth layer at the same pitch: adds harmonic richness
      const sawVal    = saw(freq, t, 7) * 0.30;

      let v = fmVal + sawVal;
      // Soft-clip for that electric edge without harshness
      v = softSat(v, 1.8);
      v = hpFilter(v, 120, hpSt);

      noteBuf[i] = v * envVal;
    }

    mixIn(out, noteBuf, Math.floor(onsets[n] * SAMPLE_RATE), noteAmps[n]);
  }

  // Neon flicker sweep layer — a sine that rises from C4 to C6 over the full duration
  // at very low amplitude, like high-frequency fluorescent tube noise powering up
  {
    const sweepBuf   = alloc(DUR);
    const sweepStart = noteToHz("C", 4);
    const sweepEnd   = noteToHz("C", 6);
    let   sweepPhase = 0;
    const sweepEnv   = adsr(sweepBuf.length, 0.010, 0.10, 0.60, 0.12);
    const hpSt       = new Float32Array(2);

    for (let i = 0; i < sweepBuf.length; i++) {
      const progress = i / sweepBuf.length;
      const instFreq = sweepStart * Math.pow(sweepEnd / sweepStart, progress * progress);
      sweepPhase    += instFreq / SAMPLE_RATE;
      let v          = Math.sin(2 * Math.PI * sweepPhase);
      v = hpFilter(v, 400, hpSt);
      sweepBuf[i]    = v * sweepEnv[i];
    }
    mixIn(out, sweepBuf, 0, 0.28);
  }

  normalise(out, 0.78);
  declick(out, 48);
  return out;
}

/**
 * ultra-completion — epic cyberpunk fanfare.
 * Layered synths, distorted power chord resolution, electronic sweeps.
 *
 * PHASE 1 — Rising FM arpeggio ascent (0–520ms)
 *   Seven-note rising run (C3 through E5) as FM metallic voices staggered
 *   65ms apart. A bass saw pedal (C2) enters at t=0 and rumbles throughout,
 *   hard-clipped to create an industrial foundation.
 *
 * PHASE 2 — Power chord hit (500ms–900ms)
 *   Sawtooth-based C power chord (C4, G4, C5) lands simultaneously — massive
 *   and distorted through soft saturation. This is the "chrome wall" moment.
 *   The chord has vibrato that ramps in over 60ms for a living, breathing quality.
 *
 * PHASE 3 — Double sweep + metallic shimmer (480ms–900ms)
 *   Two counter-sweeping sine waves: one rising C5→C7, one falling G6→G4,
 *   crossing in the middle — a "neon X" visual-audio metaphor.
 *   Crown: FM metallic shimmer (E6+G#6) at low amplitude trails to the end.
 *
 * Total duration: 900ms.
 */
function synthUltraCompletion(): Float32Array {
  const DUR = 0.900;
  const out  = alloc(DUR);

  // -------------------------------------------------------------------------
  // PHASE 1: Fanfare arpeggio
  // -------------------------------------------------------------------------

  const fanfareNotes: Array<[number, number, number]> = [
    // [freq, onset, amplitude]
    [noteToHz("C", 3), 0.000, 0.70],
    [noteToHz("G", 3), 0.065, 0.73],
    [noteToHz("C", 4), 0.135, 0.77],
    [noteToHz("G", 4), 0.205, 0.81],
    [noteToHz("C", 5), 0.280, 0.86],
    [noteToHz("G", 5), 0.365, 0.92],
    [noteToHz("E", 5), 0.455, 1.00],
  ];

  const fanfareDur   = 0.38;
  const fanfareDecay = 0.30;

  for (const [freq, onset, amp] of fanfareNotes) {
    const modHz  = freq * 2.73; // detuned non-integer ratio for metallic character
    const noteBuf = alloc(fanfareDur);
    const env     = adsr(noteBuf.length, 0.003, 0.04, 0.55, 0.15);
    const decay   = expDecay(noteBuf.length, fanfareDecay);
    const hpSt    = new Float32Array(2);

    for (let i = 0; i < noteBuf.length; i++) {
      const t      = i / SAMPLE_RATE;
      const envVal = env[i] * decay[i];

      // Decaying FM mod index: punchy attack fades to cleaner sustain
      const modIndex = 5.0 * Math.exp(-t / 0.025) + 0.8;
      const fmVal    = fm(freq, modHz, modIndex, t) * 0.60;
      const sawVal   = saw(freq, t, 8) * 0.30;
      const oct      = sine(freq * 2, t) * 0.10;

      let v = fmVal + sawVal + oct;
      v = softSat(v, 2.2);
      v = hpFilter(v, 100, hpSt);
      noteBuf[i] = v * envVal;
    }

    mixIn(out, noteBuf, Math.floor(onset * SAMPLE_RATE), amp);
  }

  // -------------------------------------------------------------------------
  // Bass pedal: hard-clipped sawtooth at C2 — industrial rumble
  // -------------------------------------------------------------------------
  {
    const pedalFreq  = noteToHz("C", 2); // 65.41 Hz
    const pedalDur   = 0.750;
    const pedalBuf   = alloc(pedalDur);
    const decay      = expDecay(pedalBuf.length, 0.55);
    const env        = adsr(pedalBuf.length, 0.015, 0.10, 0.50, 0.30);
    const lpSt       = new Float32Array(1);
    let   sawPhase   = 0;

    for (let i = 0; i < pedalBuf.length; i++) {
      const t      = i / SAMPLE_RATE;
      sawPhase    += pedalFreq / SAMPLE_RATE;
      const rawSaw = 2 * (sawPhase - Math.floor(sawPhase + 0.5));
      // Hard clip for industrial distortion at the bottom end
      let v = hardClip(rawSaw * 2.0, 0.65);
      // Low-pass to keep it from muddying the midrange
      v = lpFilter(v, 400, lpSt);
      pedalBuf[i] = v * env[i] * decay[i];
    }
    mixIn(out, pedalBuf, 0, 0.42);
  }

  // -------------------------------------------------------------------------
  // PHASE 2: Power chord hit (C4, G4, C5) — sawtooth with soft saturation
  // -------------------------------------------------------------------------
  {
    const chordOnset  = 0.500;
    const chordNotes  = [noteToHz("C", 4), noteToHz("G", 4), noteToHz("C", 5)];
    const chordAmps   = [0.90, 0.85, 1.00];
    const chordDur    = DUR - chordOnset;
    const numChord    = Math.ceil(chordDur * SAMPLE_RATE);

    for (let n = 0; n < chordNotes.length; n++) {
      const freq     = chordNotes[n];
      const chordBuf = new Float32Array(numChord);
      const env      = adsr(numChord, 0.004, 0.060, 0.65, 0.280);

      // Vibrato: ramps in over 60ms
      const vibratoRate  = 5.5;
      const vibratoDepth = 0.0035;
      const vibratoRamp  = 0.060;

      // Phase accumulators for each harmonic (for per-sample vibrato)
      const partialRatios = [1.0, 2.0, 3.0, 4.0];
      const partialAmps   = [1.0, 0.50, 0.22, 0.12];
      const phases        = partialRatios.map(() => 0.0);

      const hpSt = new Float32Array(2);

      for (let i = 0; i < numChord; i++) {
        const t          = i / SAMPLE_RATE;
        const dt         = 1 / SAMPLE_RATE;
        const vibratoFade = Math.min(1.0, t / vibratoRamp);
        const vibratoMod  = 1.0 + vibratoDepth * vibratoFade * Math.sin(2 * Math.PI * vibratoRate * t);

        let v = 0;
        for (let p = 0; p < partialRatios.length; p++) {
          phases[p] += freq * partialRatios[p] * vibratoMod * dt;
          v         += Math.sin(2 * Math.PI * phases[p]) * partialAmps[p];
        }

        // Soft saturation: gives the chord its cyberpunk "chrome distortion" edge
        v = softSat(v, 2.8);
        v = hpFilter(v, 120, hpSt);
        chordBuf[i] = v * env[i];
      }

      mixIn(out, chordBuf, Math.floor(chordOnset * SAMPLE_RATE), chordAmps[n] * 0.55);
    }
  }

  // -------------------------------------------------------------------------
  // PHASE 3a: Double sweep — "neon X" rising and falling cross
  // -------------------------------------------------------------------------
  {
    const sweepDur     = 0.240;
    const sweepOnset   = 0.480;
    const numSweep     = Math.ceil(sweepDur * SAMPLE_RATE);

    // Rising sweep: C5 → C7
    const riseStart = noteToHz("C", 5);
    const riseEnd   = noteToHz("C", 7);
    const riseBuf   = new Float32Array(numSweep);
    const riseEnv   = adsr(numSweep, 0.008, 0.040, 0.70, 0.120);
    let   risePhase = 0;

    for (let i = 0; i < numSweep; i++) {
      const p       = i / numSweep;
      const instF   = riseStart * Math.pow(riseEnd / riseStart, p * p);
      risePhase    += instF / SAMPLE_RATE;
      riseBuf[i]    = Math.sin(2 * Math.PI * risePhase) * riseEnv[i];
    }

    // Falling sweep: G6 → G4
    const fallStart = noteToHz("G", 6);
    const fallEnd   = noteToHz("G", 4);
    const fallBuf   = new Float32Array(numSweep);
    const fallEnv   = adsr(numSweep, 0.008, 0.040, 0.70, 0.120);
    let   fallPhase = 0;

    for (let i = 0; i < numSweep; i++) {
      const p       = i / numSweep;
      // Falling uses same exponential curve, just endpoint inverted
      const instF   = fallStart * Math.pow(fallEnd / fallStart, p * p);
      fallPhase    += instF / SAMPLE_RATE;
      fallBuf[i]    = Math.sin(2 * Math.PI * fallPhase) * fallEnv[i];
    }

    mixIn(out, riseBuf, Math.floor(sweepOnset * SAMPLE_RATE), 0.32);
    mixIn(out, fallBuf, Math.floor(sweepOnset * SAMPLE_RATE), 0.28);
  }

  // -------------------------------------------------------------------------
  // PHASE 3b: Metallic crown shimmer (E6 + G#6 FM voices)
  // -------------------------------------------------------------------------
  {
    const shimmerOnset  = 0.660;
    const shimmerDur    = DUR - shimmerOnset;
    const shimmerFreqs  = [noteToHz("E", 6), noteToHz("G#", 6)];
    const shimmerGains  = [0.20, 0.16];

    for (let s = 0; s < shimmerFreqs.length; s++) {
      const freq    = shimmerFreqs[s];
      const modHz   = freq * 2.37;
      const shimBuf = alloc(shimmerDur);
      const decay   = expDecay(shimBuf.length, 0.35);
      const hpSt    = new Float32Array(2);

      for (let i = 0; i < shimBuf.length; i++) {
        const t     = i / SAMPLE_RATE;
        // Very low mod index for a clean metallic shimmer (not harsh)
        let v = fm(freq, modHz, 1.2, t);
        v = hpFilter(v, 600, hpSt);
        shimBuf[i] = v * decay[i];
      }

      mixIn(out, shimBuf, Math.floor(shimmerOnset * SAMPLE_RATE), shimmerGains[s]);
    }
  }

  normalise(out, 0.85);
  declick(out, 64);
  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const OUT_DIR = "/Users/yifengsun/dev/pina/sounds/cyberpunk";

mkdirSync(OUT_DIR, { recursive: true });

console.log("\nGenerating pina cyberpunk UI sounds...\n");

// Core sounds
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

// navigate_0 through navigate_11 — 12 chromatic variants
for (let i = 0; i < 12; i++) {
  writeSoundFile(OUT_DIR, `navigate_${i}.wav`, synthNavigate(i));
}

console.log("\nDone. All files written to:", OUT_DIR, "\n");
