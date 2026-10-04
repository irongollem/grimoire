<template>
  <!-- Mobile edit (<md): full-screen takeover with its own app bar + save bar.
       Form state lives here; MonsterEditMobile owns layout only. -->
  <MonsterEditMobile
    v-if="isMobile"
    :form="form"
    :sb="sb"
    :monster-id="props.monster?.id"
    :is-shared="isShared"
    :is-new="!props.monster"
    :is-saving="saving"
    :is-cloning="cloning"
    :is-duplicating="duplicating"
    :is-sending-to-scriptorium="sendingToScriptorium"
    :is-ai-enabled="isAiEnabled"
    @save="save"
    @cancel="onCancel"
    @delete="remove"
    @duplicate="duplicate"
    @copy-to-campaign="openCopy"
    @customize="customize"
    @scriptorium="sendToScriptorium"
    @generate="showGenerateDialog = true"
    @update:image-url="onPortraitUrlUpdate($event)"
    @update:focal-point="onPortraitFocalUpdate($event)"
    @update:cutout-url="onCutoutUrlUpdate($event)"
  />

  <!-- Desktop (≥md): unchanged two-column grid form -->
  <div v-else class="flex flex-col gap-5 min-w-0 max-w-full">
    <!-- Read-only library banner -->
    <div
      v-if="isShared"
      class="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/50 px-4 py-2.5"
    >
      <p class="text-body text-muted-foreground italic">
        Read-only reference. Customize to create your own editable copy.
      </p>
      <AppButton
        variant="primary"
        size="md"
        class="shrink-0"
        :disabled="cloning"
        :icon="IconCopy"
        :label="cloning ? 'Copying…' : 'Customize'"
        @click="customize"
      />
    </div>

    <!-- Top bar (editable monsters only) -->
    <EntityEditorActionBar
      v-else
      :title="form.name"
      title-placeholder="Monster name…"
      :exists="!!props.monster"
      :can-save="!!form.name.trim()"
      :saving="saving"
      create-label="Create"
      :error="saveError"
      @update:title="form.name = $event"
      @save="save"
      @delete="remove"
    >
      <template #extra-actions>
        <AppButton
          v-if="isAiEnabled"
          variant="tinted"
          tone="primary"
          emphasis="outline"
          size="md"
          :icon="IconGenerate"
          label="Generate"
          @click="showGenerateDialog = true"
        />
        <!-- Send to Scriptorium + Copy to campaign… fold into one "Send to…"
             menu (#895) — the same shared control the NPC editor already
             uses. `collapse-label-on-mobile="false"` because its neighbours
             here (Generate, Duplicate, EntityEditorActionBar's own
             Cancel/Save) are plain AppButtons that keep their labels at
             every width; left at the component's PageHeader-tuned default,
             this one trigger alone would go icon-only between md and lg. -->
        <EntitySendMenu
          v-if="props.monster"
          :sending-to-scriptorium="sendingToScriptorium"
          :collapse-label-on-mobile="false"
          @scriptorium="sendToScriptorium"
          @copy="openCopy"
        />
        <AppButton
          v-if="props.monster"
          variant="subtle"
          size="md"
          :disabled="duplicating"
          :icon="IconCopy"
          :label="duplicating ? 'Copying…' : 'Duplicate'"
          @click="duplicate"
        />
      </template>
    </EntityEditorActionBar>

    <DraftConflictNotice v-if="!isShared" :fields="conflictLabels" :on-discard="reset" />

    <!-- Two-column body: portrait sidebar + stat block content -->
    <!-- Left col is NOT in fieldset — ImageUploads must remain interactive for library art -->
    <div class="grid grid-cols-1 lg:grid-cols-[13.75rem_1fr] gap-6">
      <!-- Left: Portrait + Tags -->
      <div class="space-y-4">
        <!-- Portrait: Picture / Cutout (#917 story 2) -->
        <EntityImageBlock
          :model-value="isCutoutTab ? form.cutout_url : form.image_url"
          :focal-point="isCutoutTab ? undefined : form.portrait_focal_point"
          bucket="monster-images"
          :folder-prefix="artFolderPrefix"
          :show-focal-point="!isCutoutTab"
          :ai-kind="isCutoutTab ? undefined : 'monster'"
          :ai-target-id="isCutoutTab ? undefined : props.monster?.id"
          :ai-context="isCutoutTab ? undefined : aiContext"
          :mini-source="isCutoutTab || !props.monster?.id ? undefined : { table: 'monsters', id: props.monster.id }"
          :expect-transparency="isCutoutTab"
          :cutout-from="isCutoutTab && props.monster?.id && !isShared ? { table: 'monsters', id: props.monster.id, hasPicture: !!form.image_url } : undefined"
          :variants="artTabVariants"
          :active-variant-id="artTab"
          @update:model-value="isCutoutTab ? onCutoutUrlUpdate($event) : onPortraitUrlUpdate($event)"
          @update:focal-point="onPortraitFocalUpdate($event)"
          @update:active-variant-id="artTab = $event as ArtTab"
        />

        <!-- Tags -->
        <div>
          <p class="field-label">Tags</p>
          <TagInput v-if="!isShared" v-model="form.tags" />
          <div v-else class="flex flex-wrap gap-1 mt-1">
            <span
              v-for="tag in form.tags"
              :key="tag"
              class="inline-flex items-center px-2 py-0.5 rounded bg-muted text-label-lg text-muted-foreground"
              >{{ tag }}</span
            >
          </div>
        </div>
      </div>

      <!-- Right: Identity + stat block — fieldset[disabled] makes inputs read-only for library monsters -->
      <fieldset :disabled="isShared" class="contents">
        <div class="flex flex-col gap-5">
          <!-- Identity grid -->
          <section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <label class="block">
              <span class="field-label">Type</span>
              <AppSelect
                v-model="form.monster_type"
                tone="filled"
                size="body"
                weight="normal"
                block
                class="capitalize"
              >
                <option
                  v-for="t in MONSTER_TYPES"
                  :key="t"
                  :value="t"
                  class="capitalize"
                >
                  {{ t }}
                </option>
              </AppSelect>
            </label>
            <label class="block">
              <span class="field-label">Size</span>
              <AppSelect v-model="form.size" tone="filled" size="body" weight="normal" block class="capitalize">
                <option
                  v-for="s in SIZES"
                  :key="s"
                  :value="s"
                  class="capitalize"
                >
                  {{ s }}
                </option>
              </AppSelect>
            </label>
            <label class="block">
              <span class="field-label">Alignment</span>
              <AppSelect v-model="form.alignment" tone="filled" size="body" weight="normal" block>
                <option
                  v-for="a in ALIGNMENTS"
                  :key="a"
                  :value="a.toLowerCase()"
                >
                  {{ a }}
                </option>
              </AppSelect>
            </label>
            <label class="block">
              <span class="field-label">Source</span>
              <AppInput
                v-model="form.source"
                tone="filled"
                size="body"
                placeholder="Monster Manual"
              />
            </label>
            <CampaignScopeField v-model="form.campaign_id" />
            <label class="block">
              <span class="field-label">Habitat</span>
              <AppInput
                v-model="form.habitat"
                tone="filled"
                size="body"
                placeholder="Forest, underground…"
              />
            </label>
            <label class="block">
              <span class="field-label">Lair Location</span>
              <EntityCombobox
                :model-value="form.lair_location_id ?? ''"
                :options="locationOptions"
                placeholder="None"
                @update:model-value="form.lair_location_id = $event || null"
              >
                <template #option="{ opt }">
                  <span :style="{ paddingLeft: `${(opt as LocationOption).depth * 0.75}rem` }">{{ opt.name }}</span>
                </template>
              </EntityCombobox>
            </label>
          </section>

          <!-- Divider -->
          <div class="gold-divider" />

          <StatBlockEditor :sb="sb" show-legendary show-lair />

          <!-- Description -->
          <section>
            <span class="field-label block mb-1">Description</span>
            <RichTextEditor
              v-model="form.description"
              placeholder="Lore, habitat, behaviour, and flavour text…"
              size="md"
            />
          </section>

          <!-- Notes -->
          <section>
            <span class="field-label block mb-1">DM Notes</span>
            <RichTextEditor
              v-model="form.notes"
              placeholder="Encounter notes, tactics, lair description…"
              size="md"
            />
          </section>
        </div>
      </fieldset>
    </div>

    <EntityBacklinks v-if="backlinksMonsterId" :entity-id="backlinksMonsterId" />
  </div>

  <!-- AI generation dialog -->
  <MonsterGenerateDialog
    :visible="showGenerateDialog && isAiEnabled"
    @close="showGenerateDialog = false"
    @generated="onAiGenerated"
  />

  <PaywallModal v-model="showPaywall" resource="monsters" />
  <PaywallModal v-model="showScriptoriumPaywall" resource="scriptorium_documents" />

  <CopyToCampaignDialog
    v-if="props.monster"
    :open="copyOpen"
    table="monsters"
    :ids="copyIds"
    label="monster"
    @close="copyOpen = false"
    @copied="onCopied"
    @quota-exceeded="onQuotaExceeded"
  />
</template>

<script setup lang="ts">
import { useConfirm } from "@/composables/useConfirm";
const { confirm } = useConfirm();
import { ref, computed } from "vue";
import { useAuthStore } from "@/stores/auth";
import { useRouter } from "vue-router";
import { useIsMobile } from "@/composables/useBreakpoint";
import { storeToRefs } from "pinia";
import { IconCopy, IconGenerate } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import EntityBacklinks from "@/components/common/EntityBacklinks.vue";
import EntitySendMenu from "@/components/common/EntitySendMenu.vue";
import MonsterEditMobile from "@/components/monsters/MonsterEditMobile.vue";
import MonsterGenerateDialog from "@/ai/MonsterGenerateDialog.vue";
import { toTiptapJson } from "@/ai/useNpcGeneration";
import { markEdited } from "@/ai/provenance";
import { deepEqual } from "@/lib/utils";
import { useRecordDraft, cloneDraftValue } from "@/composables/useRecordDraft";
import DraftConflictNotice from "@/components/common/DraftConflictNotice.vue";
import { buildEntityContext, toPlainText } from "@/ai/utils";
import { useCampaignStore } from "@/stores/campaign";
import type { MonsterAiGenerated } from "@/ai/types";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import TagInput from "@/components/common/TagInput.vue";
import CampaignScopeField from "@/components/common/CampaignScopeField.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import { useLocationTree } from "@/composables/locations/useLocations";
import type { LocationSummary } from "@/types/location.types";
import EntityImageBlock from "@/components/common/EntityImageBlock.vue";
import EntityEditorActionBar from "@/components/common/EntityEditorActionBar.vue";
import StatBlockEditor from "@/components/common/StatBlockEditor.vue";
import {
  useCreateMonster,
  useUpdateMonster,
  useDeleteMonster,
  useCloneLibraryMonster,
} from "@/composables/monsters/useMonsters";
import { useUpsertLibraryMonsterArt } from "@/composables/library/useLibraryMonsterArt";
import { useArtTabs, type ArtTab } from "@/composables/useArtTabs";
import { useCreateScriptoriumDocument } from "@/composables/scriptorium/useScriptorium";
import { formatMonsterForScriptorium } from "@/lib/scriptorium/scriptoriumImport";
import { buildEntityEmbedDocumentContent } from "@/lib/scriptorium/entityEmbeds";
import { MONSTER_SIZES as SIZES, MONSTER_TYPES } from "@/types/monster.types";
import type {
  Monster,
  MonsterType,
  MonsterSize,
  MonsterStatBlock,
} from "@/types/monster.types";
import PaywallModal from "@/components/common/PaywallModal.vue";
import CopyToCampaignDialog from "@/components/common/CopyToCampaignDialog.vue";
import { isQuotaExceeded } from "@/lib/quotaError";
import { useCopyEntityToCampaign } from "@/composables/campaign/useCopyEntityToCampaign";
import { useToast } from "@/composables/useToast";

const ALIGNMENTS = [
  "Lawful Good",
  "Neutral Good",
  "Chaotic Good",
  "Lawful Neutral",
  "True Neutral",
  "Chaotic Neutral",
  "Lawful Evil",
  "Neutral Evil",
  "Chaotic Evil",
  "Unaligned",
];
const props = defineProps<{ monster: Monster | null }>();
const router = useRouter();

const isShared = computed(() => !!props.monster?.is_shared);
// An admin's edit to a shared library row is the canonical art, and canonical art
// lives under srd/, never a user folder (CLAUDE.md storage convention, #952).
const auth = useAuthStore();
const artFolderPrefix = computed(() => (isShared.value && auth.isAppAdmin ? "srd" : undefined));
// Only a campaign/user-owned monster has notes that could mention it — a
// shared library reference (whose id may be a text id like `srd_owlbear`
// rather than a uuid) is never editable and never the target of an
// @mention in the first place.
const backlinksMonsterId = computed(() =>
  !isShared.value && props.monster?.id ? props.monster.id : null,
);

const aiContext = computed(() =>
  buildEntityContext([
    form.name,
    `${form.size} ${form.monster_type}`,
    form.alignment,
    form.habitat,
    toPlainText(form.description),
  ]),
);

// Mobile-only edit layer (<md). Desktop keeps the existing two-column grid form,
// byte-identical to before.
const isMobile = useIsMobile();

// Leaving edit mode on mobile: existing monsters drop the ?edit=true flag (back
// to the read view); a brand-new monster has no detail page to fall back to, so
// it returns to the list — the post-mutation/cancel feedback surface.
function onCancel() {
  if (props.monster) {
    void router.replace(`/monsters/${props.monster.id}`);
  } else {
    void router.push("/monsters");
  }
}

const { mutateAsync: upsertLibraryArt } = useUpsertLibraryMonsterArt();
const { artTab, isCutoutTab, variants: artTabVariants } = useArtTabs();

type LocationOption = LocationSummary & { depth: number };
const { locationOptions } = useLocationTree();

const campaignStore = useCampaignStore();
const { activeCampaignId } = storeToRefs(campaignStore);

// The statblock lives inside the draft (as `sb`) so the row builder below is a
// pure function of it and useRecordDraft can tell which columns the user touched (#946).
function toDraft(m: Monster | null) {
  return {
    name: m?.name ?? "",
    monster_type: (m?.monster_type ?? "humanoid") as MonsterType,
    size: (m?.size ?? "medium") as MonsterSize,
    alignment: m?.alignment ?? "unaligned",
    habitat: m?.habitat ?? "",
    lair_location_id: (m?.lair_location_id ?? null) as string | null,
    source: m?.source ?? "",
    // New monsters default to the active campaign; existing ones keep whatever
    // scope they already have (#597) — including null, which means "available in
    // every campaign" and is NOT an unset value. Folding this into one `??` chain
    // reads a pre-#597 row's null as "unset" and silently re-scopes it to the
    // active campaign on the next save, which is exactly the backfill the
    // migration refuses to do.
    // A shared library row has no campaign_id at all, so it takes the default too.
    campaign_id: (m && !m.is_shared
      ? m.campaign_id ?? null
      : activeCampaignId.value ?? null) as string | null,
    tags: m?.tags ? [...m.tags] : [],
    description: m?.description ?? "",
    notes: m?.notes ?? "",
    image_url: m?.image_url ?? "",
    cutout_url: m?.cutout_url ?? "",
    portrait_focal_point: m?.portrait_focal_point ?? null,
    ai_provenance: m?.ai_provenance ?? null,
    sb: cloneDraftValue(m?.stat_block ? { ...defaultSb(), ...m.stat_block } : defaultSb()),
  };
}
type MonsterDraft = ReturnType<typeof toDraft>;

function defaultSb(): MonsterStatBlock {
  return {
    armor_class: 10,
    hit_points: "10 (2d8+1)",
    speed: "30 ft.",
    str: 10,
    dex: 10,
    con: 10,
    int: 10,
    wis: 10,
    cha: 10,
    challenge_rating: "1/4",
    saving_throws: "",
    skills: {},
    damage_vulnerabilities: "",
    damage_resistances: "",
    damage_immunities: "",
    condition_immunities: "",
    senses: "",
    languages: "",
    special_abilities: [],
    actions: [],
    bonus_actions: [],
    reactions: [],
    legendary_resistance: 0,
    legendary_actions: [],
    lair_actions: [],
  };
}

// The draft re-seeds from the server copy for every field the user has not
// touched, which also carries library art that loads after mount (a shared
// monster's art edits go to the art table, never into the draft).
const {
  draft: form,
  conflicts,
  changes,
  commit,
  reset,
} = useRecordDraft({
  source: () => props.monster,
  identity: (m) => m.id,
  toDraft,
});
// Reseeding replaces `form.sb`, so hand out the live object through a computed.
const sb = computed(() => form.sb);

const CONFLICT_LABELS: Record<keyof MonsterDraft, string> = {
  name: "Name",
  monster_type: "Type",
  size: "Size",
  alignment: "Alignment",
  habitat: "Habitat",
  lair_location_id: "Lair Location",
  source: "Source",
  campaign_id: "Campaign",
  tags: "Tags",
  description: "Description",
  notes: "DM Notes",
  image_url: "Portrait",
  cutout_url: "Cutout",
  portrait_focal_point: "Portrait focus",
  ai_provenance: "AI provenance",
  sb: "Stat block",
};
const conflictLabels = computed(() => conflicts.value.map((k) => CONFLICT_LABELS[k]));

// Image upload handlers
function onPortraitUrlUpdate(url: string | null) {
  if (isShared.value) upsertLibraryArt({ entry_id: props.monster!.id, image_url: url });
  else form.image_url = url ?? "";
}
function onPortraitFocalUpdate(pt: { x: number; y: number } | null) {
  if (isShared.value)
    upsertLibraryArt({ entry_id: props.monster!.id, portrait_focal_point: pt });
  else form.portrait_focal_point = pt;
}
function onCutoutUrlUpdate(url: string | null) {
  if (isShared.value) upsertLibraryArt({ entry_id: props.monster!.id, cutout_url: url });
  else form.cutout_url = url ?? "";
}
// AI generation
const isAiEnabled = computed(() => campaignStore.isAiEnabled);
const showGenerateDialog = ref(false);

function onAiGenerated(result: MonsterAiGenerated) {
  showGenerateDialog.value = false;
  form.name = result.name;
  form.monster_type = result.monster_type;
  form.size = result.size;
  form.alignment = (result.alignment || "unaligned").toLowerCase();
  form.habitat = result.habitat ?? "";
  form.source = "Grimoire:AI";
  form.tags = [...result.tags];
  form.description = result.description ? toTiptapJson(result.description) : "";
  form.notes = result.notes ? toTiptapJson(result.notes) : "";
  if (result.image_url) {
    form.image_url = result.image_url;
    form.portrait_focal_point = null;
  }
  form.ai_provenance = result.ai_provenance ?? null;
  Object.assign(form.sb, defaultSb(), result.stat_block);
}

const { mutateAsync: create } = useCreateMonster();
const { mutateAsync: update } = useUpdateMonster();
const { mutateAsync: del } = useDeleteMonster();
const { mutateAsync: clone } = useCloneLibraryMonster();
const { mutateAsync: createScriptoriumDoc } = useCreateScriptoriumDocument();
const toast = useToast();
const saving = ref(false);
const showPaywall = ref(false);
const showScriptoriumPaywall = ref(false);
const cloning = ref(false);
const duplicating = ref(false);
const saveError = ref("");
const sendingToScriptorium = ref(false);

async function duplicate() {
  if (!props.monster) return;
  duplicating.value = true;
  try {
    const copy = await create({
      ...buildPayload(form),
      name: `${props.monster.name} (copy)`,
    });
    router.push(`/monsters/${copy.id}`);
  } finally {
    duplicating.value = false;
  }
}

async function customize() {
  if (!props.monster) return;
  cloning.value = true;
  try {
    const copy = await clone(props.monster);
    router.replace(`/monsters/${copy.id}`);
  } finally {
    cloning.value = false;
  }
}

// ── Copy to campaign (#598) ─────────────────────────────────────────────────
const { copyOpen, copyIds, openCopy, onCopied, onQuotaExceeded } = useCopyEntityToCampaign({
  entity: () => props.monster,
  noun: "monster",
  onQuotaExceeded: () => {
    showPaywall.value = true;
  },
});

async function sendToScriptorium() {
  if (!props.monster) return;
  sendingToScriptorium.value = true;
  try {
    const importData = formatMonsterForScriptorium(props.monster);
    // Live link, not a one-time snapshot (#915 story 3) — see NpcDetail's
    // sendToScriptorium for the same shape. The generated document travels
    // with the monster's own campaign scope (#915 story 1); a shared/library
    // monster's null campaign_id makes it account-wide.
    const doc = await createScriptoriumDoc({
      ...importData,
      content: buildEntityEmbedDocumentContent("monster", props.monster.id),
      campaign_id: props.monster.campaign_id,
    });
    router.push(`/scriptorium/${doc.id}`);
  } catch (e: unknown) {
    if (isQuotaExceeded(e)) { showScriptoriumPaywall.value = true; return; }
    toast.error(toast.fromError(e));
  } finally {
    sendingToScriptorium.value = false;
  }
}

function buildPayload(d: MonsterDraft) {
  return {
    name: d.name.trim(),
    monster_type: d.monster_type,
    size: d.size,
    alignment: d.alignment,
    habitat: d.habitat || null,
    lair_location_id: d.lair_location_id,
    source: d.source || null,
    campaign_id: d.campaign_id,
    tags: d.tags,
    description: d.description || null,
    notes: d.notes || null,
    image_url: d.image_url || null,
    cutout_url: d.cutout_url || null,
    portrait_focal_point: d.portrait_focal_point ?? null,
    stat_block: { ...d.sb },
    ai_provenance: d.ai_provenance,
  };
}

async function save() {
  if (!form.name.trim()) return;
  saving.value = true;
  saveError.value = "";
  try {
    if (props.monster) {
      // Material edit detection (#606): tags, portrait art, the lair-location
      // link and campaign scope are excluded per the "moves/tags/image" carve-outs.
      const contentChanged =
        form.name !== props.monster.name ||
        form.monster_type !== props.monster.monster_type ||
        form.size !== props.monster.size ||
        form.alignment !== props.monster.alignment ||
        form.habitat !== (props.monster.habitat ?? "") ||
        form.source !== (props.monster.source ?? "") ||
        !deepEqual(form.description, props.monster.description) ||
        !deepEqual(form.notes, props.monster.notes) ||
        // `sb` is always fully key-filled (defaultSb() merged in on load and
        // on every template/link apply); imported/cloned library data often isn't,
        // so compare against the same fill-in rather than the raw stored
        // value — otherwise a merely-sparser DB shape reads as an edit.
        !deepEqual(form.sb, { ...defaultSb(), ...props.monster.stat_block });
      if (contentChanged) form.ai_provenance = markEdited(form.ai_provenance);
      // Send only the columns this edit changed, so a stale cached copy cannot
      // write untouched fields back at old values (#946).
      const changed = changes(buildPayload);
      if (Object.keys(changed).length > 0) {
        await update({ id: props.monster.id, update: changed });
        commit();
      }
      // Back to the list, which is the confirmation that the save landed. On
      // tablet and up the monster's own path *is* the list — the bestiary with
      // this stat block open over it — so it doubles as a look at what was just
      // saved. A phone has no such layer: `/monsters/:id` there is a
      // full-screen takeover, which would be staying on the detail page, so it
      // gets the plain list. See the Sanctioned Exception in CLAUDE.md.
      router.push(isMobile.value ? "/monsters" : `/monsters/${props.monster.id}`);
    } else {
      const created = await create(buildPayload(form));
      router.push(`/monsters/${created.id}`);
    }
  } catch (e: unknown) {
    if (isQuotaExceeded(e)) {
      showPaywall.value = true;
      return;
    }
    saveError.value = e instanceof Error ? e.message : "Failed to save";
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!props.monster) return;
  if (!(await confirm(`Delete ${props.monster.name}? This cannot be undone.`)))
    return;
  router.push("/monsters");
  await del(props.monster);
}
</script>

<style scoped>
@reference "@/assets/main.css";

.field-label {
  @apply block text-label-lg font-semibold text-muted-foreground mb-1;
}
.section-heading {
  @apply text-label-lg font-semibold text-muted-foreground uppercase mb-3;
}
.gold-divider {
  @apply border-t border-primary/30;
}
.speed-input {
  -moz-appearance: textfield;
}
.speed-input::-webkit-outer-spin-button,
.speed-input::-webkit-inner-spin-button {
  appearance: none;
}
</style>
