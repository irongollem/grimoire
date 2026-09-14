<template>
  <AppModal :open="open" size="md" @close="emit('close')">
    <ModalHeader
      :title="`Copy ${countLabel} to campaign`"
      :icon="IconCopy"
      tone="primary"
      closeable
      @close="emit('close')"
    />

    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">
      <div>
        <label class="block text-eyebrow text-muted-foreground mb-1.5">COPY TO</label>
        <!--
          Sentinel string values ("general" / "") rather than binding null
          straight through AppSelect's generic model — same idiom as
          FeatureDetail.vue's CAMPAIGN SCOPE picker, read back through
          `resolvedTargetId` below.
        -->
        <AppSelect v-model="selectedTarget" tone="card" size="body" weight="normal" block :disabled="!hasTargets">
          <option v-if="offerGeneral" value="general">All campaigns (general)</option>
          <option v-for="c in availableCampaigns" :key="c.id" :value="c.id">{{ c.name }}</option>
        </AppSelect>
        <!--
          Copying a row to the scope it is already in would be a duplicate, a
          different action from this one (see copyToCampaign.ts's "No suffix"
          note) — so that scope is never offered here, which is also the only
          way this list can come up empty.
        -->
        <p v-if="!hasTargets" class="mt-1.5 text-caption text-muted-foreground">
          No other campaign to copy into yet.
        </p>
      </div>

      <p v-if="planning" class="text-caption text-muted-foreground">Checking what will travel…</p>

      <!--
        Rendered only when there is something to report — the common case (no
        dangling references) leaves this a picker and a Copy button and
        nothing else, per the spec: an empty "nothing will be dropped" panel
        is ceremony nobody needs.
      -->
      <div v-else-if="dropped.length" class="rounded-lg border border-border bg-muted/40 p-3 space-y-1.5">
        <p v-for="d in dropped" :key="d.label" class="text-caption text-muted-foreground leading-snug">
          <template v-if="d.removedEntries">
            {{ removedEntriesMessage(d) }}
          </template>
          <template v-else>
            <span class="text-foreground font-semibold">{{ d.label }}</span> — {{ clearedFieldMessage(d) }}
          </template>
        </p>
      </div>

      <!--
        A separate panel from the drop report above, and deliberately toned as a
        note rather than a loss: nothing here is dropped. The copy carries these
        shared-library references intact; the target campaign just has not
        enabled the source that holds them, which is one toggle in its own
        settings. Saying "left behind" here would be false.
      -->
      <div v-if="!planning && needsSources" class="rounded-lg border border-tone-caution/40 bg-tone-caution/5 p-3">
        <p class="text-caption text-ink-caution leading-snug">
          {{ needsSourcesMessage(needsSources) }}
        </p>
      </div>

      <p v-if="planError" class="text-caption text-destructive">{{ planError }}</p>
      <p v-if="copyError" class="text-caption text-destructive">{{ copyError }}</p>
    </div>

    <div class="flex shrink-0 justify-end gap-2 px-5 pb-5 pt-2">
      <AppButton variant="subtle" size="sm" label="Cancel" @click="emit('close')" />
      <AppButton
        variant="primary"
        size="sm"
        :icon="IconCopy"
        :label="copying ? 'Copying…' : 'Copy'"
        :disabled="!canConfirm || copying"
        @click="confirm"
      />
    </div>
  </AppModal>
</template>

<script setup lang="ts">
/**
 * The shared copy-to-campaign dialog (#598, wave 1) — a picker for which of
 * the account's other campaigns (or "general") a selection of rows should be
 * copied into, plus a preview of what would be left behind. The eight
 * list/detail integrations that open this are separate stories; this
 * component owns only the picker, the preview and the confirm step.
 *
 * The dialog does not own a paywall. A quota_exceeded rejection (monsters,
 * puzzle_rooms) is recognised with `isQuotaExceeded` and surfaced as an
 * emitted `quota-exceeded` — the caller already owns a `<PaywallModal>` for
 * its own create flow (see MonsterDetail.vue:559-563, EncounterDetail.vue:570)
 * and reuses it here rather than this dialog growing a second copy.
 */
import { computed, ref, watch } from "vue";
import AppModal from "@/components/common/AppModal.vue";
import ModalHeader from "@/components/common/ModalHeader.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import AppButton from "@/components/common/AppButton.vue";
import { IconCopy } from "@/lib/icons";
import { useDmCampaigns } from "@/composables/campaign/useCampaigns";
import { useCopyToCampaign, planCopy, type LibrarySourceNotice } from "@/composables/campaign/useCopyToCampaign";
import type { BulkScopeTable } from "@/composables/campaign/useBulkCampaignScope";
import type { DroppedReference } from "@/lib/campaign/copyToCampaign";
import { isQuotaExceeded } from "@/lib/quotaError";

const { open, table, ids, sourceCampaignId, label, labelPlural } = defineProps<{
  open: boolean;
  table: BulkScopeTable;
  ids: readonly string[];
  /** The scope the selection is copying FROM — excluded from the target picker. */
  sourceCampaignId: string | null;
  /** Singular noun for what is being copied, e.g. "item". */
  label: string;
  /** Plural form, for an irregular noun (e.g. "species") the naive `${label}s`
   *  default gets wrong. Not a destructuring default: a prop's default cannot
   *  reference another prop — that expression is hoisted into the component's
   *  static `props` options object and evaluated before any instance (or its
   *  props) exists, so `label` there would be a bare, undefined reference. */
  labelPlural?: string;
}>();

