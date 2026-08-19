<template>
  <div class="flex flex-col gap-4">

    <!--
      Sigil + identity fields. Mirrors LocationEditor's mobile stack pattern
      so long proficiency lists don't push the page sideways on phones.
    -->
    <div class="flex flex-col gap-3 md:flex-row md:gap-5">
      <div class="w-full max-w-48 mx-auto md:mx-0 md:w-48 md:shrink-0">
        <ImageUpload
          :model-value="form.image_url"
          aspect="auto"
          placeholder="Portrait"
          bucket="asset-images"
          @update:model-value="form.image_url = $event"
        />
      </div>

      <div class="flex-1 flex flex-col gap-3 min-w-0">
        <AppInput
          v-model="form.name"
          tone="card"
          size="heading"
          placeholder="Background name…"
        />

        <div
          v-if="background?.open5e_import"
          class="text-caption text-muted-foreground italic"
        >
          Imported from Open5e — {{ background?.source_title ?? background?.source }}. Edits stay local and won't be overwritten by re-sync unless Open5e changes the base fields.
        </div>

        <!-- Proficiency chips -->
        <label class="flex flex-col gap-1">
          <span class="text-label-lg font-semibold text-muted-foreground">Skill proficiencies</span>
          <TagInput v-model="form.skill_proficiencies" placeholder="Add a skill…" />
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-label-lg font-semibold text-muted-foreground">Tool proficiencies</span>
          <TagPickerInput v-model="form.tool_proficiencies" :groups="TOOL_PROFICIENCY_GROUPS" placeholder="Search tools…" />
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-label-lg font-semibold text-muted-foreground">Languages</span>
          <TagPickerInput v-model="form.languages" :groups="LANGUAGE_GROUPS" placeholder="Search languages…" />
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-label-lg font-semibold text-muted-foreground">Tags</span>
          <TagInput v-model="form.tags" placeholder="Add a tag…" />
        </label>
      </div>
    </div>

    <p v-if="saveError" class="text-destructive text-body">{{ saveError }}</p>

    <!-- Description -->
    <div class="flex flex-col gap-1">
      <span class="text-label-lg font-semibold text-muted-foreground">Description</span>
      <RichTextEditor
        v-model="form.description"
        placeholder="Describe the background's narrative hook…"
        min-height="120px"
      />
    </div>

    <!-- Equipment -->
    <div class="flex flex-col gap-1">
      <span class="text-label-lg font-semibold text-muted-foreground">Starting equipment</span>
      <RichTextEditor
        v-model="form.equipment"
        placeholder="Items provided by the background, with any starting coin."
        min-height="80px"
      />
    </div>

    <!-- Feature -->
    <div class="flex flex-col gap-2 rounded-lg border border-border bg-card/50 px-4 py-3">
      <span class="text-label-lg font-semibold text-muted-foreground">Background feature</span>
      <AppInput
        v-model="form.feature_name"
        size="lg"
        class="font-bold"
        placeholder="Feature name (e.g. Shelter of the Faithful)"
      />
      <RichTextEditor
        v-model="form.feature_description"
        placeholder="Describe what the feature does mechanically and in play."
        min-height="100px"
      />
    </div>

    <!-- Feat grant (2024 PHB) -->
    <div class="flex flex-col gap-2 rounded-lg border border-border bg-card/50 px-4 py-3">
      <span class="text-label-lg font-semibold text-muted-foreground">Feat grant <span class="font-normal text-muted-foreground/60">(2024 PHB — optional)</span></span>
      <AppInput
        v-model="form.feat_grant_name"
        size="lg"
        class="font-bold"
        placeholder="Feat name, e.g. Magic Initiate (Wizard)"
      />
      <RichTextEditor
        v-model="form.feat_grant_description"
        placeholder="Brief summary of what the feat grants — passive bonuses, spells, proficiencies…"
        min-height="80px"
      />
      <p v-if="form.feat_grant_name" class="text-caption text-muted-foreground italic">
        Linked to the Origin feat "{{ originFeatPreview?.name }}"<template v-if="originFeatPreview?.variant"> ({{ originFeatPreview.variant }})</template> — matched by name against imported feats when a character picks this background.
      </p>
    </div>

    <!-- Ability score increase trio (2024 PHB) -->
    <div class="flex flex-col gap-2 rounded-lg border border-border bg-card/50 px-4 py-3">
      <span class="text-label-lg font-semibold text-muted-foreground">Ability score trio <span class="font-normal text-muted-foreground/60">(2024 PHB — optional, pick exactly 3)</span></span>
      <div class="flex flex-wrap gap-2">
        <AppButton
          v-for="key in ABILITY_SCORE_KEYS"
          :key="key"
          variant="subtle"
          size="sm"
          class="capitalize"
          :active="asiTrioSet.has(key)"
          :label="key"
          @click="toggleAsiTrioAbility(key)"
        />
      </div>
      <p
        class="text-caption italic"
        :class="isAsiTrioInvalid ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'"
      >
        {{ asiTrioSet.size === 0
          ? "No trio set — this background grants no 2024 ASI."
          : asiTrioSet.size === 3
            ? "Trio complete."
            : `${asiTrioSet.size} of 3 selected — pick exactly 3 abilities or none.` }}
      </p>
    </div>

    <!-- Suggested characteristics -->
    <div class="flex flex-col gap-1">
      <span class="text-label-lg font-semibold text-muted-foreground">Suggested characteristics</span>
      <RichTextEditor
        v-model="form.suggested_characteristics"
        placeholder="Personality traits, ideals, bonds, and flaws to inspire players."
        min-height="120px"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import ImageUpload from "@/components/common/ImageUpload.vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import TagInput from "@/components/common/TagInput.vue";
