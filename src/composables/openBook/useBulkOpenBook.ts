import { computed, ref, toValue, type MaybeRefOrGetter } from "vue";
import { useParty } from "@/composables/party/useParty";
import { useToast } from "@/composables/useToast";
import { useOpenBook } from "@/composables/openBook/useOpenBook";
import { bookWrite } from "@/composables/openBook/useBookReveal";
import { useClearOpenBookEntries, useSetOpenBookEntries } from "@/composables/openBook/useOpenBookEntries";
import { useCampaignStore } from "@/stores/campaign";
import type { OpenBookEntityType } from "@/types/openBook.types";

/** Splits a selection into the ids the book can take (by the kind's own rule) and the ones it cannot. */
export function splitByEligibility(
  ids: readonly string[],
  isEligible: (id: string, partyIds: readonly string[]) => boolean,
  partyIds: readonly string[],
): { eligible: string[]; skipped: string[] } {
  const eligible: string[] = [];
  const skipped: string[] = [];
  for (const id of ids) (isEligible(id, partyIds) ? eligible : skipped).push(id);
  return { eligible, skipped };
}

/** The toast line after "Add to Open Book". */
export function addToBookMessage(added: number, skipped: number, noun: string): string {
  const plural = (n: number) => `${n} ${noun}${n === 1 ? "" : "s"}`;
  if (added === 0) return `Nothing added: ${plural(skipped)} not ready for the book yet.`;
  const base = `Added ${plural(added)} to the Open Book.`;
  return skipped === 0 ? base : `${base} Skipped ${skipped} not ready for the book.`;
}

/**
 * "Add to Open Book" / "Take out of Open Book" for a list's bulk bar (#1085). Owner-only and only once the campaign
 * has a book, like the reveal control's section. Adding skips entries the book cannot take (the kind's own rule,
 * as the database applies it at release), and says how many it skipped.
 */
export function useBulkOpenBook(options: {
  entityType: OpenBookEntityType;
  /** Singular noun for toasts ("NPC", "faction"). */
  noun: string;
  selectedIds: MaybeRefOrGetter<readonly string[]>;
  /** Whether the book can take this entry now; `partyIds` is the campaign's party. */
  isEligible: (id: string, partyIds: readonly string[]) => boolean;
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
      const { eligible, skipped } = splitByEligibility(toValue(options.selectedIds), options.isEligible, partyIds);
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
