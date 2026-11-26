/** Types for scripts/heavy-lock.mjs, a plain Node script (no build step) that its test imports. */
export interface HeavyLockOwner {
  pid: number;
  label: string;
  cwd: string;
  command: string;
  startedAt: string;
}

export const LOCK_DIR: string;
export function isAlive(pid: number): boolean;
export function readOwner(dir?: string): HeavyLockOwner | null;
export function tryAcquire(owner: HeavyLockOwner, dir?: string, now?: number): HeavyLockOwner | null;
export function release(pid: number, dir?: string): void;
