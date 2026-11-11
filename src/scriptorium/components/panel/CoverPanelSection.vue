<template>
  <div data-testid="panel-cover">
    <ArtPickerModal :show="showArtPicker" @select="onArtPicked" @close="showArtPicker = false" />

    <PanelSection>
      <h2 class="text-eyebrow uppercase text-primary">Cover</h2>
      <p class="text-body text-foreground">{{ variantLabel }}</p>
    </PanelSection>

    <PanelSection v-if="variant === 'front' || variant === 'inside'" title="Words">
      <PanelField label="Title">
        <AppInput :model-value="text('title')" tone="muted" size="body" placeholder="Document Title" @update:model-value="set('title', $event)" />
      </PanelField>
      <PanelField label="Subtitle">
        <AppInput :model-value="text('subtitle')" tone="muted" size="body" placeholder="An Unofficial Homebrew Supplement" @update:model-value="set('subtitle', $event)" />
      </PanelField>
    </PanelSection>

    <PanelSection v-else-if="variant === 'part'" title="Words">
      <PanelField label="Part number">
        <AppInput :model-value="text('partNumber')" tone="muted" size="body" placeholder="I" @update:model-value="set('partNumber', $event)" />
      </PanelField>
      <PanelField label="Subtitle">
        <AppInput :model-value="text('subtitle')" tone="muted" size="body" placeholder="Chapter Title or Section Name" @update:model-value="set('subtitle', $event)" />
      </PanelField>
    </PanelSection>

    <PanelSection v-else title="Words">
      <PanelField label="Subtitle">
        <AppInput :model-value="text('subtitle')" tone="muted" size="body" placeholder="Document Title" @update:model-value="set('subtitle', $event)" />
      </PanelField>
      <PanelField v-for="blurb in BLURBS" :key="blurb.key" :label="blurb.label">
        <textarea
          :value="text(blurb.key)"
          :rows="blurb.rows"
          :placeholder="blurb.placeholder"
          :class="cn(fieldVariants({ tone: 'muted', size: 'body' }), 'w-full resize-none px-3')"
          @input="set(blurb.key, ($event.target as HTMLTextAreaElement).value)"
        />
      </PanelField>
      <PanelField label="Tagline">
        <AppInput :model-value="text('tagline')" tone="muted" size="body" placeholder="An unofficial Grimoire supplement" @update:model-value="set('tagline', $event)" />
      </PanelField>
      <PanelField label="Product URL">
        <AppInput :model-value="text('productUrl')" tone="muted" size="body" placeholder="grimoire.example.com" @update:model-value="set('productUrl', $event)" />
      </PanelField>
    </PanelSection>

    <PanelSection v-if="variant !== 'part'" title="Background art">
      <AppButton variant="ghost" size="inline-xs" :icon="IconLibrary" label="Browse library" class="self-start" @click="showArtPicker = true" />
      <ImageUpload
        :model-value="text('backgroundImage') || null"
        bucket="asset-images"
        :aspect="variant === 'back' ? 'landscape' : 'portrait'"
        :placeholder="variant === 'back' ? 'Drop back cover art or click to upload' : 'Drop cover art or click to upload'"
        @update:model-value="set('backgroundImage', $event ?? '')"
      />
      <AppCheckbox
        v-if="variant === 'front' && text('backgroundImage')"
        size="sm"
        label="Darken behind the title"
        hint="Adds a soft gradient under the title so it reads. Turn off if your art already leaves room for it."
        :model-value="attrs.titleScrim !== false"
        @update:model-value="set('titleScrim', $event)"
      />
    </PanelSection>
  </div>
</template>

<script setup lang="ts">
/**
 * A cover page (#1176, frame 06): front, inside, a part divider or the back.
 * Every field the cover dialog had, edited where it is drawn and applied as
 * you go. There is no Apply or Cancel: the chapter saves itself, and undo takes
 * a change back.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import { fieldVariants } from "@/components/common/controls/fieldVariants";
import ImageUpload from "@/components/common/media/ImageUpload.vue";
import ArtPickerModal from "@/components/common/overlays/ArtPickerModal.vue";
import PanelField from "@/scriptorium/components/panel/PanelField.vue";
import PanelSection from "@/scriptorium/components/panel/PanelSection.vue";
import { cn } from "@/lib/utils";
import { IconLibrary } from "@/lib/icons";
import type { CoverPageAttrs, CoverPageVariant } from "@/scriptorium/tiptap/coverPage";

const { attrs } = defineProps<{ attrs: Readonly<Record<string, unknown>> }>();
const emit = defineEmits<{ update: [patch: Partial<CoverPageAttrs>] }>();

const VARIANT_LABELS: Record<CoverPageVariant, string> = {
  front: "Front cover",
  inside: "Inside cover",
  part: "Part divider",
  back: "Back cover",
};
const VARIANTS = Object.keys(VARIANT_LABELS);
const variant = computed<CoverPageVariant>(() => {
  const v = attrs.variant;
  return VARIANTS.includes(String(v)) ? (v as CoverPageVariant) : "front";
});
const variantLabel = computed(() => VARIANT_LABELS[variant.value]);

type TextKey = "title" | "subtitle" | "partNumber" | "blurb1" | "blurb2" | "blurb3" | "tagline" | "productUrl" | "backgroundImage";
const BLURBS: { key: TextKey; label: string; rows: number; placeholder: string }[] = [
  { key: "blurb1", label: "Blurb 1", rows: 3, placeholder: "Opening hook…" },
  { key: "blurb2", label: "Blurb 2", rows: 3, placeholder: "Stakes and world description…" },
  { key: "blurb3", label: "Blurb 3", rows: 2, placeholder: "Closing punchy line…" },
];

/** A field's text; an attr the node never had reads as empty, which is what its input shows. */
function text(key: TextKey): string {
  const v = attrs[key];
  return typeof v === "string" ? v : "";
}
function set<K extends keyof CoverPageAttrs>(key: K, value: CoverPageAttrs[K]) {
  emit("update", { [key]: value } as Partial<CoverPageAttrs>);
}

const showArtPicker = ref(false);
function onArtPicked(url: string) {
  set("backgroundImage", url);
  showArtPicker.value = false;
}
</script>
