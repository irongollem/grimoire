<template>
  <div class="grid grid-cols-1 lg:grid-cols-[15rem_1fr] gap-5">
    <!-- Left: emblem + meta -->
    <div class="flex flex-col gap-4">
      <!-- Emblem -->
      <div
        class="relative aspect-square rounded-lg border border-border overflow-hidden bg-muted cursor-pointer group"
        @click="fileInput?.click()"
      >
        <FocalImage
          v-if="form.emblem_url"
          :src="form.emblem_url"
          alt="Faction emblem"
          format="square"
        />
        <div
          v-else
          class="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground"
        >
          <IconShield class="h-10 w-10" />
          <span class="text-body italic">Upload emblem</span>
        </div>
        <div
          class="absolute inset-0 bg-black/50 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
        >
          <span class="text-body text-white italic">{{
            form.emblem_url ? "Change" : "Upload"
          }}</span>
        </div>
        <div
          v-if="uploading"
          class="absolute inset-0 bg-black/60 flex items-center justify-center"
        >
          <LoadingSpinner />
        </div>
      </div>
      <input
        ref="fileInput"
        type="file"
        accept="image/*"
        class="sr-only"
        @change="onFileSelected"
      />
      <button
        v-if="form.emblem_url"
        type="button"
        class="font-cinzel text-2xs text-destructive hover:underline text-left"
        @click.stop="form.emblem_url = ''"
      >
        Remove emblem
      </button>

      <!-- Type -->
      <div class="space-y-1.5">
        <label class="text-eyebrow font-semibold text-muted-foreground">Type</label>
        <EntityCombobox
          v-model="factionTypeStr"
          :options="FACTION_TYPE_OPTIONS"
          placeholder="Select type…"
        />
      </div>

      <!-- Alignment -->
      <div class="space-y-1.5">
        <label class="text-eyebrow font-semibold text-muted-foreground">Alignment</label>
        <EntityCombobox
          v-model="alignmentStr"
          :options="FACTION_ALIGNMENT_OPTIONS"
          placeholder="Select alignment…"
        />
      </div>

      <!-- Visibility -->
      <div class="space-y-1.5">
        <label class="text-eyebrow font-semibold text-muted-foreground">Visible to Players</label>
        <PlayerVisibilityToggle
          :visible-to="form.player_visible_to"
          @update:visible-to="form.player_visible_to = $event"
        />
      </div>

      <!-- Tags -->
      <div class="space-y-1.5">
        <label class="text-eyebrow font-semibold text-muted-foreground">Tags</label>
        <TagInput v-model="tags" />
      </div>
    </div>

    <!-- Right: name + description -->
    <div class="flex flex-col gap-4">
      <div class="space-y-1.5">
        <label class="text-eyebrow font-semibold text-muted-foreground">Name</label>
        <input
          v-model="form.name"
          placeholder="Faction name…"
          required
          class="w-full bg-card border border-border rounded-md px-3 py-2 text-heading font-bold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div class="flex-1 space-y-1.5">
        <label class="text-eyebrow font-semibold text-muted-foreground">Description & Notes</label>
        <RichTextEditor
          v-model="form.description"
          placeholder="History, motives, known activities…"
          min-height="320px"
        />
      </div>

      <!-- Action row -->
      <div class="flex items-center justify-end gap-2">
        <button
          v-if="!isNew"
          type="button"
          :disabled="deleting"
          class="inline-flex items-center gap-1.5 rounded-md border border-destructive px-3 py-2 font-cinzel text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
          @click="handleDelete"
        >
          <IconDelete class="h-3.5 w-3.5" />
          Delete
        </button>
        <button
          v-if="!isNew"
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-muted-foreground/50 transition-colors"
          @click="onCancel"
        >
          Cancel
        </button>
        <button
          type="button"
          :disabled="saving || !form.name.trim()"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-label-lg font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
          @click="handleSave"
        >
          <IconSave class="h-3.5 w-3.5" />
          {{ saving ? "Saving…" : isNew ? "Create" : "Save" }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { IconDelete, IconSave, IconShield } from '@/lib/icons';
import { useConfirm } from "@/composables/useConfirm";
import { useImageUpload } from "@/composables/useImageUpload";
import {
  useCreateFaction,
  useUpdateFaction,
  useDeleteFaction,
} from "@/composables/useFactions";
import { FACTION_TYPES, FACTION_ALIGNMENTS, type Faction } from "@/types/faction.types";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import TagInput from "@/components/common/TagInput.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import PlayerVisibilityToggle from "@/components/common/PlayerVisibilityToggle.vue";
import FocalImage from "@/components/common/FocalImage.vue";

const props = defineProps<{
  faction: Faction | null;
  isNew: boolean;
}>();

const route  = useRoute();
const router = useRouter();
const { confirm } = useConfirm();

// Combobox option lists
const FACTION_TYPE_OPTIONS = FACTION_TYPES.map((t) => ({ id: t, name: t }));
const FACTION_ALIGNMENT_OPTIONS = FACTION_ALIGNMENTS.map((a) => ({ id: a, name: a }));

const factionTypeStr = computed({
  get: () => form.value.faction_type ?? "",
  set: (v) => { form.value.faction_type = v || null; },
});
const alignmentStr = computed({
  get: () => form.value.alignment ?? "",
  set: (v) => { form.value.alignment = v || null; },
});

const createFaction = useCreateFaction();
const updateFaction = useUpdateFaction();
const deleteFaction = useDeleteFaction();
const saving = ref(false);
const deleting = ref(false);
const uploading = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const tags = ref<string[]>([]);

const form = ref({
  name: "",
  faction_type: null as string | null,
  description: null as string | null,
  emblem_url: "" as string,
  alignment: null as string | null,
  player_visible_to: [] as string[],
});

watch(
  () => props.faction,
  (f) => {
    if (!f) return;
    form.value.name = f.name;
    form.value.faction_type = f.faction_type;
    form.value.description = f.description;
    form.value.emblem_url = f.emblem_url ?? "";
    form.value.alignment = f.alignment;
    form.value.player_visible_to = f.player_visible_to ?? [];
    tags.value = [...f.tags];
  },
  { immediate: true },
);

async function handleSave() {
  if (!form.value.name.trim()) return;
  saving.value = true;
  try {
    const payload = {
      name: form.value.name.trim(),
      faction_type: form.value.faction_type,
      description: form.value.description,
      emblem_url: form.value.emblem_url || null,
      alignment: form.value.alignment,
      player_visible_to: form.value.player_visible_to,
      tags: tags.value,
    };
    if (props.isNew) {
      await createFaction.mutateAsync(payload);
    } else if (props.faction) {
      await updateFaction.mutateAsync({ id: props.faction.id, update: payload });
    }
    router.push("/factions");
  } finally {
    saving.value = false;
  }
}

async function handleDelete() {
  if (!props.faction) return;
  if (deleting.value) return;
  if (!(await confirm(`Delete "${props.faction.name}"? This cannot be undone.`))) return;
  deleting.value = true;
  try {
    await deleteFaction.mutateAsync(props.faction.id);
    router.push("/factions");
  } catch {
    // failure is surfaced to the user by the mutation's onError toast
  } finally {
    deleting.value = false;
  }
}

// Cancel strips ?edit=true, preserving any other query params.
function onCancel() {
  const { edit: _edit, ...rest } = route.query;
  router.push({ query: rest });
}

const { upload: uploadEmblem } = useImageUpload("factionImages");

async function onFileSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  (e.target as HTMLInputElement).value = "";
  uploading.value = true;
  try {
    const url = await uploadEmblem(file);
    if (url) form.value.emblem_url = url;
  } finally {
    uploading.value = false;
  }
}
</script>