const emit = defineEmits<{
  close: [];
  /** `targetName` so the caller's toast can say WHERE the copies landed. The
   *  copy is the one create in this app that must not navigate to its result:
   *  the new rows are in another campaign, which the list the DM is standing
   *  in does not show, so naming the destination is the only confirmation
   *  there can be. See the Post-Mutation Navigation note in
   *  context/features/items-spells-crafting.md. */
  copied: [{ copied: number; targetName: string }];
  "quota-exceeded": [];
}>();

const resolvedLabelPlural = computed(() => labelPlural ?? `${label}s`);
const countLabel = computed(() => `${ids.length} ${ids.length === 1 ? label : resolvedLabelPlural.value}`);

// ── Target picker ────────────────────────────────────────────────────────────

const { data: campaignList } = useDmCampaigns();
const campaigns = computed(() => campaignList.value ?? []);
const availableCampaigns = computed(() => campaigns.value.filter((c) => c.id !== sourceCampaignId));
const offerGeneral = computed(() => sourceCampaignId !== null);
const hasTargets = computed(() => offerGeneral.value || availableCampaigns.value.length > 0);

const selectedTarget = ref<string>(offerGeneral.value ? "general" : "");

// Picks a default once real campaigns arrive for the "source is already
// general" case, where there is no "general" option to default to instead.
// A no-op once the DM has made (or already has) a selection.
watch(
  availableCampaigns,
  (list) => {
    if (selectedTarget.value === "" && !offerGeneral.value && list.length) {
      selectedTarget.value = list[0].id;
    }
  },
  { immediate: true },
);

const hasSelection = computed(() => selectedTarget.value !== "");
const resolvedTargetId = computed<string | null>(() => (selectedTarget.value === "general" ? null : selectedTarget.value || null));
const targetName = computed(() =>
  resolvedTargetId.value === null
    ? "all campaigns"
    : (availableCampaigns.value.find((c) => c.id === resolvedTargetId.value)?.name ?? "another campaign"),
);

watch(
  () => open,
  (isOpen) => {
    if (isOpen) return;
    selectedTarget.value = offerGeneral.value ? "general" : "";
    dropped.value = [];
    needsSources.value = null;
    planError.value = "";
    copyError.value = "";
  },
);

// ── Drop preview ─────────────────────────────────────────────────────────────

const dropped = ref<DroppedReference[]>([]);
const needsSources = ref<LibrarySourceNotice | null>(null);
const planning = ref(false);
const planError = ref("");

watch(
  [() => open, selectedTarget],
  async ([isOpen, target]) => {
    if (!isOpen || target === "") {
      dropped.value = [];
      needsSources.value = null;
      return;
    }
    planning.value = true;
    planError.value = "";
    try {
      const preview = await planCopy({ table, ids, targetCampaignId: resolvedTargetId.value });
      dropped.value = preview.dropped;
      needsSources.value = preview.needsSources;
    } catch (e) {
      planError.value = e instanceof Error ? e.message : "Could not check what would be dropped.";
      dropped.value = [];
      needsSources.value = null;
    } finally {
      planning.value = false;
    }
  },
  { immediate: true },
);

function clearedFieldMessage(d: DroppedReference): string {
  const n = d.names.length;
  const verb = n === 1 ? "stays" : "stay";
  const pronoun = n === 1 ? "it" : "them";
  return `${d.names.join(", ")} ${verb} behind; the target campaign cannot see ${pronoun}.`;
}

function needsSourcesMessage(n: LibrarySourceNotice): string {
  const what = n.names.length === 1 ? `${n.names[0]} is` : `${n.names.join(", ")} are`;
  const src = n.sources.length === 1 ? `${n.sources[0]} is` : `${n.sources.join(", ")} are`;
  return `${what} shared-library content the copy keeps, but ${src} not enabled in the target campaign — enable it there and the reference resolves.`;
}

function removedEntriesMessage(d: DroppedReference): string {
  const n = d.names.length;
  const verb = n === 1 ? "points" : "point";
  const was = n === 1 ? "was" : "were";
  return `${n} ${d.label.toLowerCase()} ${verb} at rows the target campaign cannot see and ${was} left out.`;
}

// ── Confirm ──────────────────────────────────────────────────────────────────

const { mutateAsync, isPending: copying } = useCopyToCampaign();
const copyError = ref("");

const canConfirm = computed(() => hasSelection.value && !planning.value);

async function confirm() {
  if (!canConfirm.value) return;
  copyError.value = "";
  try {
    const result = await mutateAsync({ table, ids, targetCampaignId: resolvedTargetId.value });
    // The caller shows the toast and closes — this dialog does not emit
    // `close` itself, matching every other confirm-then-let-caller-close
    // dialog in the app.
    emit("copied", { copied: result.copied, targetName: targetName.value });
  } catch (e) {
    if (isQuotaExceeded(e)) {
      emit("quota-exceeded");
      return;
    }
    copyError.value = e instanceof Error ? e.message : "Failed to copy.";
  }
}
</script>
