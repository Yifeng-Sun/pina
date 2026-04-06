/**
 * regenerate-dreamy-navigate.ts
 *
 * Regenerates navigate.wav and navigate_0.wav–navigate_11.wav for the dreamy profile.
 *
 * Design: tiny glass bell in a cathedral — whisper-quiet, crystalline, holy.
 *
 * Synthesis approach (per note):
 *   1. Two pure sine waves detuned ~3 cents apart → gentle shimmer/beating
 *   2. One sine at the octave above (2× frequency) at 15% amplitude → bell partial
 *   3. Raised-cosine fade-in (first 8ms of 50ms = 16% of total) — sounds bloom
 *   4. Exponential decay over the full duration → natural bell ring-off
 *   5. Normalise to 22% peak — whisper-quiet
 *
 * Frequencies: navigate_0 = C6 (1046.50 Hz), each subsequent variant +1 semitone.
 *              navigate.wav = identical to navigate_0.wav.
 *
 * Format: 44100 Hz, mono, 16-bit PCM WAV. No external dependencies.
 *
 * Run with:  npx tsx scripts/regenerate-dreamy-navigate.ts
 */

import { writeFileSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SAMPLE_RATE  = 44100;
const BIT_DEPTH    = 16;
const NUM_CHANNELS = 1;
const OUT_DIR      = "/Users/yifengsun/dev/pina/sounds/dreamy";

// Synthesis parameters
const DURATION_SEC   = 0.050;          // 50 ms
const DETUNE_CENTS   = 3;              // detune between the two fundamental sines
const HARMONIC_GAIN  = 0.15;           // octave partial relative to fundamental
const ATTACK_SEC     = 0.008;          // 8 ms raised-cosine fade-in
const DECAY_TIME_SEC = 0.060;          // exponential decay constant (slightly > duration so tail is still ringing)
const TARGET_PEAK    = 0.22;           // 22% — whisper-quiet

// C6 in equal temperament: 261.63 * 4 = 1046.50 Hz
// MIDI note numbers: C4=60, C5=72, C6=84. A4=69 is the reference (440 Hz).
const C6_HZ = 440 * Math.pow(2, (84 - 69) / 12); // MIDI 84 = C6 = 1046.50 Hz

// ---------------------------------------------------------------------------
// WAV writer — same approach as generate-dreamy.ts
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

function writeSoundFile(name: string, samples: Float32Array): void {
  const buf     = samplesToWav(samples);
  const outPath = join(OUT_DIR, name);
  writeFileSync(outPath, buf);
  const ms = (samples.length / SAMPLE_RATE * 1000).toFixed(0);
  console.log(`  wrote ${name}  (${samples.length} samples, ${ms} ms)`);
}

// ---------------------------------------------------------------------------
// DSP helpers
// ---------------------------------------------------------------------------

/** Shift a frequency by a given number of cents (1/100 of a semitone). */
function shiftCents(hz: number, cents: number): number {
  return hz * Math.pow(2, cents / 1200);
}

/** Shift a frequency by a given number of semitones. */
function shiftSemitones(hz: number, semitones: number): number {
  return hz * Math.pow(2, semitones / 12);
}

/** Normalise so the peak absolute value equals targetPeak. */
function normalise(samples: Float32Array, targetPeak: number): void {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i]) > peak) peak = Math.abs(samples[i]);
  }
  if (peak === 0) return;
  const gain = targetPeak / peak;
  for (let i = 0; i < samples.length; i++) samples[i] *= gain;
}

// ---------------------------------------------------------------------------
// Core generator — produces one navigate tone at the given root frequency
// ---------------------------------------------------------------------------

function generateNavigateTone(rootHz: number): Float32Array {
  const numSamples  = Math.ceil(SAMPLE_RATE * DURATION_SEC);
  const attackSamps = Math.floor(ATTACK_SEC * SAMPLE_RATE);

  // The detune ratio: one sine slightly above, one slightly below
  const freqLo      = shiftCents(rootHz, -DETUNE_CENTS / 2);  // -1.5 cents
  const freqHi      = shiftCents(rootHz, +DETUNE_CENTS / 2);  // +1.5 cents
  const freqOctave  = rootHz * 2;                              // octave harmonic (bell partial)

  // Exponential decay constant: reach e^(-k*N) ≈ 0.001 at DECAY_TIME_SEC
  const kDecay = Math.log(1000) / (DECAY_TIME_SEC * SAMPLE_RATE);

  const samples = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;

    // Raised-cosine fade-in (blooms into existence, no click)
    const fadeIn = i < attackSamps
      ? 0.5 * (1 - Math.cos(Math.PI * i / attackSamps))
      : 1.0;

    // Exponential decay — bell ring-off
    const decay = Math.exp(-kDecay * i);

    // Combined envelope
    const env = fadeIn * decay;

    // Three oscillators:
    //   - fundamental pair (detuned sines, equal weight, sum to 1.0 amplitude)
    //   - octave harmonic at 15% for bell colour
    const osc =
      0.5 * Math.sin(2 * Math.PI * freqLo     * t) +
      0.5 * Math.sin(2 * Math.PI * freqHi     * t) +
      HARMONIC_GAIN * Math.sin(2 * Math.PI * freqOctave * t);

    samples[i] = env * osc;
  }

  // Normalise to whisper-quiet peak
  normalise(samples, TARGET_PEAK);
  return samples;
}

// ---------------------------------------------------------------------------
// Main — generate and write all 13 files
// ---------------------------------------------------------------------------

console.log("Generating dreamy navigate sounds...");
console.log(`  Root: C6 = ${C6_HZ.toFixed(2)} Hz`);
console.log(`  Detune: ±${DETUNE_CENTS / 2} cents`);
console.log(`  Duration: ${DURATION_SEC * 1000} ms`);
console.log(`  Peak level: ${(TARGET_PEAK * 100).toFixed(0)}%`);
console.log();

// navigate_0 through navigate_11: C6 chromatically up
for (let i = 0; i < 12; i++) {
  const hz      = shiftSemitones(C6_HZ, i);
  const samples = generateNavigateTone(hz);
  writeSoundFile(`navigate_${i}.wav`, samples);
}

// navigate.wav is identical to navigate_0.wav (C6)
const navigate0 = generateNavigateTone(C6_HZ);
writeSoundFile("navigate.wav", navigate0);

console.log("\nDone.");
