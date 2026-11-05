<template>
  <AppModal :open="open" size="md" @close="close">
    <ModalHeader :title="`Show “${nook.title}” at a place`" :icon="IconNavBookNook" tone="primary" closeable @close="close" />

    <div class="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-5 py-4">
      <EntityCombobox v-model="placeId" :options="options" placeholder="Search places…" />
      <p class="text-caption text-muted-foreground">
        The place shows this nook, and its picture becomes the nook's still. A place that shows another nook is marked.
      </p>
    </div>

    <div class="flex shrink-0 justify-end gap-2 px-5 pb-5 pt-2">
      <AppButton variant="subtle" size="sm" label="Cancel" @click="close" />
      <AppButton
        variant="primary"
        size="sm"
        label="Show here"
        :loading="saving"
        :disabled="!placeId || saving"
        @click="show"
      />
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import AppModal from "@/components/common/overlays/AppModal.vue";
import ModalHeader from "@/components/common/overlays/ModalHeader.vue";
import { useBookNooks } from "@/composables/bookNook/useBookNooks";
import { useShowNookAtPlace } from "@/composables/bookNook/useShowNookAtPlace";
import { useAllLocations } from "@/composables/locations/useLocations";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import { IconNavBookNook } from "@/lib/icons";
import type { BookNook } from "@/types/bookNook.types";

const { open, nook } = defineProps<{ open: boolean; nook: BookNook }>();
const emit = defineEmits<{ close: [] }>();

const { data: locations } = useAllLocations(() => open);
const { data: nooks } = useBookNooks();
const { mutateAsync: showAt } = useShowNookAtPlace();
const { confirm } = useConfirm();
const toast = useToast();

const placeId = ref("");
const saving = ref(false);

watch(
  () => open,
  (isOpen) => {
    if (isOpen) placeId.value = "";
  },
  { immediate: true },
);

const titleOf = computed(() => new Map((nooks.value ?? []).map((n) => [n.id, n.title])));

/** Another nook's name when the place already shows one, else null. */
function otherNookAt(bookNookId: string | null | undefined): string | null {
  if (!bookNookId || bookNookId === nook.id) return null;
  return titleOf.value.get(bookNookId) ?? "another nook";
}

const options = computed(() =>
  (locations.value ?? [])
    .filter((l) => l.book_nook_id !== nook.id)
    .map((l) => {
      const other = otherNookAt(l.book_nook_id);
      return { id: l.id, name: other ? `${l.name} (shows ${other})` : l.name };
    }),
);

async function show() {
  const place = (locations.value ?? []).find((l) => l.id === placeId.value);
  if (!place) return;
  const other = otherNookAt(place.book_nook_id);
  if (other && !(await confirm(`${place.name} shows ${other} now. Show this one instead?`, { title: "Replace nook", confirmLabel: "Show this one" }))) return;
  saving.value = true;
  try {
    await showAt({ locationId: place.id, nookId: nook.id });
    emit("close");
  } catch (e) {
    toast.error(toast.fromError(e));
  } finally {
    saving.value = false;
  }
}

function close() {
  emit("close");
}
</script>
