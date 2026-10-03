import { deepEqual } from "@/lib/utils";

/**
 * The values this client has written to one column, per row, so the Realtime
 * echo of each write can be recognised and dropped. Written for the encounter
 * runner's Wild Shape form (`party_members.wildshape_state`), where a "latest
 * value only" guard like `lastWrittenHp` is not enough: two quick writes A then
 * B mean echo A arrives after the runner already shows B, matches neither the
 * latest write nor the combatant, and would put the beast back to A's hit
 * points.
 *
 * Values are compared structurally. The echo is jsonb, which Postgres stores in
 * its own key order, so comparing `JSON.stringify` output never matched and
 * every echo read as a change from elsewhere.
 */
export interface WriteEchoes<V> {
  /** Record a value as sent, before the write goes out. */
  sent(rowId: string, value: V): void;
  /** The write carrying `value` failed: no echo of it will come. */
  failed(rowId: string, value: V): void;
  /**
   * Whether an incoming row value should be ignored. An echo of one of our
   * writes is consumed with every older write (echoes arrive in commit order).
   * While any write of ours is still unechoed, other values are ignored too:
   * they are older states the row passed through, and our pending write
   * supersedes them in the row anyway.
   */
  isOwn(rowId: string, value: V): boolean;
  /** Forget everything, after a resync has re-read the rows outright. */
  clear(): void;
}

export function createWriteEchoes<V>(): WriteEchoes<V> {
  const pending = new Map<string, V[]>();

  return {
    sent(rowId, value) {
      // A snapshot: the caller's value may be a live reactive object.
      const copy = value === undefined ? value : (JSON.parse(JSON.stringify(value)) as V);
      pending.set(rowId, [...(pending.get(rowId) ?? []), copy]);
    },
    failed(rowId, value) {
      const values = pending.get(rowId);
      if (!values) return;
      const at = values.findIndex((v) => deepEqual(v, value));
      if (at >= 0) values.splice(at, 1);
      if (values.length === 0) pending.delete(rowId);
    },
    isOwn(rowId, value) {
      const values = pending.get(rowId);
      if (!values) return false;
      const at = values.findIndex((v) => deepEqual(v, value));
      if (at >= 0) values.splice(0, at + 1);
      if (values.length === 0) pending.delete(rowId);
      return true;
    },
    clear() {
      pending.clear();
    },
  };
}
