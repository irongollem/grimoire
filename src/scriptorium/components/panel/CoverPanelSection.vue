<template>
  <div data-testid="panel-cover">
    <ArtPickerModal :show="showArtPicker" @select="onArtPicked" @close="showArtPicker = false" />

    <PanelSection>
      <h2 class="text-eyebrow uppercase text-primary">Cover</h2>
      <p class="text-body text-foreground">{{ variantLabel }}</p>
      <p class="text-caption text-muted-foreground">{{ writtenOnCover }} Everything else about the cover is here.</p>
    </PanelSection>

    <PanelSection v-if="variant !== 'part'" title="Art">
      <AppButton variant="ghost" size="inline-xs" :icon="IconLibrary" label="Browse library" class="self-start" @click="showArtPicker = true" />
      <ImageUpload
        :model-value="text('backgroundImage') || null"
        bucket="asset-images"
        :aspect="variant === 'back' ? 'landscape' : 'portrait'"
        :placeholder="variant === 'back' ? 'Drop back cover art or click to upload' : 'Drop cover art or click to upload'"
        @update:model-value="set('backgroundImage', $event ?? '')"
      />
    </PanelSection>

    <template v-if="variant === 'front'">
      <PanelSection>
        <PanelField label="Title sits">
          <SegmentedControl :model-value="titlePlace" :options="PLACE_OPTIONS" size="xs" block @update:model-value="set('titlePlace', $event)" />
        </PanelField>
      </PanelSection>
      <PanelSection v-if="text('backgroundImage')">
        <PanelField label="Shade under the title">
          <SegmentedControl :model-value="shade" :options="SHADE_OPTIONS" size="xs" block @update:model-value="set('shade', $event)" />
        </PanelField>
      </PanelSection>
    </template>

    <PanelSection v-if="variant === 'part'" title="Words">
      <PanelField label="Part number">
        <AppInput :model-value="text('partNumber')" tone="muted" size="body" placeholder="I" @update:model-value="set('partNumber', $event)" />
      </PanelField>
    </PanelSection>

    <PanelSection v-else-if="variant === 'back'" title="Words">
      <PanelField v-for="blurb in BLURBS" :key="blurb.key" :label="blurb.label">
        <!-- Plain text on purpose: a blurb is a cover attribute that coverMarkup sets as a text node, never markup. -->
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

    <PanelSection>
      <PanelField label="Which cover">
        <SegmentedControl :model-value="variant" :options="VARIANT_OPTIONS" size="xs" block @update:model-value="set('variant', $event)" />
      </PanelField>
    </PanelSection>
  </div>
</template>

<script setup lang="ts">
/**
 * A cover page (#1176, frame 05): front, inside, a part divider or the back.
 * The title and subtitle (and the part number's and back cover's other words
 * that sit as text) are typed on the cover; the art, where the title sits, its
 * shade and which cover it is live here. Applied as you go. There is no Apply or Cancel: the chapter saves itself, and undo takes
 * a change back.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import { fieldVariants } from "@/components/common/controls/fieldVariants";
import SegmentedControl, { type SegmentedOption } from "@/components/common/controls/SegmentedControl.vue";
import ImageUpload from "@/components/common/media/ImageUpload.vue";
import ArtPickerModal from "@/components/common/overlays/ArtPickerModal.vue";
import PanelField from "@/scriptorium/components/panel/PanelField.vue";
import PanelSection from "@/scriptorium/components/panel/PanelSection.vue";
import { cn } from "@/lib/utils";
import { IconLibrary } from "@/lib/icons";
import {
  COVER_SHADES,
  COVER_TITLE_PLACES,
  coverShade,
  type CoverPageAttrs,
  type CoverPageVariant,
  type CoverShade,
  type CoverTitlePlace,
} from "@/scriptorium/lib/coverMarkup";

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
const WRITTEN_ON_COVER: Record<CoverPageVariant, string> = {
  front: "The title and subtitle are text on the cover: click them and type.",
  inside: "The title and subtitle are text on the cover: click them and type.",
  part: "The subtitle is text on the cover: click it and type.",
  back: "The subtitle, blurbs, tagline and link are text on the cover: click them and type.",
};
const writtenOnCover = computed(() => WRITTEN_ON_COVER[variant.value]);

const VARIANT_OPTIONS: SegmentedOption<CoverPageVariant>[] = [
  { value: "front", label: "Front" },
  { value: "inside", label: "Inside" },
  { value: "part", label: "Part" },
  { value: "back", label: "Back" },
];
const PLACE_OPTIONS: SegmentedOption<CoverTitlePlace>[] = COVER_TITLE_PLACES.map((value) => ({
  value,
  label: value[0].toUpperCase() + value.slice(1),
}));
const SHADE_OPTIONS: SegmentedOption<CoverShade>[] = COVER_SHADES.map((value) => ({
  value,
  label: value[0].toUpperCase() + value.slice(1),
}));
const titlePlace = computed<CoverTitlePlace>(() =>
  COVER_TITLE_PLACES.includes(attrs.titlePlace as CoverTitlePlace) ? (attrs.titlePlace as CoverTitlePlace) : "bottom",
);
const shade = computed(() => coverShade({ shade: attrs.shade as CoverShade }));

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
