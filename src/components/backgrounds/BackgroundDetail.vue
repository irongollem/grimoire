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
        <input
          v-model="form.name"
          placeholder="Background name…"
          class="w-full bg-card border border-border rounded-md px-3 py-2 font-cinzel text-lg font-bold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />

        <div
          v-if="background?.open5e_import"
          class="text-xs font-fell text-muted-foreground italic"
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

    <p v-if="saveError" class="text-destructive font-fell text-sm">{{ saveError }}</p>

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
      <input
        v-model="form.feature_name"
        placeholder="Feature name (e.g. Shelter of the Faithful)"
        class="w-full bg-background border border-border rounded-md px-3 py-2 font-cinzel text-sm font-bold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
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
      <input
        v-model="form.feat_grant_name"
        placeholder="Feat name, e.g. Magic Initiate (Wizard)"
        class="w-full bg-background border border-border rounded-md px-3 py-2 font-cinzel text-sm font-bold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <RichTextEditor
        v-model="form.feat_grant_description"
        placeholder="Brief summary of what the feat grants — passive bonuses, spells, proficiencies…"
        min-height="80px"
      />
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
import type { Background, BackgroundInsert } from "@/types/background.types";

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

async function save() {
  if (!form.value.name.trim()) return;
  saving.value = true;
  saveError.value = "";
  try {
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
  canSave: computed(() => !saving.value && !!form.value.name.trim()),
  save,
  remove,
})
</script>
