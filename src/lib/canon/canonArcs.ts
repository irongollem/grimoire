import type { CanonArc, CanonArcPatch, CanonArcStatus } from "@/composables/canon/useCanonArcs";

export const ARC_STATUS_OPTIONS: readonly { value: CanonArcStatus; label: string }[] = [
  { value: "planned", label: "Planned" },
  { value: "running", label: "Running" },
  { value: "ended", label: "Ended" },
];

/**
 * The write that sets an arc's status. An ending belongs to an ended arc alone (the table refuses it otherwise, 23514),
 * so leaving Ended clears the ending in the same statement, never in a second one that could fail between the two.
 */
export function statusPatch(arc: Pick<CanonArc, "status">, next: CanonArcStatus): CanonArcPatch {
  return arc.status === "ended" && next !== "ended" ? { status: next, ending: null } : { status: next };
}
