<template>
  <PageHeader
    :title="isNew ? 'New Hero' : (hero?.name ?? 'Edit Hero')"
    :description="
      isNew ? 'Add a hero to the Hall of Heroes' : 'Edit hero details'
    "
  >
    <div
      v-if="!isAppAdmin"
      class="py-16 text-center font-fell text-muted-foreground"
    >
      You don't have permission to access this page.
    </div>

    <div v-else-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <form v-else @submit.prevent="save" class="space-y-8 pb-16">
      <!-- Top action bar -->
      <div class="flex items-center justify-between gap-4">
        <RouterLink
          to="/hall-of-heroes"
          class="text-body text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Hall of Heroes
        </RouterLink>
        <div class="flex items-center gap-2">
          <AppButton
            v-if="!isNew"
            type="button"
            variant="destructive"
            size="sm"
            label="Delete"
            @click="handleDelete"
          />
          <AppButton
            type="submit"
            variant="primary"
            size="sm"
            class="px-4"
            :disabled="isSaving"
            :label="isSaving ? 'Saving…' : isNew ? 'Create Hero' : 'Save Changes'"
          />
        </div>
      </div>

      <div class="grid grid-cols-1 gap-8 lg:grid-cols-[17.5rem_1fr]">
        <!-- Left: portrait + basic fields -->
        <div class="space-y-4">
          <ImageUpload
            v-model="form.portrait_url"
            v-model:focal-point="form.portrait_focal_point"
            bucket="npc-portraits"
            aspect="portrait"
            :show-focal-point="true"
            placeholder="Drop portrait or click to upload"
          />

          <!-- Setting -->
          <div class="space-y-1">
            <label
              class="text-label-lg font-semibold text-muted-foreground"
              >Setting</label
            >
            <AppSelect
              v-model="form.setting"
              tone="default"
              size="body"
              weight="normal"
              block
            >
              <option v-for="s in SETTINGS" :key="s.value" :value="s.value">
                {{ s.label }}
              </option>
            </AppSelect>
          </div>

          <!-- Name -->
          <div class="space-y-1">
            <label
              class="text-label-lg font-semibold text-muted-foreground"
              >Name *</label
            >
            <AppInput
              v-model="form.name"
              required
              type="text"
              tone="default"
              size="body"
            />
          </div>

          <!-- Species -->
          <div class="space-y-1">
            <label
              class="text-label-lg font-semibold text-muted-foreground"
              >Species
            </label>
            <AppInput
              v-model="form.race"
              type="text"
              tone="default"
              size="body"
            />
          </div>

          <!-- Alignment -->
          <div class="space-y-1">
            <label
              class="text-label-lg font-semibold text-muted-foreground"
              >Alignment</label
            >
            <AppSelect
              v-model="form.alignment"
              tone="default"
              size="body"
              weight="normal"
              block
            >
              <option :value="null">—</option>
              <option v-for="a in ALIGNMENTS" :key="a" :value="a">
                {{ a }}
              </option>
            </AppSelect>
          </div>

          <!-- Occupation -->
          <div class="space-y-1">
            <label
              class="text-label-lg font-semibold text-muted-foreground"
              >Occupation</label
            >
            <AppInput
              v-model="form.occupation"
              type="text"
              tone="default"
              size="body"
            />
          </div>

          <!-- Age -->
          <div class="space-y-1">
            <label
              class="text-label-lg font-semibold text-muted-foreground"
              >Age</label
            >
            <AppInput
              v-model="form.age"
              type="text"
              tone="default"
              size="body"
            />
          </div>

          <!-- Status -->
          <div class="space-y-1">
            <label
              class="text-label-lg font-semibold text-muted-foreground"
              >Status</label
            >
            <AppSelect
              v-model="form.status"
              tone="default"
              size="body"
              weight="normal"
              block
            >
              <option value="alive">Alive</option>
              <option value="dead">Dead</option>
              <option value="missing">Missing</option>
              <option value="unknown">Unknown</option>
            </AppSelect>
          </div>

          <!-- Tags -->
          <div class="space-y-1">
            <label
              class="text-label-lg font-semibold text-muted-foreground"
              >Tags</label
            >
            <TagInput v-model="form.tags" />
          </div>
        </div>

        <!-- Right: rich text fields -->
        <div class="space-y-6">
          <div class="space-y-1">
            <label
              class="text-label-lg font-semibold text-muted-foreground"
              >Appearance</label
            >
            <RichTextEditor
              v-model="form.appearance"
              placeholder="Describe how this character looks…"
              size="md"
            />
          </div>

          <div class="space-y-1">
            <label
              class="text-label-lg font-semibold text-muted-foreground"
              >Personality</label
            >
            <RichTextEditor
              v-model="form.personality"
              placeholder="Their traits, ideals, and mannerisms…"
              size="md"
            />
          </div>

          <div class="space-y-1">
            <label
              class="text-label-lg font-semibold text-muted-foreground"
              >Backstory</label
            >
            <RichTextEditor
              v-model="form.backstory"
              placeholder="Their history and origins…"
              size="lg"
            />
          </div>

          <div class="space-y-1">
            <label
              class="text-label-lg font-semibold text-muted-foreground"
              >DM Notes</label
            >
            <RichTextEditor
              v-model="form.notes"
              placeholder="Private notes…"
              size="md"
            />
          </div>
        </div>
      </div>
    </form>
  </PageHeader>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  useHallOfHero,
  useCreateHero,
  useUpdateHero,
  useDeleteHero,
} from "@/composables/useHallOfHeroes";
import { useAuthStore } from "@/stores/auth";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import ImageUpload from "@/components/common/ImageUpload.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import TagInput from "@/components/common/TagInput.vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import type { HallOfHeroInsert } from "@/types/npc.types";
import { DND_SETTINGS } from "@/data/dndSettings";

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
] as const;

