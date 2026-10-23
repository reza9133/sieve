import { z } from 'zod';

const PREFIX = 'sieve:v1:';

function read(key: string): string | null {
  try {
    return localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): boolean {
  try {
    localStorage.setItem(PREFIX + key, value);
    return true;
  } catch {
    return false;
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* storage unavailable: nothing to remove */
  }
}

export const store = { read, write, remove };

/* ------------------------------------------------------------------ reveal package */

export const revealPackageSchema = z.object({
  funder: z.string().regex(/^0x[0-9a-f]{40}$/),
  tenderId: z.string().min(1).max(64),
  bidder: z.string().regex(/^0x[0-9a-f]{40}$/),
  priceWei: z.string().regex(/^\d+$/),
  proposalUrl: z.string().min(1).max(512),
  proposalHash: z.string().regex(/^0x[0-9a-f]{64}$/),
  salt: z.string().regex(/^[A-Za-z0-9_.~-]{16,64}$/),
  commitment: z.string().regex(/^0x[0-9a-f]{64}$/),
  createdAt: z.number().int().nonnegative().optional(),
});
export type RevealPackage = z.infer<typeof revealPackageSchema>;

export const backupFileSchema = z.object({
  kind: z.literal('sieve-reveal-backup'),
  version: z.literal(1),
  package: revealPackageSchema,
});

export function revealKey(funder: string, tenderId: string, bidder: string): string {
  return `reveal:${funder.toLowerCase()}:${tenderId}:${bidder.toLowerCase()}`;
}

export function saveRevealPackage(pkg: RevealPackage): boolean {
  return write(revealKey(pkg.funder, pkg.tenderId, pkg.bidder), JSON.stringify(pkg));
}

export function loadRevealPackage(funder: string, tenderId: string, bidder: string): RevealPackage | null {
  const raw = read(revealKey(funder, tenderId, bidder));
  if (!raw) return null;
  try {
    return revealPackageSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function makeBackupJson(pkg: RevealPackage): string {
  return JSON.stringify({ kind: 'sieve-reveal-backup', version: 1, package: pkg }, null, 2);
}

export function parseBackupJson(text: string): { ok: true; pkg: RevealPackage } | { ok: false; error: string } {
  try {
    const parsed = backupFileSchema.safeParse(JSON.parse(text));
    if (!parsed.success) return { ok: false, error: 'This file is not a Sieve reveal backup.' };
    return { ok: true, pkg: parsed.data.package };
  } catch {
    return { ok: false, error: 'This file is not valid JSON.' };
  }
}

/* ------------------------------------------------------------------ activity registry */

export const registryEntrySchema = z.object({
  funder: z.string().regex(/^0x[0-9a-f]{40}$/),
  tenderId: z.string().min(1).max(64),
  title: z.string().max(200).optional(),
  tags: z.array(z.enum(['opened', 'bid', 'viewed', 'pinned'])).max(4),
  updatedAt: z.number().int().nonnegative(),
});
export type RegistryEntry = z.infer<typeof registryEntrySchema>;

export const registryFileSchema = z.object({
  kind: z.literal('sieve-activity'),
  version: z.literal(1),
  entries: z.array(registryEntrySchema).max(500),
});

export function loadRegistry(): RegistryEntry[] {
  const raw = read('registry');
  if (!raw) return [];
  try {
    return z.array(registryEntrySchema).parse(JSON.parse(raw));
  } catch {
    return [];
  }
}

function saveRegistry(entries: RegistryEntry[]): void {
  write('registry', JSON.stringify(entries.slice(0, 500)));
}

export type RegistryTag = RegistryEntry['tags'][number];

export function recordActivity(
  funder: string,
  tenderId: string,
  tag: RegistryTag,
  title?: string,
  now: number = Date.now(),
): RegistryEntry[] {
  const key = `${funder.toLowerCase()}:${tenderId}`;
  const entries = loadRegistry();
  const existing = entries.find((e) => `${e.funder}:${e.tenderId}` === key);
  if (existing) {
    if (!existing.tags.includes(tag)) existing.tags.push(tag);
    if (title) existing.title = title.slice(0, 200);
    existing.updatedAt = now;
  } else {
    entries.push({
      funder: funder.toLowerCase(),
      tenderId,
      title: title?.slice(0, 200),
      tags: [tag],
      updatedAt: now,
    });
  }
  entries.sort((a, b) => b.updatedAt - a.updatedAt);
  saveRegistry(entries);
  return entries;
}

export function togglePin(funder: string, tenderId: string): RegistryEntry[] {
  const key = `${funder.toLowerCase()}:${tenderId}`;
  const entries = loadRegistry();
  const entry = entries.find((e) => `${e.funder}:${e.tenderId}` === key);
  if (!entry) return recordActivity(funder, tenderId, 'pinned');
  entry.tags = entry.tags.includes('pinned') ? entry.tags.filter((t) => t !== 'pinned') : [...entry.tags, 'pinned'];
  saveRegistry(entries);
  return entries;
}

export function removeEntry(funder: string, tenderId: string): RegistryEntry[] {
  const key = `${funder.toLowerCase()}:${tenderId}`;
  const entries = loadRegistry().filter((e) => `${e.funder}:${e.tenderId}` !== key);
  saveRegistry(entries);
  return entries;
}

export function exportRegistryJson(): string {
  return JSON.stringify({ kind: 'sieve-activity', version: 1, entries: loadRegistry() }, null, 2);
}

export function importRegistryJson(text: string): { ok: true; count: number } | { ok: false; error: string } {
  try {
    const parsed = registryFileSchema.safeParse(JSON.parse(text));
    if (!parsed.success) return { ok: false, error: 'This file is not a Sieve activity export.' };
    const merged = new Map<string, RegistryEntry>();
    for (const entry of [...loadRegistry(), ...parsed.data.entries]) {
      const key = `${entry.funder}:${entry.tenderId}`;
      const prev = merged.get(key);
      if (!prev || prev.updatedAt < entry.updatedAt) {
        merged.set(key, { ...entry, tags: [...new Set([...(prev?.tags ?? []), ...entry.tags])] });
      }
    }
    const entries = [...merged.values()].sort((a, b) => b.updatedAt - a.updatedAt);
    saveRegistry(entries);
    return { ok: true, count: parsed.data.entries.length };
  } catch {
    return { ok: false, error: 'This file is not valid JSON.' };
  }
}

/** Every reveal package saved in this browser (used by the Tools page backup list). */
export function listRevealPackages(): RevealPackage[] {
  const out: RevealPackage[] = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key?.startsWith(`${PREFIX}reveal:`)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = revealPackageSchema.safeParse(JSON.parse(raw));
      if (parsed.success) out.push(parsed.data);
    }
  } catch {
    /* storage unavailable or corrupt entry: list what we have */
  }
  return out.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}
