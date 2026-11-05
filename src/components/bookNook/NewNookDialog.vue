<template>
  <AppModal :open="open" size="md" @close="close">
    <ModalHeader title="New nook" :icon="IconNavBookNook" tone="primary" closeable @close="close" />

    <div class="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4">
      <div>
        <label class="mb-1.5 block text-eyebrow text-muted-foreground">WHERE THE ROOM COMES FROM</label>
        <SegmentedControl v-model="source" :options="sources" size="sm" block />
      </div>

      <!-- A place's picture: the nook is then shown there. -->
      <div v-if="source === 'picture'" class="space-y-1.5">
        <EntityCombobox
          v-model="placeId"
          :options="picturedPlaces"
          placeholder="Search places with a picture…"
        />
        <p v-if="!picturedPlaces.length" class="text-caption text-muted-foreground italic">
          None of your places has a picture yet. Upload one or paint a room instead.
        </p>
        <p v-else class="text-caption text-muted-foreground">
          The nook will be shown at this place, in place of its still picture.
        </p>
      </div>

      <div v-else-if="source === 'upload'" class="space-y-2">
        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          class="sr-only"
          data-testid="nook-file"
          @change="onFile"
        />
        <AppButton
          variant="outline"
          size="sm"
          :icon="IconUpload"
          :label="file ? file.name : 'Choose a picture'"
          @click="fileInput?.click()"
        />
        <AppInput v-model="title" tone="card" size="body" placeholder="Title" />
      </div>

      <div v-else class="space-y-2">
        <!-- Native on purpose: a model prompt is not rich text (CLAUDE.md, Sanctioned Exceptions). -->
        <textarea
          v-model="subject"
          rows="3"
          class="field-input resize-none"
          placeholder="Describe the room: a drowned shrine lit by one hanging lantern…"
          aria-label="Describe the room"
        />
        <EntityCombobox
          v-model="placeId"
          :options="places"
          placeholder="Show it at a place (optional)…"
        />
        <p class="text-caption text-muted-foreground">
          The room is painted empty of people and of anything that will move. You add those as parts.
        </p>
      </div>

      <p v-if="error" class="text-caption text-destructive">{{ error }}</p>
    </div>

    <div class="flex shrink-0 justify-end gap-2 px-5 pb-5 pt-2">
      <AppButton variant="subtle" size="sm" label="Cancel" @click="close" />
      <AppButton
        variant="primary"
        size="sm"
        :icon="source === 'paint' ? IconGenerate : IconAdd"
        :label="actionLabel"
        :loading="starting"
        :disabled="!canStart"
        @click="start"
      />
    </div>
  </AppModal>
</template>

<script setup lang="ts">
/**
 * New nook asks only where the room comes from, then opens the studio (frame 02a). Creating opens it, as New
 * handout does in the Scriptorium; the studio saves itself, so there is no form to leave.
 */
import { computed, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import AppModal from "@/components/common/overlays/AppModal.vue";
import ModalHeader from "@/components/common/overlays/ModalHeader.vue";
import { useStartNook, type StartPlace } from "@/composables/bookNook/useStartNook";
import { useAllLocations } from "@/composables/locations/useLocations";
import { useCampaignStore } from "@/stores/campaign";
import { IconAdd, IconGenerate, IconNavBookNook, IconUpload } from "@/lib/icons";

const { open } = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

type Source = "picture" | "upload" | "paint";

const campaign = useCampaignStore();
const { data: locations } = useAllLocations(() => open);
const { starting, error, paintCost, startFromPicture, startFromUpload, startFromPainted } = useStartNook();

const places = computed<StartPlace[]>(() =>
  (locations.value ?? []).map((l) => ({ id: l.id, name: l.name, image_url: l.image_url })),
);
const picturedPlaces = computed(() => places.value.filter((p) => !!p.image_url));

const sources = computed(() => [
  { value: "picture" as const, label: "A place's picture" },
  { value: "upload" as const, label: "Upload" },
  { value: "paint" as const, label: "Paint the room", disabled: !campaign.isAiEnabled },
]);

const source = ref<Source>("picture");
const placeId = ref("");
const title = ref("");
const subject = ref("");
const file = ref<File | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

// Each opening starts clean: a stale half-filled start is worse than an empty one.
watch(
  () => open,
  (isOpen) => {
    if (!isOpen) return;
    source.value = picturedPlaces.value.length ? "picture" : "upload";
    placeId.value = "";
    title.value = "";
    subject.value = "";
    file.value = null;
    error.value = null;
  },
  { immediate: true },
);

function onFile(event: Event) {
  const picked = (event.target as HTMLInputElement).files?.[0] ?? null;
  file.value = picked;
  if (picked && !title.value.trim()) title.value = picked.name.replace(/\.[^.]+$/, "");
}

const chosenPlace = computed(() => places.value.find((p) => p.id === placeId.value) ?? null);

const canStart = computed(() => {
  if (starting.value) return false;
  if (source.value === "picture") return !!chosenPlace.value?.image_url;
  if (source.value === "upload") return !!file.value && !!title.value.trim();
  return !!subject.value.trim();
});

const actionLabel = computed(() => {
  if (source.value === "picture") return "Start nook";
  if (source.value === "upload") return "Start nook";
  return paintCost.value === null ? "Paint the room" : `Paint the room · ${paintCost.value} credits`;
});

async function start() {
  let id: string | null = null;
  if (source.value === "picture" && chosenPlace.value) id = await startFromPicture(chosenPlace.value);
  else if (source.value === "upload" && file.value) id = await startFromUpload(file.value, title.value.trim());
  else if (source.value === "paint") id = await startFromPainted(chosenPlace.value, subject.value);
  if (id) emit("close");
}

function close() {
  emit("close");
}
</script>
