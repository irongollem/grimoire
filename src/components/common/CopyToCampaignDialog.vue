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
        <p v-if="loadingSources" class="mt-1.5 text-caption text-muted-foreground">Loading…</p>
        <p v-else-if="!hasTargets" class="mt-1.5 text-caption text-muted-foreground">
          No other campaign to copy into yet.
        </p>
      </div>

      <!--
        Rendered only when there is something to report — the common case (no
        dangling references) leaves this a picker and a Copy button and
        nothing else, per the spec: an empty "nothing will be dropped" panel
        is ceremony nobody needs. `dropped` is derived synchronously from the
        already-loaded source rows (see `plan` below), so this never waits on
        a request the way the unenabled-sources notice below still does.
      -->
      <div v-if="dropped.length" class="rounded-lg border border-border bg-muted/40 p-3 space-y-1.5">
        <p v-for="d in dropped" :key="d.label" class="text-caption text-muted-foreground leading-snug">
          <template v-if="d.removedEntries">
            {{ removedEntriesMessage(d) }}
          </template>
          <template v-else>
            <span class="text-foreground font-semibold">{{ d.label }}</span> — {{ clearedFieldMessage(d) }}
          </template>
        </p>
      </div>

      <p v-if="planning" class="text-caption text-muted-foreground">Checking shared-library sources…</p>
      <!--
        A separate panel from the drop report above, and deliberately toned as a
        note rather than a loss: nothing here is dropped. The copy carries these
        shared-library references intact; the target campaign just has not
        enabled the source that holds them, which is one toggle in its own
        settings. Saying "left behind" here would be false.
      -->
      <div v-else-if="needsSources" class="rounded-lg border border-tone-caution/40 bg-tone-caution/5 p-3">
        <p class="text-caption text-ink-caution leading-snug">
          {{ needsSourcesMessage(needsSources) }}
        </p>
      </div>

      <p v-if="loadError" class="text-caption text-destructive">{{ loadError }}</p>
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
 * The shared copy-to-campaign dialog (#598, wave 1; reworked #875 wave 2) — a
 * picker for which of the account's other campaigns (or "general") a
 * selection of rows should be copied into, plus a preview of what would be
 * left behind. The eight list/detail integrations that open this are
 * separate stories; this component owns only the picker, the preview and the
 * confirm step.
 *
 * **Source scope comes from the loaded rows, not a caller-supplied prop.**
 * Every caller used to pass a single `sourceCampaignId` (the active
 * campaign), but a bulk selection routinely mixes general rows
 * (`campaign_id: null`) with campaign rows — and with a "show all scopes"
 * toggle, rows from other campaigns too. A caller-supplied scope offered the
 * exact same-scope duplicate the "No suffix" note in copyToCampaign.ts says
 * cannot happen (#875 F17/F19). So on open this dialog fetches the source
 * rows itself (`loadCopySources`) and excludes every scope any of them
 * already occupies — the only thing that can answer this correctly.
 *
 * **Fetched once, planned per target purely (#875 F5/F21).** `loadCopySources`
 * runs once when the dialog opens; changing the target picker re-plans with
 * the synchronous, pure `planCopyFor` against the same loaded rows rather
 * than re-fetching. Only the unenabled-library-sources notice
 * (`resolveUnenabledSources`) still depends on a per-target fetch, so it
 * alone stays async — both async steps carry a generation counter so a
 * response that lands after the dialog closed or the target changed again
 * can never land on screen.
 *
 * The dialog does not own a paywall. A quota_exceeded rejection (monsters,
 * puzzle_rooms, npcs, factions) is recognised with `isQuotaExceeded` and
 * surfaced as an emitted `quota-exceeded` — the caller already owns a
 * `<PaywallModal>` for its own create flow (see MonsterDetail.vue:559-563,
 * EncounterDetail.vue:570) and reuses it here rather than this dialog
 * growing a second copy.
 *
 * **npcs/factions batches (#885).** `table`/`ids` are already generic over
 * all ten bulk-scope tables, so this component needed no shape change for
 * the two that now carry join rows (npc relationships, faction membership,
 * …) — `planCopyFor` branches internally and hands back the same
 * `{ payloads, linkPayloads, dropped }` shape either way (`linkPayloads` is
 * always `{}` for the other eight). The dropped-reference preview below
 * already renders whatever `plan.value.dropped` contains, which includes a
 * join row that could not travel (see `copyToCampaign.ts`'s
 * `buildJoinRowPayload`) without this component knowing that case exists.
 */
import { computed, ref, watch } from "vue";
import AppModal from "@/components/common/AppModal.vue";
import ModalHeader from "@/components/common/ModalHeader.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import AppButton from "@/components/common/AppButton.vue";
import { IconCopy } from "@/lib/icons";
import { pluralizeCount } from "@/lib/utils";
import { useDmCampaigns } from "@/composables/campaign/useCampaigns";
import {
  useCopyToCampaign,
  loadCopySources,
  planCopyFor,
  resolveUnenabledSources,
  type CopySources,
  type LibrarySourceNotice,
} from "@/composables/campaign/useCopyToCampaign";
import type { BulkScopeTable } from "@/composables/campaign/useBulkCampaignScope";
import type { DroppedReference } from "@/lib/campaign/copyToCampaign";
import { isQuotaExceeded } from "@/lib/quotaError";

const { open, table, ids, label, labelPlural } = defineProps<{
  open: boolean;
  table: BulkScopeTable;
  ids: readonly string[];
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
   *  context/features/items-spells-crafting.md.
   *
   *  `linked` (#885) is the count of join rows — relationships, faction
   *  memberships, and the like — the batch created alongside the entities
   *  themselves; 0 for every table but npcs/factions, which never produce
   *  one. Carried through rather than folded into `copied` so a caller can
   *  report it ("3 NPCs, 7 relationships") instead of the count silently
   *  going missing — none of today's eight callers read it, since npcs and
   *  factions have no "Copy to campaign…" entry point yet. */
  copied: [{ copied: number; linked: number; targetName: string }];
  "quota-exceeded": [];
}>();

const countLabel = computed(() => pluralizeCount(ids.length, label, labelPlural));

// ── Source rows — fetched once per open, target-independent ────────────────

const sources = ref<CopySources | null>(null);
const loadingSources = ref(false);
const loadError = ref("");
// Declared with the other per-open state rather than beside `confirm()`:
// the open/close watcher below runs immediately, and every list page mounts
// this dialog closed, so its reset branch touches this ref during setup.
const copyError = ref("");
let loadGeneration = 0;

async function load(): Promise<void> {
  const generation = ++loadGeneration;
  loadingSources.value = true;
  loadError.value = "";
  try {
    const loaded = await loadCopySources({ table, ids });
    if (generation !== loadGeneration) return; // dialog closed/reopened meanwhile
    sources.value = loaded;
  } catch (e) {
    if (generation !== loadGeneration) return;
    loadError.value = e instanceof Error ? e.message : "Could not load what would be copied.";
  } finally {
    if (generation === loadGeneration) loadingSources.value = false;
  }
}

// ── Target picker — options derived from the loaded rows' own scopes ───────

const { data: campaignList } = useDmCampaigns();
const campaigns = computed(() => campaignList.value ?? []);
const sourceCampaignIds = computed<Set<string | null>>(
  () => new Set((sources.value?.sourceRows ?? []).map((r) => r.campaign_id as string | null)),
);
const availableCampaigns = computed(() =>
  sources.value ? campaigns.value.filter((c) => !sourceCampaignIds.value.has(c.id)) : [],
);
const offerGeneral = computed(() => sources.value !== null && !sourceCampaignIds.value.has(null));
const hasTargets = computed(
  () => sources.value !== null && (offerGeneral.value || availableCampaigns.value.length > 0),
);

const selectedTarget = ref<string>("");

// Picks a default once sources (and, if needed, real campaigns) have loaded.
// A no-op once the DM has made (or already has) a selection.
watch(
  [sources, availableCampaigns],
  ([loaded, list]) => {
    if (!loaded || selectedTarget.value !== "") return;
    if (offerGeneral.value) selectedTarget.value = "general";
    else if (list.length) selectedTarget.value = list[0].id;
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

// ── Plan — synchronous once sources are loaded, recomputed per target ──────

const plan = computed(() => (sources.value && hasSelection.value ? planCopyFor(sources.value, resolvedTargetId.value) : null));
const dropped = computed<DroppedReference[]>(() => plan.value?.dropped ?? []);

// ── Unenabled-library-sources notice — the one part of the preview that
//    still depends on a per-target fetch, so it alone stays async ─────────

const needsSources = ref<LibrarySourceNotice | null>(null);
const planning = ref(false);
const planError = ref("");
let planGeneration = 0;

watch(
  [sources, selectedTarget],
  async ([currentSources, target]) => {
    if (!currentSources || target === "") {
      needsSources.value = null;
      return;
    }
    const generation = ++planGeneration;
    planning.value = true;
    planError.value = "";
    try {
      const notice = await resolveUnenabledSources(table, currentSources.sourceRows, resolvedTargetId.value);
      if (generation !== planGeneration) return; // stale — target (or the dialog) moved on
      needsSources.value = notice;
    } catch (e) {
      if (generation !== planGeneration) return;
      planError.value = e instanceof Error ? e.message : "Could not check what would be dropped.";
      needsSources.value = null;
    } finally {
      if (generation === planGeneration) planning.value = false;
    }
  },
  { immediate: true },
);

watch(
  () => open,
  (isOpen) => {
    if (isOpen) {
      void load();
      return;
    }
    loadGeneration++; // invalidates any load still in flight when the dialog closed
    sources.value = null;
    loadingSources.value = false;
    loadError.value = "";
    selectedTarget.value = "";
    needsSources.value = null;
    planError.value = "";
    copyError.value = "";
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
  const was = n === 1 ? "was" : "were";
  const verb = n === 1 ? "points" : "point";
  return `${pluralizeCount(n, d.entryNoun.singular, d.entryNoun.plural)} ${verb} at rows the target campaign cannot see and ${was} left out.`;
}

// ── Confirm ──────────────────────────────────────────────────────────────────

const { mutateAsync, isPending: copying } = useCopyToCampaign();

const canConfirm = computed(() => hasSelection.value && !planning.value && !loadingSources.value && plan.value !== null);

async function confirm() {
  if (!canConfirm.value || !plan.value) return;
  copyError.value = "";
  try {
    const result = await mutateAsync({
      table,
      payloads: plan.value.payloads,
      linkPayloads: plan.value.linkPayloads,
      dropped: plan.value.dropped,
      needsSources: needsSources.value,
    });
    // The caller shows the toast and closes — this dialog does not emit
    // `close` itself, matching every other confirm-then-let-caller-close
    // dialog in the app.
    emit("copied", { copied: result.copied, linked: result.linked, targetName: targetName.value });
  } catch (e) {
    if (isQuotaExceeded(e)) {
      emit("quota-exceeded");
      return;
    }
    copyError.value = e instanceof Error ? e.message : "Failed to copy.";
  }
}
</script>
