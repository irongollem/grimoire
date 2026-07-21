<template>
  <div class="grid grid-cols-1 lg:grid-cols-[15rem_1fr] gap-5">
    <!-- Left: portrait + meta -->
    <div class="flex flex-col gap-4">
      <!-- Divine portrait / avatar -->
      <div>
        <p class="font-cinzel text-2xs font-semibold tracking-wider text-muted-foreground uppercase mb-1.5">Divine Form</p>
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
        <p class="font-cinzel text-2xs font-semibold tracking-wider text-muted-foreground uppercase mb-1.5">Holy Symbol</p>
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
            <span class="font-fell text-xs italic">Upload symbol</span>
          </div>
          <div
            class="absolute inset-0 bg-black/50 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
          >
            <span class="font-fell text-white text-xs italic">{{
              form.symbol_image_url ? "Change" : "Upload"
            }}</span>
          </div>
          <div v-if="uploading" class="absolute inset-0 bg-black/60 flex items-center justify-center">
            <LoadingSpinner />
          </div>
        </div>
        <input ref="fileInput" type="file" accept="image/*" class="sr-only" @change="onFileSelected" />
        <button
          v-if="form.symbol_image_url"
          type="button"
          class="mt-1 font-cinzel text-2xs text-destructive hover:underline text-left"
          @click.stop="form.symbol_image_url = ''"
        >
          Remove symbol image
        </button>
      </div>

      <!-- Pantheon -->
      <div class="space-y-1.5">
        <label class="font-cinzel text-2xs font-semibold tracking-wider text-muted-foreground uppercase">Pantheon</label>
        <EntityCombobox
          :model-value="form.pantheon_id ?? ''"
          :options="pantheonOptions"
          placeholder="Select pantheon…"
          @update:model-value="form.pantheon_id = $event || null"
        />
      </div>

      <!-- Alignment -->
      <div class="space-y-1.5">
        <label class="font-cinzel text-2xs font-semibold tracking-wider text-muted-foreground uppercase">Alignment</label>
        <EntityCombobox
          v-model="alignmentStr"
          :options="DEITY_ALIGNMENT_OPTIONS"
          placeholder="Select alignment…"
        />
      </div>

      <!-- Symbol description -->
      <div class="space-y-1.5">
        <label class="font-cinzel text-2xs font-semibold tracking-wider text-muted-foreground uppercase">Symbol Description</label>
        <input
          v-model="form.symbol"
          placeholder="Describe the holy symbol…"
          class="w-full bg-card border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <!-- Visibility -->
      <div class="space-y-1.5">
        <label class="font-cinzel text-2xs font-semibold tracking-wider text-muted-foreground uppercase">Visible to Players</label>
        <PlayerVisibilityToggle
          :visible-to="form.player_visible_to"
          @update:visible-to="form.player_visible_to = $event"
        />
      </div>

      <!-- Tags -->
      <div class="space-y-1.5">
        <label class="font-cinzel text-2xs font-semibold tracking-wider text-muted-foreground uppercase">Tags</label>
        <TagInput v-model="tags" />
      </div>
    </div>

    <!-- Right: name + fields -->
    <div class="flex flex-col gap-4">
      <!-- Name -->
      <div class="space-y-1.5">
        <label class="font-cinzel text-2xs font-semibold tracking-wider text-muted-foreground uppercase">Name</label>
        <input
          v-model="form.name"
          placeholder="Deity name…"
          required
          class="w-full bg-card border border-border rounded-md px-3 py-2 font-cinzel text-lg font-bold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <!-- Titles / epithets -->
      <div class="space-y-1.5">
        <label class="font-cinzel text-2xs font-semibold tracking-wider text-muted-foreground uppercase">Titles &amp; Epithets</label>
        <input
          v-model="form.titles"
          placeholder="e.g. The Morninglord, Lord of Dawn…"
          class="w-full bg-card border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <!-- Alternate names -->
      <div class="space-y-1.5">
        <label class="font-cinzel text-2xs font-semibold tracking-wider text-muted-foreground uppercase">Alternate Names</label>
        <TagInput v-model="alternateNames" placeholder="Add name…" />
        <p class="font-fell text-[0.6875rem] italic text-muted-foreground">Known by different names in different cultures or regions.</p>
      </div>

      <!-- Cleric domains -->
      <div class="space-y-1.5">
        <label class="font-cinzel text-2xs font-semibold tracking-wider text-muted-foreground uppercase">Cleric Domains</label>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="domain in CLERIC_DOMAINS"
            :key="domain"
            type="button"
            :class="[
              'px-2 py-1 rounded font-cinzel text-2xs tracking-wider border transition-colors',
              selectedDomains.includes(domain)
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-muted text-muted-foreground border-border hover:border-muted-foreground/50',
            ]"
            @click="toggleDomain(domain)"
          >
            {{ domain }}
          </button>
        </div>
      </div>

      <!-- Portfolio -->
      <div class="space-y-1.5">
        <label class="font-cinzel text-2xs font-semibold tracking-wider text-muted-foreground uppercase">Portfolio</label>
        <input
          v-model="form.portfolio"
          placeholder="What does this deity govern? (war, harvest, death…)"
          class="w-full bg-card border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <!-- Description / Lore -->
      <div class="space-y-1.5">
        <label class="font-cinzel text-2xs font-semibold tracking-wider text-muted-foreground uppercase">Lore &amp; Description</label>
        <RichTextEditor
          v-model="form.description"
          placeholder="Origin myth, appearance, worshippers, holy sites…"
          min-height="220px"
        />
      </div>

      <!-- DM Notes (secrets) -->
      <div class="space-y-1.5">
        <label class="font-cinzel text-2xs font-semibold tracking-wider text-muted-foreground uppercase">DM Secrets</label>
        <RichTextEditor
          v-model="form.dm_notes"
          placeholder="Hidden truths, true motivations, secret agenda…"
          min-height="140px"
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
import { useCreateDeity, useUpdateDeity, useDeleteDeity, useAllPantheons } from "@/composables/useDeities";
import { CLERIC_DOMAINS, DEITY_ALIGNMENTS, type Deity } from "@/types/deity.types";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import TagInput from "@/components/common/TagInput.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import ImageUpload from "@/components/common/ImageUpload.vue";
import PlayerVisibilityToggle from "@/components/common/PlayerVisibilityToggle.vue";

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
