import { computed, ref, toValue, type MaybeRefOrGetter } from "vue";
import { useParty } from "@/composables/party/useParty";
import { useToast } from "@/composables/useToast";
import { useOpenBook } from "@/composables/openBook/useOpenBook";
import { bookWrite } from "@/composables/openBook/useBookReveal";
import { useClearOpenBookEntries, useSetOpenBookEntries } from "@/composables/openBook/useOpenBookEntries";
import { wholeParty } from "@/lib/openBook/eligibility";
import { useCampaignStore } from "@/stores/campaign";
import type { OpenBookEntityType } from "@/types/openBook.types";

/** Splits a selection into the ids that are shared with the whole party and the ones that are not. */
export function splitByWholeParty(
  ids: readonly string[],
  visibleToOf: (id: string) => readonly string[] | null | undefined,
  partyIds: readonly string[],
): { eligible: string[]; skipped: string[] } {
  const eligible: string[] = [];
  const skipped: string[] = [];
  for (const id of ids) (wholeParty(visibleToOf(id), partyIds) ? eligible : skipped).push(id);
  return { eligible, skipped };
}

/** The toast line after "Add to Open Book". */
export function addToBookMessage(added: number, skipped: number, noun: string): string {
  const plural = (n: number) => `${n} ${noun}${n === 1 ? "" : "s"}`;
  if (added === 0) return `Nothing added: ${plural(skipped)} not shared with the whole party yet.`;
  const base = `Added ${plural(added)} to the Open Book.`;
  return skipped === 0 ? base : `${base} Skipped ${skipped} not shared with the whole party.`;
}

/**
 * "Add to Open Book" / "Take out of Open Book" for a list's bulk bar (#1085). Owner-only and only once the campaign
 * has a book, like the reveal control's section. Adding skips entries the whole party cannot see, because the
 * database would leave them out of the release anyway, and says how many it skipped.
 */
export function useBulkOpenBook(options: {
  entityType: OpenBookEntityType;
  /** Singular noun for toasts ("NPC", "faction"). */
  noun: string;
  selectedIds: MaybeRefOrGetter<readonly string[]>;
  visibleToOf: (id: string) => readonly string[] | null | undefined;
}) {
  const campaign = useCampaignStore();
  const toast = useToast();
  const { data: partyData } = useParty();
  const { data: book } = useOpenBook(() => (campaign.isOwner ? campaign.activeCampaignId : null));
  const setEntries = useSetOpenBookEntries();
  const clearEntries = useClearOpenBookEntries();
  const busy = ref(false);

  const available = computed(() => campaign.isOwner && book.value != null);

  async function write(ids: string[], wantInBook: boolean) {
    const current = book.value;
    if (!current || ids.length === 0) return;
    const payload = { campaignId: current.campaign_id, entityType: options.entityType, ids };
    if (bookWrite(wantInBook, current.include_shared) === "clear") await clearEntries.mutateAsync(payload);
    else await setEntries.mutateAsync({ ...payload, included: wantInBook });
  }

  async function run(job: () => Promise<void>) {
    busy.value = true;
    try {
      await job();
    } catch (e) {
      toast.error(toast.fromError(e, "Could not update the Open Book."));
    } finally {
      busy.value = false;
    }
  }

  function add() {
    return run(async () => {
      const partyIds = (partyData.value ?? []).map((m) => m.id);
      const { eligible, skipped } = splitByWholeParty(toValue(options.selectedIds), options.visibleToOf, partyIds);
      await write(eligible, true);
      const message = addToBookMessage(eligible.length, skipped.length, options.noun);
      if (eligible.length === 0) toast.info(message);
      else toast.success(message);
    });
  }

  function remove() {
    return run(async () => {
      const ids = [...toValue(options.selectedIds)];
      await write(ids, false);
      toast.success(`Took ${ids.length} ${options.noun}${ids.length === 1 ? "" : "s"} out of the Open Book.`);
    });
  }

  return { available, busy, add, remove };
}
