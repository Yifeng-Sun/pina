import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { loadRegistry } from './config.js'

function resolveSymlinkPath(): string {
  const registry = loadRegistry()
  return registry.config.symlinkPath.replace(/^~/, os.homedir())
}

export function updateSymlink(targetPath: string): void {
  const linkPath = resolveSymlinkPath()

  // Remove existing symlink if present
  if (fs.existsSync(linkPath) || fs.lstatSync(linkPath).isSymbolicLink()) {
    fs.unlinkSync(linkPath)
  }

  fs.symlinkSync(targetPath, linkPath, 'dir')
}

export function removeSymlink(): void {
  const linkPath = resolveSymlinkPath()

  try {
    if (fs.lstatSync(linkPath).isSymbolicLink()) {
      fs.unlinkSync(linkPath)
    }
  } catch {
    // Symlink doesn't exist, nothing to do
  }
}

export function getCurrentSymlinkTarget(): string | undefined {
  const linkPath = resolveSymlinkPath()

  try {
    if (fs.lstatSync(linkPath).isSymbolicLink()) {
      return fs.readlinkSync(linkPath)
    }
  } catch {
    return undefined
  }

  return undefined
}

export function getSymlinkPath(): string {
  return resolveSymlinkPath()
}
