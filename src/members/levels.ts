// Copied from ManuQueue's src/lib/permissions.ts

const PERMISSION_LEVEL_LABELS: Record<number, string> = {
  1: "Admin",
  2: "Leadership",
  // 3 is retired (was Lower Leadership), and reads as Leadership
  4: "Member",
  5: "Pending",
};

/** Retired level 3 counts as 2 (Leadership). */
export function liveLevel(level: number): number {
  return level === 3 ? 2 : level;
}

/**
 * Same as ManuQueue's normalizePermissionLevel: retired 3 is Leadership, and
 * anything unknown counts as Pending.
 */
export function normalizeLevel(level: number): 1 | 2 | 4 | 5 {
  if (level === 1) return 1;
  if (level === 2 || level === 3) return 2;
  if (level === 4) return 4;
  return 5;
}

/** Full label for a level, tolerating retired/unknown values. */
export function levelLabel(level: number): string {
  return PERMISSION_LEVEL_LABELS[liveLevel(level)] ?? `Level ${level}`;
}
