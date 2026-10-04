import { computed, type Ref } from "vue";
import { refDebounced } from "@vueuse/core";
import { useQuery } from "@tanstack/vue-query";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import { previewHandoutShare, useShareHandout } from "@/composables/scriptorium/useScriptorium";
import type { HandoutShareResult, ScriptoriumDocument } from "@/types/scriptorium.types";

/** What the share flow needs to know about a document. */
export type ShareableHandout = Pick<
  ScriptoriumDocument,
  "id" | "title" | "campaign_id" | "player_visible_to" | "updated_at"
>;

/** PostgREST errors are plain objects with a message, not `Error` instances. */
export function shareErrorMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "object" && e !== null && "message" in e && typeof e.message === "string") {
    return e.message;
  }
  return "Could not update who has this handout.";
}

/**
 * The two writes of the handout flow, shared by the desktop control, the phone
 * button and the pending-reveal banner so there is one place that shares and
 * one that takes a handout back (#970).
 */
export function useHandoutSharing() {
  const { mutateAsync, isPending } = useShareHandout();
  const { confirm } = useConfirm();
  const toast = useToast();

  /** Sets the recipients and applies the reveals. No email: a handout is given
   *  at the table, and players see it arrive in their journal. */
  function share(documentId: string, partyMemberIds: string[]): Promise<HandoutShareResult> {
    return mutateAsync({ id: documentId, partyMemberIds });
  }

  /** Asks first, then withdraws the handout from everyone. Never un-reveals entries. */
  async function takeBack(documentId: string): Promise<boolean> {
    const ok = await confirm("Players will no longer see this handout. What it revealed stays revealed.", {
      title: "Take it back from everyone?",
      confirmLabel: "Take it back",
    });
    if (!ok) return false;
    try {
      await mutateAsync({ id: documentId, partyMemberIds: [] });
      toast.success("Handout taken back.");
      return true;
    } catch (e) {
      toast.error(shareErrorMessage(e));
      return false;
    }
  }

  return { share, takeBack, isSharing: isPending };
}

/**
 * Linked entries a shared handout would still reveal (the DM linked a new NPC
 * after sharing, say). It is the dry run against the current recipients,
 * re-run a moment after each save of the document; nothing is ever revealed
 * from here.
 */
export function usePendingHandoutReveals(doc: Ref<ShareableHandout | null | undefined>) {
  const settledAt = refDebounced(
    computed(() => doc.value?.updated_at ?? ""),
    800,
  );
  const recipients = computed(() => doc.value?.player_visible_to ?? []);
  const query = useQuery({
    queryKey: computed(
      () =>
        [
          "scriptorium",
          doc.value?.id ?? "",
          "pending-reveals",
          settledAt.value,
          [...recipients.value].sort().join(","),
        ] as const,
    ),
    queryFn: () => {
      const current = doc.value;
      if (!current) throw new Error("No handout to check");
      return previewHandoutShare(current.id, current.player_visible_to);
    },
    enabled: () => !!doc.value && !!doc.value.campaign_id && recipients.value.length > 0,
  });
  const pending = computed(() => query.data.value?.revealed.length ?? 0);
  return { pending };
}
