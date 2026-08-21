<template>
  <ArtPickerModal
    :show="showArtPicker"
    @select="backgroundImageModel = $event"
    @close="showArtPicker = false"
  />
  <Teleport to="body">
    <div
      v-if="show"
      class="fixed inset-0 z-9999 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      @click.self="$emit('close')"
      @keydown.esc="$emit('close')"
    >
      <div
        class="flex flex-col w-[min(30rem,94vw)] max-h-[90vh] bg-card rounded-xl border border-border shadow-2xl overflow-hidden"
      >
        <!-- Header -->
        <div class="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h2 class="font-cinzel font-bold text-sm tracking-wide text-foreground">
            Edit Cover — <span class="capitalize text-muted-foreground">{{ variantLabel }}</span>
          </h2>
          <AppButton
            variant="ghost"
            size="icon-sm"
            :icon="IconClose"
            tooltip="Close"
            aria-label="Close"
            @click="$emit('close')"
          />
        </div>

        <!-- Fields -->
        <div class="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <!-- Front / Inside -->
          <template v-if="variant === 'front' || variant === 'inside'">
            <div class="space-y-1.5">
              <label class="block text-label-lg font-semibold text-muted-foreground uppercase">Title</label>
              <AppInput
                v-model="local.title"
                tone="muted"
                size="body"
                placeholder="Document Title"
              />
            </div>
            <div class="space-y-1.5">
              <label class="block text-label-lg font-semibold text-muted-foreground uppercase">Subtitle</label>
              <AppInput
                v-model="local.subtitle"
                tone="muted"
                size="body"
                placeholder="An Unofficial Homebrew Supplement"
              />
            </div>
            <div class="space-y-1.5">
              <div class="flex items-center justify-between">
                <label class="block text-label-lg font-semibold text-muted-foreground uppercase">Background Art</label>
                <AppButton
                  variant="ghost"
                  size="inline-xs"
                  :icon="IconLibrary"
                  label="Browse library"
                  @click="showArtPicker = true"
                />
              </div>
              <ImageUpload
                v-model="backgroundImageModel"
                bucket="asset-images"
                aspect="portrait"
                placeholder="Drop cover art or click to upload"
              />
            </div>
            <AppCheckbox
              v-if="variant === 'front' && local.backgroundImage"
              :model-value="local.titleScrim ?? false"
              label-role="label-lg"
              @update:model-value="local.titleScrim = $event"
              label-class="uppercase"
              label="Darken behind title"
              hint="Adds a soft gradient under the title for legibility. Turn off if your art already leaves room for it."
            />
          </template>

          <!-- Part divider -->
          <template v-else-if="variant === 'part'">
            <div class="space-y-1.5">
              <label class="block text-label-lg font-semibold text-muted-foreground uppercase">Part Number</label>
              <AppInput
                v-model="local.partNumber"
                tone="muted"
                size="body"
                placeholder="I"
              />
            </div>
            <div class="space-y-1.5">
              <label class="block text-label-lg font-semibold text-muted-foreground uppercase">Subtitle</label>
              <AppInput
                v-model="local.subtitle"
                tone="muted"
                size="body"
                placeholder="Chapter Title or Section Name"
              />
            </div>
          </template>

          <!-- Back cover -->
          <template v-else-if="variant === 'back'">
            <div class="space-y-1.5">
              <label class="block text-label-lg font-semibold text-muted-foreground uppercase">Subtitle</label>
              <AppInput
                v-model="local.subtitle"
                tone="muted"
                size="body"
                placeholder="Document Title"
              />
            </div>
            <div class="space-y-1.5">
              <label class="block text-label-lg font-semibold text-muted-foreground uppercase">Blurb 1</label>
              <textarea
                v-model="local.blurb1"
                rows="3"
                placeholder="Opening hook…"
                class="w-full bg-muted border border-border rounded-md px-3 py-1.5 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
            </div>
            <div class="space-y-1.5">
              <label class="block text-label-lg font-semibold text-muted-foreground uppercase">Blurb 2</label>
              <textarea
                v-model="local.blurb2"
                rows="3"
                placeholder="Stakes and world description…"
                class="w-full bg-muted border border-border rounded-md px-3 py-1.5 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
            </div>
            <div class="space-y-1.5">
              <label class="block text-label-lg font-semibold text-muted-foreground uppercase">Blurb 3</label>
              <textarea
                v-model="local.blurb3"
                rows="2"
                placeholder="Closing punchy line…"
                class="w-full bg-muted border border-border rounded-md px-3 py-1.5 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
            </div>
            <div class="space-y-1.5">
              <label class="block text-label-lg font-semibold text-muted-foreground uppercase">Tagline</label>
              <AppInput
                v-model="local.tagline"
                tone="muted"
                size="body"
                placeholder="An unofficial Grimoire supplement"
              />
            </div>
            <div class="space-y-1.5">
              <label class="block text-label-lg font-semibold text-muted-foreground uppercase">Product URL</label>
              <AppInput
                v-model="local.productUrl"
                tone="muted"
                size="body"
                placeholder="grimoire.example.com"
              />
            </div>
            <div class="space-y-1.5">
              <div class="flex items-center justify-between">
                <label class="block text-label-lg font-semibold text-muted-foreground uppercase">Background Art</label>
                <AppButton
                  variant="ghost"
                  size="inline-xs"
                  :icon="IconLibrary"
                  label="Browse library"
                  @click="showArtPicker = true"
                />
              </div>
              <ImageUpload
                v-model="backgroundImageModel"
                bucket="asset-images"
                aspect="landscape"
                placeholder="Drop back cover art or click to upload"
              />
            </div>
          </template>
        </div>

        <!-- Footer -->
        <div class="flex flex-col gap-2 px-4 py-3 border-t border-border shrink-0">
          <p v-if="applyError" class="text-caption text-destructive italic">{{ applyError }}</p>
          <p v-else-if="!isActiveCoverPage" class="text-caption text-muted-foreground italic">Click inside a cover page in the editor to enable Apply.</p>
          <div class="flex justify-end gap-2">
            <AppButton variant="ghost" size="sm" label="Cancel" @click="$emit('close')" />
            <AppButton
              variant="primary"
              size="sm"
              label="Apply"
              :disabled="!isActiveCoverPage"
              @click="apply"
            />
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { reactive, computed, watch, ref } from "vue";
import { IconClose, IconLibrary } from '@/lib/icons';
import type { Editor } from "@tiptap/vue-3";
import type { CoverPageAttrs, CoverPageVariant } from "@/lib/tiptap/coverPage";
import ImageUpload from "@/components/common/ImageUpload.vue";
import ArtPickerModal from "@/components/common/ArtPickerModal.vue";
import AppButton from "@/components/common/AppButton.vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import AppInput from "@/components/common/AppInput.vue";