const SETTINGS = DND_SETTINGS;

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const isAppAdmin = computed(() => auth.isAppAdmin);
const isNew = computed(() => route.name === "hero-new");
const heroId = computed(() => (isNew.value ? "" : (route.params.id as string)));

const { data: hero, isLoading: heroLoading } = useHallOfHero(heroId);
const isLoading = computed(() => !isNew.value && heroLoading.value);

const { mutate: createHero, isPending: creating } = useCreateHero();
const { mutate: updateHero, isPending: updating } = useUpdateHero();
const { mutate: deleteHero } = useDeleteHero();
const isSaving = computed(() => creating.value || updating.value);

function blankForm(): HallOfHeroInsert {
  return {
    name: "",
    setting: "faerun",
    race: null,
    alignment: null,
    age: null,
    occupation: null,
    appearance: null,
    personality: null,
    backstory: null,
    notes: null,
    status: "alive",
    relationship: "unknown",
    portrait_url: null,
    card_art_url: null,
    portrait_focal_point: null,
    disguise_name: null,
    disguise_portrait_url: null,
    disguise_portrait_focal_point: null,
    is_revealed: false,
    tags: [],
    stat_block: null,
  };
}

const form = reactive<HallOfHeroInsert>(blankForm());

watch(
  hero,
  (h) => {
    if (!h) return;
    Object.assign(form, {
      name: h.name,
      setting: h.setting,
      race: h.race,
      alignment: h.alignment,
      age: h.age,
      occupation: h.occupation,
      appearance: h.appearance,
      personality: h.personality,
      backstory: h.backstory,
      notes: h.notes,
      status: h.status,
      relationship: h.relationship,
      portrait_url: h.portrait_url,
      card_art_url: h.card_art_url,
      portrait_focal_point: h.portrait_focal_point,
      disguise_name: h.disguise_name,
      disguise_portrait_url: h.disguise_portrait_url,
      disguise_portrait_focal_point: h.disguise_portrait_focal_point,
      is_revealed: h.is_revealed,
      tags: h.tags,
      stat_block: h.stat_block,
    });
  },
  { immediate: true },
);

function save() {
  if (isNew.value) {
    createHero(
      { ...form },
      { onSuccess: () => router.push("/hall-of-heroes") },
    );
  } else {
    updateHero(
      { id: heroId.value, update: { ...form } },
      { onSuccess: () => router.push("/hall-of-heroes") },
    );
  }
}

function handleDelete() {
  if (
    !hero.value ||
    !confirm(`Delete "${hero.value.name}" from the Hall of Heroes?`)
  )
    return;
  deleteHero(hero.value, { onSuccess: () => router.push("/hall-of-heroes") });
}
</script>
