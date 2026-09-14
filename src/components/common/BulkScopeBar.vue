<template>
  <div
    class="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-sm"
  >
    <span aria-live="polite" class="text-label-lg text-foreground">{{ count }} selected</span>

    <!-- Nothing on screen can be re-scoped: every row here belongs to the
         shared library, which no campaign owns. Said out loud rather than
         leaving the DM to tick at cards that will not tick (#875). -->
    <span v-if="selectableCount === 0" class="text-caption text-muted-foreground">
      Nothing here can be moved — these entries come from the shared library.
    </span>
    <template v-else>
      <AppButton variant="ghost" size="sm" label="Select all shown" tooltip="Selects every row matching the current filters, not only what's painted on screen" @click="emit('select-all')" />
      <AppButton variant="ghost" size="sm" label="Clear" :disabled="count === 0" @click="emit('clear')" />
    </template>

    <div class="ml-auto flex flex-wrap items-center gap-2">
      <AppButton
        v-if="selectableCount > 0"
        variant="primary"
        size="sm"
        :label="campaignName ? `Move to ${campaignName}` : 'Move to campaign'"
        :disabled="!campaignName || busy || count === 0"
        :tooltip="campaignName ? undefined : 'No active campaign — switch to one to move rows there'"
        @click="onMoveToCampaign"
      />
      <AppButton
        v-if="selectableCount > 0"
        variant="outline"
        size="sm"
        label="Make available in all campaigns"
        :disabled="busy || count === 0"
        @click="emit('move', null)"
      />
      <AppButton
        v-if="selectableCount > 0"
        variant="outline"
        size="sm"
        label="Copy to campaign…"
        tooltip="Makes an independent copy somewhere else — the original stays where it is"
        :disabled="busy || count === 0"
        @click="emit('copy')"
      />
      <AppButton variant="ghost" size="sm" label="Done" @click="emit('stop')" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Bulk selection toolbar (#875) — docked above the grid it governs (`sticky`,
 * never `fixed`, matching `DockBar`'s docking idiom). Offers exactly the two
 * scopes `CampaignScopeField` offers a single row: the active campaign, or
 * "every campaign" (`campaign_id: null`) — never a third option, so there is
 * no campaign picker here either.
 *
 * `campaignName` is display-only, resolved by the caller; the actual id to
 * move rows to is read from the campaign store directly, the same dependency
 * `CampaignScopeField` already has — the bar always means "the active
 * campaign", never an arbitrary one.
 *
 * **Copy is the exception to that, and deliberately so (#598).** "Copy to
 * campaign…" opens `CopyToCampaignDialog`, which does offer a picker of every
 * campaign the account DMs. The no-picker rule above exists so the bulk and
 * single-row *scope* controls cannot come to mean different things — both
 * answer "where does this row live", and `CampaignScopeField` can only say
 * "here" or "everywhere". Copy answers a different question: it creates a new
 * row somewhere the original is not, so there is no single-row scope control
 * for it to diverge from, and "the active campaign" is precisely the one place
 * a copy is never wanted. The asymmetry that leaves — you may copy into any
 * campaign but still move only between the active one and general — is the
 * shape of #596's decision, not an oversight to tidy up here.
 */
import AppButton from "@/components/common/AppButton.vue";
import { useCampaignStore } from "@/stores/campaign";

const { count, busy = false, campaignName, selectableCount = 1 } = defineProps<{
  count: number;
  busy?: boolean;
  /** How many rows on screen could be selected at all. Zero means every row
   *  here is shared-library content, which no campaign owns — the bar says so
   *  instead of offering actions that cannot apply. Defaults to 1 so a caller
   *  that does not know simply gets the ordinary bar. */
  selectableCount?: number;
  /** The active campaign's name, or null when there is no active campaign.
   *  Resolved by the caller (mirrors CampaignScopeField's own lookup). */
  campaignName: string | null;
}>();

const emit = defineEmits<{
  "select-all": [];
  clear: [];
  stop: [];
  move: [campaignId: string | null];
  copy: [];
}>();

const campaignStore = useCampaignStore();

function onMoveToCampaign() {
  if (!campaignName) return;
  emit("move", campaignStore.activeCampaignId);
}
</script>
