/**
 * Typed localStorage management for Sieve.
 * All keys are versioned to guarantee backward compatibility.
 */

export interface RevealPackage {
  version: 1
  funderAddress: string
  tenderId: string
  bidderAddress: string
  priceWei: string // decimal string
  proposalUrl: string
  proposalHash: string
  salt: string
  commitment: string
  savedAt: number
}

export interface ActivityRecord {
  funderAddress: string
  tenderId: string
  title?: string
  role: 'funder' | 'bidder' | 'viewer'
  pinned: boolean
  lastInteractedAt: number
}

const REVEAL_KEY_PREFIX = 'sieve:v1:reveal:'
const REGISTRY_KEY = 'sieve:v1:registry'

export function getRevealStorageKey(funder: string, tenderId: string, bidder: string): string {
  return `${REVEAL_KEY_PREFIX}${funder.trim().toLowerCase()}:${tenderId.trim()}:${bidder.trim().toLowerCase()}`
}

export function saveRevealPackage(pkg: RevealPackage): void {
  try {
    const key = getRevealStorageKey(pkg.funderAddress, pkg.tenderId, pkg.bidderAddress)
    localStorage.setItem(key, JSON.stringify(pkg))
  } catch (err) {
    console.error('Failed to save reveal package to localStorage:', err)
  }
}

export function loadRevealPackage(funder: string, tenderId: string, bidder: string): RevealPackage | null {
  try {
    const key = getRevealStorageKey(funder, tenderId, bidder)
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as RevealPackage
    if (parsed.version === 1) return parsed
    return null
  } catch (err) {
    console.error('Failed to read reveal package from localStorage:', err)
    return null
  }
}

export function deleteRevealPackage(funder: string, tenderId: string, bidder: string): void {
  try {
    const key = getRevealStorageKey(funder, tenderId, bidder)
    localStorage.removeItem(key)
  } catch (err) {
    console.error('Failed to delete reveal package from localStorage:', err)
  }
}

// ------------------------ Activity Registry ------------------------

export function loadActivityRegistry(): ActivityRecord[] {
  try {
    const raw = localStorage.getItem(REGISTRY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed as ActivityRecord[]
    return []
  } catch {
    return []
  }
}

export function saveActivityRegistry(registry: ActivityRecord[]): void {
  try {
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry))
  } catch (err) {
    console.error('Failed to save activity registry:', err)
  }
}

export function recordActivity(record: ActivityRecord): void {
  const current = loadActivityRegistry()
  const funderKey = record.funderAddress.trim().toLowerCase()
  const tenderId = record.tenderId.trim()

  const existingIdx = current.findIndex(
    (r) => r.funderAddress.toLowerCase() === funderKey && r.tenderId === tenderId
  )

  if (existingIdx >= 0) {
    current[existingIdx] = {
      ...current[existingIdx],
      ...record,
      lastInteractedAt: Date.now(),
      pinned: record.pinned ?? current[existingIdx].pinned,
    }
  } else {
    current.unshift({
      ...record,
      lastInteractedAt: Date.now(),
    })
  }

  // Cap at 100 entries
  if (current.length > 100) {
    current.splice(100)
  }

  saveActivityRegistry(current)
}

export function togglePinActivity(funder: string, tenderId: string): void {
  const current = loadActivityRegistry()
  const funderKey = funder.trim().toLowerCase()
  const id = tenderId.trim()

  const item = current.find(
    (r) => r.funderAddress.toLowerCase() === funderKey && r.tenderId === id
  )
  if (item) {
    item.pinned = !item.pinned
    saveActivityRegistry(current)
  }
}

export function exportActivityJson(): string {
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    activity: loadActivityRegistry(),
  }
  return JSON.stringify(data, null, 2)
}

export function importActivityJson(jsonStr: string): { importedCount: number } {
  const parsed = JSON.parse(jsonStr)
  if (!parsed || !Array.isArray(parsed.activity)) {
    throw new Error('Invalid activity backup format')
  }

  const existing = loadActivityRegistry()
  let count = 0

  for (const item of parsed.activity) {
    if (item.funderAddress && item.tenderId) {
      const idx = existing.findIndex(
        (e) =>
          e.funderAddress.toLowerCase() === item.funderAddress.toLowerCase() &&
          e.tenderId === item.tenderId
      )
      if (idx >= 0) {
        existing[idx] = { ...existing[idx], ...item }
      } else {
        existing.push(item)
      }
      count++
    }
  }

  saveActivityRegistry(existing)
  return { importedCount: count }
}