import TagPickerInput from "@/components/common/TagPickerInput.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import { TOOL_PROFICIENCY_GROUPS, LANGUAGE_GROUPS } from "@/lib/proficiency-lists";
import { useConfirm } from "@/composables/useConfirm";
import {
  useCreateBackground,
  useUpdateBackground,
  useDeleteBackground,
} from "@/composables/useBackgrounds";
import type { AbilityScoreKey, Background, BackgroundInsert } from "@/types/background.types";
import { ABILITY_SCORE_KEYS } from "@/types/background.types";
import { parseOriginFeatText } from "@/rules/backgroundAsi";

const props = defineProps<{
  background: Background | null;
}>();

const router = useRouter();
const { confirm } = useConfirm();

function blankForm(): BackgroundInsert {
  return {
    name: "",
    description: null,
    skill_proficiencies: [],
    tool_proficiencies: [],
    languages: [],
    equipment: null,
    feature_name: null,
    feature_description: null,
    feat_grant_name: null,
    feat_grant_description: null,
    asi_ability_trio: null,
    origin_feat: null,
    suggested_characteristics: null,
    tags: [],
    source: null,
    source_title: null,
    source_url: null,
    open5e_import: false,
    image_url: null,
    focal_point: null,
  };
}

function fromBackground(b: Background): BackgroundInsert {
  const { id, user_id, created_at, updated_at, ...rest } = b;
  void id; void user_id; void created_at; void updated_at;
  return { ...rest };
}

const form = ref<BackgroundInsert>(props.background ? fromBackground(props.background) : blankForm());

// Re-sync form when the parent's background prop changes (e.g. after save → refetch).
watch(
  () => props.background,
  (b) => { form.value = b ? fromBackground(b) : blankForm(); },
);

const { mutateAsync: createBg } = useCreateBackground();
const { mutateAsync: updateBg } = useUpdateBackground();
const { mutateAsync: deleteBg } = useDeleteBackground();

const saving = ref(false);
const saveError = ref("");

// ── Ability score trio (2024 PHB) ───────────────────────────────────────────
const asiTrioSet = computed(() => new Set(form.value.asi_ability_trio ?? []));
// The DB CHECK requires asi_ability_trio null or exactly 3 entries — 1 or 2
// picked is a half-made state that would otherwise throw a raw Postgres error.
const isAsiTrioInvalid = computed(() => asiTrioSet.value.size > 0 && asiTrioSet.value.size < 3);

function toggleAsiTrioAbility(key: AbilityScoreKey) {
  const next = new Set(form.value.asi_ability_trio ?? []);
  if (next.has(key)) next.delete(key);
  else if (next.size < 3) next.add(key);
  else return; // already 3 picked — ignore until one is toggled off
  form.value.asi_ability_trio = next.size > 0 ? [...next] : null;
}

// Preview of the structured Origin feat parsed live from feat_grant_name, so the
// DM can see how "Magic Initiate (Cleric)" will be split before saving.
const originFeatPreview = computed(() => parseOriginFeatText(form.value.feat_grant_name));

async function save() {
  if (!form.value.name.trim() || isAsiTrioInvalid.value) return;
  saving.value = true;
  saveError.value = "";
  try {
    // Keep the structured origin_feat in sync with the free-text feat_grant_name
    // field on every save — the text field stays the single source of truth for
    // custom/homebrew backgrounds, origin_feat is derived for feat lookup.
    form.value.origin_feat = parseOriginFeatText(form.value.feat_grant_name);
    if (props.background) {
      await updateBg({ id: props.background.id, update: form.value });
    } else {
      await createBg(form.value);
    }
    router.push("/codex/backgrounds");
  } catch (e: unknown) {
    saveError.value = e instanceof Error ? e.message : "Failed to save";
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!props.background) return;
  const ok = await confirm(`Delete "${props.background.name}"? This cannot be undone.`);
  if (!ok) return;
  await deleteBg(props.background);
  router.push("/codex/backgrounds");
}

defineExpose({
  saving,
  canSave: computed(() => !saving.value && !!form.value.name.trim() && !isAsiTrioInvalid.value),
  save,
  remove,
})
</script>
