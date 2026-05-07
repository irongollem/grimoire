<template>
  <div class="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-5">
    <!-- Left: emblem + meta -->
    <div class="flex flex-col gap-4">
      <!-- Emblem image -->
      <div>
        <p class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase mb-1.5">Emblem</p>
        <div
          class="relative aspect-square rounded-lg border border-border overflow-hidden bg-muted cursor-pointer group"
          @click="fileInput?.click()"
        >
          <img
            v-if="form.emblem_url"
            :src="form.emblem_url"
            alt="Pantheon emblem"
            class="w-full h-full object-cover"
          />
          <div
            v-else
            class="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground"
          >
            <IconFire class="h-10 w-10" />
            <span class="font-fell text-sm italic">Upload emblem</span>
          </div>
          <div
            class="absolute inset-0 bg-black/50 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
          >
            <span class="font-fell text-white text-sm italic">{{
              form.emblem_url ? "Change" : "Upload"
            }}</span>
          </div>
          <div v-if="uploading" class="absolute inset-0 bg-black/60 flex items-center justify-center">
            <LoadingSpinner />
          </div>
        </div>
        <input ref="fileInput" type="file" accept="image/*" class="sr-only" @change="onFileSelected" />
        <button
          v-if="form.emblem_url"
          type="button"
          class="mt-1 font-cinzel text-[10px] text-destructive hover:underline text-left"
          @click.stop="form.emblem_url = ''"
        >
          Remove emblem
        </button>
      </div>

      <!-- Visibility -->
      <div class="space-y-1.5">
        <label class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Visible to Players</label>
        <PlayerVisibilityToggle
          :visible-to="form.player_visible_to"
          @update:visible-to="form.player_visible_to = $event"
        />
      </div>

      <!-- Tags -->
      <div class="space-y-1.5">
        <label class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Tags</label>
        <TagInput v-model="tags" />
      </div>
    </div>

    <!-- Right: name + description -->
    <div class="flex flex-col gap-4">
      <!-- Name -->
      <div class="space-y-1.5">
        <label class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Name</label>
        <input
          v-model="form.name"
          placeholder="Pantheon name…"
          required
          class="w-full bg-card border border-border rounded-md px-3 py-2 font-cinzel text-lg font-bold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <!-- Description -->
      <div class="flex-1 space-y-1.5">
        <label class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Description &amp; History</label>
        <RichTextEditor
          v-model="form.description"
          placeholder="Origins, major deities, holy wars, theological schisms…"
          min-height="320px"
        />
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { useRouter } from "vue-router";
import { IconFire } from '@/lib/icons';
import { useConfirm } from "@/composables/useConfirm";
import { useImageUpload } from "@/composables/useImageUpload";
import { useCreatePantheon, useUpdatePantheon, useDeletePantheon } from "@/composables/useDeities";
import type { Pantheon } from "@/types/deity.types";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import TagInput from "@/components/common/TagInput.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import PlayerVisibilityToggle from "@/components/common/PlayerVisibilityToggle.vue";

const { pantheon, isNew } = defineProps<{ pantheon: Pantheon | null; isNew: boolean }>();

const router = useRouter();
const { confirm } = useConfirm();

const createPantheon = useCreatePantheon();
const updatePantheon = useUpdatePantheon();
const deletePantheon = useDeletePantheon();
const saving = ref(false);
const uploading = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const tags = ref<string[]>([]);

const form = ref({
  name: "",
  description: null as string | null,
  emblem_url: "" as string,
  player_visible_to: [] as string[],
});

watch(
  () => pantheon,
  (p) => {
    if (!p) return;
    form.value.name = p.name;
    form.value.description = p.description;
    form.value.emblem_url = p.emblem_url ?? "";
    form.value.player_visible_to = p.player_visible_to ?? [];
    tags.value = [...p.tags];
  },
  { immediate: true },
);

async function handleSave() {
  if (!form.value.name.trim()) return;
  saving.value = true;
  try {
    const payload = {
      name: form.value.name.trim(),
      description: form.value.description,
      emblem_url: form.value.emblem_url || null,
      player_visible_to: form.value.player_visible_to,
      tags: tags.value,
    };
    if (isNew) {
      await createPantheon.mutateAsync(payload);
    } else if (pantheon) {
      await updatePantheon.mutateAsync({ id: pantheon.id, update: payload });
    }
    router.push("/pantheons");
  } finally {
    saving.value = false;
  }
}

async function handleDelete() {
  if (!pantheon) return;
  if (!(await confirm(`Delete "${pantheon.name}"? Deities assigned to this pantheon will be unlinked.`))) return;
  await deletePantheon.mutateAsync(pantheon.id);
  router.push("/pantheons");
}

const { upload: uploadEmblem } = useImageUpload("asset-images");

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

defineExpose({ handleSave, handleDelete, isSaving: saving });
</script>
