import { ref } from "vue";
import { useAiAcknowledgements } from "@/composables/ai/useAiAcknowledgements";
import { AI_LIKENESS_NOTICE_VERSION } from "@/lib/legal";

/**
 * Module-scoped singleton — one likeness dialog at a time, shared by every
 * `LikenessNoticeGate` mount (the DM shell and the player shell both mount
 * one, same as `AiUseNoticeGate`) and every caller of `ensureLikenessAck`
 * across the app. Mirrors `useAiUseNoticeDismissal`'s device-singleton style,
 * not `useUiStore`/`localStorage` — this is a one-shot per-call gate, not
 * list-filter state.
 */
const open = ref(false);
let pendingResolve: ((acknowledged: boolean) => void) | null = null;

export function useLikenessGate() {
  const { hasAcknowledged } = useAiAcknowledgements();

  /**
   * Client pre-flight for the EU AI Act likeness gate (context/compliance/
   * provenance-architecture.md §3) — call before any portrait-bearing
   * generation (Simulacrum stylize/sculpt, chronicle scene references, group
   * portrait, NPC disguise). Resolves `true` immediately if the account
   * already acknowledged the current version. Otherwise opens the dialog
   * mounted by `LikenessNoticeGate` and resolves once the user confirms
   * (the dialog itself records the acknowledgement) or cancels. Callers must
   * abort silently on `false` — the user declined, no error toast. This is a
   * UX nicety only; `forge-mini` and `generate-chronicle-image` enforce the
   * same rule server-side regardless.
   */
  function ensureLikenessAck(): Promise<boolean> {
    if (hasAcknowledged("likeness", AI_LIKENESS_NOTICE_VERSION)) return Promise.resolve(true);
    return new Promise((resolve) => {
      pendingResolve = resolve;
      open.value = true;
    });
  }

  function confirm() {
    pendingResolve?.(true);
    pendingResolve = null;
  }

  function cancel() {
    pendingResolve?.(false);
    pendingResolve = null;
  }

  return { open, ensureLikenessAck, confirm, cancel };
}
