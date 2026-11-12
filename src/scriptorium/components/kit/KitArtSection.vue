<template>
  <div class="flex flex-col gap-2" data-testid="kit-art">
    <div class="flex flex-wrap gap-2">
      <AppButton variant="subtle" size="sm" :icon="IconLibrary" label="Browse pictures" @click="picking = true" />
      <AppButton variant="subtle" size="sm" :icon="IconLink" label="Web address" :active="addressOpen" @click="addressOpen = !addressOpen" />
    </div>

    <form v-if="addressOpen" class="flex flex-col gap-1" @submit.prevent="addFromAddress">
      <AppInput v-model="address" type="url" size="sm" block placeholder="https://" aria-label="Picture web address" data-testid="kit-art-address" />
      <p v-if="addressError" class="text-caption text-destructive" role="alert">{{ addressError }}</p>
      <AppButton type="submit" variant="subtle" size="sm" label="Add the picture" class="self-start" />
    </form>

    <ul v-if="recent.length > 0" class="grid grid-cols-3 gap-2" aria-label="Pictures to drag onto the page">
      <li v-for="src in recent" :key="src">
        <AppButton
          variant="ghost"
          size="body"
          class="h-auto w-full cursor-grab p-0"
          draggable="true"
          tooltip="Drag onto the page, or click to put it at the cursor"
          @click="place(src)"
          @dragstart="startKitDrag($event, { kind: 'art', src })"
          @dragend="endKitDrag"
        >
          <img :src="src" alt="" draggable="false" class="aspect-square w-full rounded-sm border border-border bg-muted object-cover" />
        </AppButton>
      </li>
    </ul>
    <p v-else class="text-caption italic text-muted-foreground">Pictures you pick show here, ready to drag onto the page.</p>

    <ArtPickerModal :show="picking" @select="onPicked" @close="picking = false" />
  </div>
</template>

<script setup lang="ts">
/**
 * "Art" in the book kit (#1176 frame 13): the three ways in the old block picker
 * had (a web address, the art library, your uploaded photos; the library and the
 * photos are one browser) and the pictures just chosen, which can be dragged
 * onto the page where you want them. A picture becomes a picture in the text.
 */
import { ref } from "vue";
import type { Editor } from "@tiptap/core";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import ArtPickerModal from "@/components/common/overlays/ArtPickerModal.vue";
import { IconLibrary, IconLink } from "@/lib/icons";
import { endKitDrag, startKitDrag } from "@/scriptorium/lib/kit/kitItem";
import { placeKitItem } from "@/scriptorium/lib/kit/placeKitItem";
import { isTwoColumnPage } from "@/scriptorium/lib/kit/twoColumn";
import { webPictureAddress } from "@/scriptorium/lib/kit/pictureAddress";

const { editor } = defineProps<{ editor: Editor | undefined }>();

const RECENT_LIMIT = 6;
const recent = ref<string[]>([]);
const picking = ref(false);
const addressOpen = ref(false);
const address = ref("");
const addressError = ref("");

function place(src: string) {
  if (editor) placeKitItem(editor, { kind: "art", src }, { isTwoColumn: isTwoColumnPage(editor) });
}

function remember(src: string) {
  recent.value = [src, ...recent.value.filter((s) => s !== src)].slice(0, RECENT_LIMIT);
}

function onPicked(src: string) {
  picking.value = false;
  remember(src);
  place(src);
}

function addFromAddress() {
  const src = webPictureAddress(address.value);
  if (src === null) {
    addressError.value = "Paste a web address that starts with https://";
    return;
  }
  addressError.value = "";
  address.value = "";
  addressOpen.value = false;
  remember(src);
  place(src);
}
</script>
