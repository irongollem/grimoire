<template>
  <div class="grid grid-cols-1 lg:grid-cols-[15rem_1fr] gap-5">
    <!-- Left: portrait + meta -->
    <div class="flex flex-col gap-4">
      <!-- Divine portrait / avatar -->
      <div>
        <p class="text-eyebrow font-semibold text-muted-foreground mb-1.5">Divine Form</p>
        <ImageUpload
          :model-value="form.portrait_url || null"
          :focal-point="form.portrait_focal_point"
          bucket="pantheon-emblems"
          show-focal-point
          @update:model-value="form.portrait_url = $event ?? ''"
          @update:focal-point="form.portrait_focal_point = $event"
        />
      </div>

      <!-- Holy symbol image -->
      <div>
        <p class="text-eyebrow font-semibold text-muted-foreground mb-1.5">Holy Symbol</p>
        <div
          class="relative aspect-square rounded-lg border border-border overflow-hidden bg-muted cursor-pointer group"
          @click="fileInput?.click()"
        >
          <img
            v-if="form.symbol_image_url"
            :src="form.symbol_image_url"
            alt="Holy symbol"
            class="w-full h-full object-contain p-2"
          />
          <div
            v-else
            class="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground"
          >
            <IconSun class="h-8 w-8" />
            <span class="text-caption italic">Upload symbol</span>
          </div>
          <div
            class="absolute inset-0 bg-black/50 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
          >
            <span class="text-caption text-white italic">{{
              form.symbol_image_url ? "Change" : "Upload"
            }}</span>
          </div>
          <div v-if="uploading" class="absolute inset-0 bg-black/60 flex items-center justify-center">
            <LoadingSpinner />
          </div>
        </div>
        <input ref="fileInput" type="file" accept="image/*" class="sr-only" @change="onFileSelected" />
        <AppButton
          v-if="form.symbol_image_url"
          variant="link"
          tone="danger"
          size="inline-xs"
          class="mt-1"
          @click.stop="form.symbol_image_url = ''"
        >
          Remove symbol image
        </AppButton>
      </div>

      <!-- Pantheon -->
      <div class="space-y-1.5">
        <label class="text-eyebrow font-semibold text-muted-foreground">Pantheon</label>
        <EntityCombobox
          :model-value="form.pantheon_id ?? ''"
          :options="pantheonOptions"
          placeholder="Select pantheon…"
          @update:model-value="form.pantheon_id = $event || null"
        />
      </div>

      <!-- Alignment -->
      <div class="space-y-1.5">
        <label class="text-eyebrow font-semibold text-muted-foreground">Alignment</label>
        <EntityCombobox
          v-model="alignmentStr"
          :options="DEITY_ALIGNMENT_OPTIONS"
          placeholder="Select alignment…"
        />
      </div>

      <!-- Symbol description -->
      <div class="space-y-1.5">
        <label class="text-eyebrow font-semibold text-muted-foreground">Symbol Description</label>
        <AppInput
          v-model="form.symbol"
          tone="card"
          size="body"
          placeholder="Describe the holy symbol…"
        />
      </div>

      <!-- Visibility -->
      <div class="space-y-1.5">
        <label class="text-eyebrow font-semibold text-muted-foreground">Visible to Players</label>
        <AudienceRevealControl
          :name="form.name"
          :visible-to="form.player_visible_to"
          @change="form.player_visible_to = $event"
        />
      </div>

      <!-- Tags -->
      <div class="space-y-1.5">
        <label class="text-eyebrow font-semibold text-muted-foreground">Tags</label>
        <TagInput v-model="tags" />
      </div>
    </div>

    <!-- Right: name + fields -->
    <div class="flex flex-col gap-4">
      <!-- Name -->
      <div class="space-y-1.5">
        <label class="text-eyebrow font-semibold text-muted-foreground">Name</label>
        <AppInput
          v-model="form.name"
          tone="card"
          size="heading"
          required
          placeholder="Deity name…"
        />
      </div>

      <!-- Titles / epithets -->
      <div class="space-y-1.5">
        <label class="text-eyebrow font-semibold text-muted-foreground">Titles &amp; Epithets</label>
        <AppInput
          v-model="form.titles"
          tone="card"
          size="body"
          placeholder="e.g. The Morninglord, Lord of Dawn…"
        />
      </div>

      <!-- Alternate names -->
      <div class="space-y-1.5">
        <label class="text-eyebrow font-semibold text-muted-foreground">Alternate Names</label>
        <TagInput v-model="alternateNames" placeholder="Add name…" />
        <p class="text-caption italic text-muted-foreground">Known by different names in different cultures or regions.</p>
      </div>

      <!-- Cleric domains -->
      <div class="space-y-1.5">
        <label class="text-eyebrow font-semibold text-muted-foreground">Cleric Domains</label>
        <div class="flex flex-wrap gap-1.5">
          <AppButton
            v-for="domain in CLERIC_DOMAINS"
            :key="domain"
            variant="subtle"
            size="xs"
            :active="selectedDomains.includes(domain)"
            :label="domain"
            @click="toggleDomain(domain)"
          />
        </div>
      </div>

      <!-- Portfolio -->
      <div class="space-y-1.5">
        <label class="text-eyebrow font-semibold text-muted-foreground">Portfolio</label>
        <AppInput
          v-model="form.portfolio"
          tone="card"
          size="body"
          placeholder="What does this deity govern? (war, harvest, death…)"
        />
      </div>

      <!-- Description / Lore -->
      <div class="space-y-1.5">
        <label class="text-eyebrow font-semibold text-muted-foreground">Lore &amp; Description</label>
        <RichTextEditor
          v-model="form.description"
          placeholder="Origin myth, appearance, worshippers, holy sites…"
          size="md"
        />
      </div>

      <!-- DM Notes (secrets) -->
      <div class="space-y-1.5">
        <label class="text-eyebrow font-semibold text-muted-foreground">DM Secrets</label>
        <RichTextEditor
          v-model="form.dm_notes"
          placeholder="Hidden truths, true motivations, secret agenda…"
          size="md"
        />
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRouter } from "vue-router";
import { IconSun } from '@/lib/icons';
import { useConfirm } from "@/composables/useConfirm";
import { useImageUpload } from "@/composables/useImageUpload";
import { useCreateDeity, useUpdateDeity, useDeleteDeity, useAllPantheons } from "@/composables/deities/useDeities";
import { CLERIC_DOMAINS, DEITY_ALIGNMENTS, type Deity } from "@/types/deity.types";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import TagInput from "@/components/common/TagInput.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import ImageUpload from "@/components/common/ImageUpload.vue";
import AudienceRevealControl from "@/components/common/AudienceRevealControl.vue";