const props = defineProps<{
  show: boolean;
  editor: Editor | null;
}>();

const emit = defineEmits<{
  close: [];
}>();

const VARIANT_LABELS: Record<CoverPageVariant, string> = {
  front: "Front Cover",
  inside: "Inside Cover",
  part: "Part Divider",
  back: "Back Cover",
};

const local = reactive<Partial<CoverPageAttrs>>({
  title: "",
  subtitle: "",
  partNumber: "",
  blurb1: "",
  blurb2: "",
  blurb3: "",
  tagline: "",
  productUrl: "",
  backgroundImage: "",
  titleScrim: true,
});

const applyError = ref("");

const variant = computed<CoverPageVariant>(() => {
  return (props.editor?.getAttributes("coverPage").variant as CoverPageVariant) ?? "front";
});

const variantLabel = computed(() => VARIANT_LABELS[variant.value] ?? variant.value);

const isActiveCoverPage = computed(() => props.editor?.isActive("coverPage") ?? false);

const backgroundImageModel = computed({
  get: () => local.backgroundImage ?? null,
  set: (v: string | null) => { local.backgroundImage = v ?? ""; },
});

const showArtPicker = ref(false);

watch(
  () => props.show,
  (open) => {
    if (!open || !props.editor) return;
    applyError.value = "";
    const attrs = props.editor.getAttributes("coverPage") as CoverPageAttrs;
    local.title = attrs.title ?? "";
    local.subtitle = attrs.subtitle ?? "";
    local.partNumber = attrs.partNumber ?? "";
    local.blurb1 = attrs.blurb1 ?? "";
    local.blurb2 = attrs.blurb2 ?? "";
    local.blurb3 = attrs.blurb3 ?? "";
    local.tagline = attrs.tagline ?? "";
    local.productUrl = attrs.productUrl ?? "";
    local.backgroundImage = attrs.backgroundImage ?? "";
    local.titleScrim = attrs.titleScrim ?? true;
  },
);

function apply() {
  if (!props.editor) return;
  if (!isActiveCoverPage.value) {
    applyError.value = "Click inside a cover page node first, then apply.";
    return;
  }
  props.editor.chain().focus().updateAttributes("coverPage", { ...local }).run();
  emit("close");
}
</script>
