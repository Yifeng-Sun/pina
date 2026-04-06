import { spawn } from 'node:child_process'
import { loadRegistry, saveRegistry } from './config.js'

// macOS system sounds mapped to UI events
const SOUNDS = {
  navigate:   '/System/Library/Sounds/Tink.aiff',
  enter:      '/System/Library/Sounds/Pop.aiff',
  back:       '/System/Library/Sounds/Morse.aiff',
  action:     '/System/Library/Sounds/Glass.aiff',
  success:    '/System/Library/Sounds/Hero.aiff',
  error:      '/System/Library/Sounds/Basso.aiff',
  toggle:     '/System/Library/Sounds/Bottle.aiff',
  delete:     '/System/Library/Sounds/Funk.aiff',
} as const

export type SoundEvent = keyof typeof SOUNDS

export function playSound(event: SoundEvent): void {
  const registry = loadRegistry()
  if (registry.config.muted) return

  const file = SOUNDS[event]
  // Fire and forget — spawn detached so it doesn't block
  const child = spawn('afplay', [file], {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
}

export function isMuted(): boolean {
  return loadRegistry().config.muted
}

export function setMuted(muted: boolean): void {
  const registry = loadRegistry()
  registry.config.muted = muted
  saveRegistry(registry)
}

export function toggleMute(): boolean {
  const registry = loadRegistry()
  registry.config.muted = !registry.config.muted
  saveRegistry(registry)
  return registry.config.muted
}