const { deity, isNew } = defineProps<{ deity: Deity | null; isNew: boolean }>();

const router = useRouter();
const { confirm } = useConfirm();

const { data: pantheons } = useAllPantheons();
const pantheonOptions = computed(() =>
  (pantheons.value ?? []).map((p) => ({ id: p.id, name: p.name })),
);

const DEITY_ALIGNMENT_OPTIONS = DEITY_ALIGNMENTS.map((a) => ({ id: a, name: a }));

const alignmentStr = computed({
  get: () => form.value.alignment ?? "",
  set: (v) => { form.value.alignment = v || null; },
});

const createDeity = useCreateDeity();
const updateDeity = useUpdateDeity();
const deleteDeity = useDeleteDeity();
const saving = ref(false);
const uploading = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const tags = ref<string[]>([]);
const alternateNames = ref<string[]>([]);
const selectedDomains = ref<string[]>([]);

const form = ref({
  name: "",
  titles: null as string | null,
  pantheon_id: null as string | null,
  alignment: null as string | null,
  symbol: null as string | null,
  symbol_image_url: "" as string,
  portrait_url: "" as string,
  portrait_focal_point: null as { x: number; y: number } | null,
  portfolio: null as string | null,
  description: null as string | null,
  dm_notes: null as string | null,
  player_visible_to: [] as string[],
});

watch(
  () => deity,
  (d) => {
    if (!d) return;
    form.value.name = d.name;
    form.value.titles = d.titles;
    form.value.pantheon_id = d.pantheon_id;
    form.value.alignment = d.alignment;
    form.value.symbol = d.symbol;
    form.value.symbol_image_url = d.symbol_image_url ?? "";
    form.value.portrait_url = d.portrait_url ?? "";
    form.value.portrait_focal_point = d.portrait_focal_point;
    form.value.portfolio = d.portfolio;
    form.value.description = d.description;
    form.value.dm_notes = d.dm_notes;
    form.value.player_visible_to = d.player_visible_to ?? [];
    tags.value = [...d.tags];
    alternateNames.value = [...d.alternate_names];
    selectedDomains.value = [...d.domains];
  },
  { immediate: true },
);

function toggleDomain(domain: string) {
  const idx = selectedDomains.value.indexOf(domain);
  if (idx === -1) {
    selectedDomains.value = [...selectedDomains.value, domain];
  } else {
    selectedDomains.value = selectedDomains.value.filter((d) => d !== domain);
  }
}

async function handleSave() {
  if (!form.value.name.trim()) return;
  saving.value = true;
  try {
    const payload = {
      name: form.value.name.trim(),
      titles: form.value.titles || null,
      alternate_names: alternateNames.value,
      pantheon_id: form.value.pantheon_id,
      alignment: form.value.alignment,
      symbol: form.value.symbol || null,
      symbol_image_url: form.value.symbol_image_url || null,
      portrait_url: form.value.portrait_url || null,
      portrait_focal_point: form.value.portrait_focal_point,
      domains: selectedDomains.value,
      portfolio: form.value.portfolio || null,
      description: form.value.description,
      dm_notes: form.value.dm_notes,
      player_visible_to: form.value.player_visible_to,
      tags: tags.value,
    };
    if (isNew) {
      await createDeity.mutateAsync(payload);
    } else if (deity) {
      await updateDeity.mutateAsync({ id: deity.id, update: payload });
    }
    router.push("/deities");
  } finally {
    saving.value = false;
  }
}

async function handleDelete() {
  if (!deity) return;
  if (!(await confirm(`Delete "${deity.name}"? This cannot be undone.`))) return;
  await deleteDeity.mutateAsync(deity.id);
  router.push("/deities");
}

const { upload: uploadSymbol } = useImageUpload("pantheon-emblems");

async function onFileSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  (e.target as HTMLInputElement).value = "";
  uploading.value = true;
  try {
    const url = await uploadSymbol(file);
    if (url) form.value.symbol_image_url = url;
  } finally {
    uploading.value = false;
  }
}

defineExpose({ handleSave, handleDelete, isSaving: saving });
</script>
