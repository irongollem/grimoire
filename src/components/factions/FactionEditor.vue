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
      <AppButton
        v-if="form.emblem_url"
        variant="link"
        tone="danger"
        size="inline-xs"
        class="hover:underline"
        label="Remove emblem"
        @click.stop="form.emblem_url = ''"
      />

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

    <!-- Right: name + description -->
    <div class="flex flex-col gap-4">
      <div class="space-y-1.5">
        <label class="text-eyebrow font-semibold text-muted-foreground">Name</label>
        <AppInput
          v-model="form.name"
          placeholder="Faction name…"
          required
          tone="card"
          size="heading"
        />
      </div>
      <div class="flex-1 space-y-1.5">
        <label class="text-eyebrow font-semibold text-muted-foreground">Description & Notes</label>
        <RichTextEditor
          v-model="form.description"
          placeholder="History, motives, known activities…"
          size="md"
        />
      </div>

      <!-- Action row -->
      <div class="flex items-center justify-end gap-2">
        <AppButton
          v-if="!isNew"
          variant="destructive"
          size="md"
          :icon="IconDelete"
          label="Delete"
          :disabled="deleting"
          @click="handleDelete"
        />
        <AppButton
          v-if="!isNew"
          variant="subtle"
          size="md"
          label="Cancel"
          @click="onCancel"
        />
        <AppButton
          variant="primary"
          size="md"
          :icon="IconSave"
          :label="saving ? 'Saving…' : isNew ? 'Create' : 'Save'"
          :disabled="saving || !form.name.trim()"
          @click="handleSave"
        />
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
import { markEdited, type AiProvenance } from "@/ai/provenance";
import { deepEqual } from "@/lib/utils";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import TagInput from "@/components/common/TagInput.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import AudienceRevealControl from "@/components/common/AudienceRevealControl.vue";
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
  ai_provenance: null as AiProvenance | null,
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
    form.value.ai_provenance = f.ai_provenance ?? null;
    tags.value = [...f.tags];
  },
  { immediate: true },
);

async function handleSave() {
  if (!form.value.name.trim()) return;
  saving.value = true;
  try {
    // Material edit detection (#606): the emblem, tags and player visibility
    // are excluded per the "moves/tags/image/visibility" carve-outs.
    const contentChanged = !!props.faction && (
      form.value.name.trim() !== props.faction.name ||
      form.value.faction_type !== props.faction.faction_type ||
      !deepEqual(form.value.description, props.faction.description) ||
      form.value.alignment !== props.faction.alignment
    );
    if (contentChanged) form.value.ai_provenance = markEdited(form.value.ai_provenance);

    const payload = {
      name: form.value.name.trim(),
      faction_type: form.value.faction_type,
      description: form.value.description,
      emblem_url: form.value.emblem_url || null,
      alignment: form.value.alignment,
      player_visible_to: form.value.player_visible_to,
      tags: tags.value,
      ai_provenance: form.value.ai_provenance,
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
