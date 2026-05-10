<template>
  <Teleport to="body">
    <div
      v-if="show"
      class="fixed inset-0 z-9999 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      @click.self="$emit('close')"
      @keydown.esc="$emit('close')"
    >
      <div
        class="flex flex-col w-[min(480px,94vw)] max-h-[90vh] bg-card rounded-xl border border-border shadow-2xl overflow-hidden"
      >
        <!-- Header -->
        <div class="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h2 class="font-cinzel font-bold text-sm tracking-wide text-foreground">
            Edit Cover — <span class="capitalize text-muted-foreground">{{ variantLabel }}</span>
          </h2>
          <button
            type="button"
            class="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            @click="$emit('close')"
          >
            <IconClose class="h-4 w-4" />
          </button>
        </div>

        <!-- Fields -->
        <div class="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <!-- Front / Inside -->
          <template v-if="variant === 'front' || variant === 'inside'">
            <div class="space-y-1.5">
              <label class="block font-cinzel text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Title</label>
              <input
                v-model="local.title"
                type="text"
                placeholder="Document Title"
                class="w-full bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div class="space-y-1.5">
              <label class="block font-cinzel text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Subtitle</label>
              <input
                v-model="local.subtitle"
                type="text"
                placeholder="An Unofficial Homebrew Supplement"
                class="w-full bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div class="space-y-1.5">
              <label class="block font-cinzel text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Background Art</label>
              <ImageUpload
                v-model="backgroundImageModel"
                aspect="portrait"
                placeholder="Drop cover art or click to upload"
              />
            </div>
          </template>

          <!-- Part divider -->
          <template v-else-if="variant === 'part'">
            <div class="space-y-1.5">
              <label class="block font-cinzel text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Part Number</label>
              <input
                v-model="local.partNumber"
                type="text"
                placeholder="I"
                class="w-full bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div class="space-y-1.5">
              <label class="block font-cinzel text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Subtitle</label>
              <input
                v-model="local.subtitle"
                type="text"
                placeholder="Chapter Title or Section Name"
                class="w-full bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </template>

          <!-- Back cover -->
          <template v-else-if="variant === 'back'">
            <div class="space-y-1.5">
              <label class="block font-cinzel text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Subtitle</label>
              <input
                v-model="local.subtitle"
                type="text"
                placeholder="Document Title"
                class="w-full bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div class="space-y-1.5">
              <label class="block font-cinzel text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Blurb 1</label>
              <textarea
                v-model="local.blurb1"
                rows="3"
                placeholder="Opening hook…"
                class="w-full bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
            </div>
            <div class="space-y-1.5">
              <label class="block font-cinzel text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Blurb 2</label>
              <textarea
                v-model="local.blurb2"
                rows="3"
                placeholder="Stakes and world description…"
                class="w-full bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
            </div>
            <div class="space-y-1.5">
              <label class="block font-cinzel text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Blurb 3</label>
              <textarea
                v-model="local.blurb3"
                rows="2"
                placeholder="Closing punchy line…"
                class="w-full bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
            </div>
            <div class="space-y-1.5">
              <label class="block font-cinzel text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Tagline</label>
              <input
                v-model="local.tagline"
                type="text"
                placeholder="An unofficial Grimoire supplement"
                class="w-full bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div class="space-y-1.5">
              <label class="block font-cinzel text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Product URL</label>
              <input
                v-model="local.productUrl"
                type="text"
                placeholder="grimoire.example.com"
                class="w-full bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div class="space-y-1.5">
              <label class="block font-cinzel text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Background Art</label>
              <ImageUpload
                v-model="backgroundImageModel"
                aspect="landscape"
                placeholder="Drop back cover art or click to upload"
              />
            </div>
          </template>
        </div>

        <!-- Footer -->
        <div class="flex flex-col gap-2 px-4 py-3 border-t border-border shrink-0">
          <p v-if="applyError" class="font-fell text-xs text-destructive italic">{{ applyError }}</p>
          <p v-else-if="!isActiveCoverPage" class="font-fell text-xs text-muted-foreground italic">Click inside a cover page in the editor to enable Apply.</p>
          <div class="flex justify-end gap-2">
            <button
              type="button"
              class="px-4 py-1.5 rounded-md font-cinzel text-xs font-semibold tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              @click="$emit('close')"
            >
              Cancel
            </button>
            <button
              type="button"
              :disabled="!isActiveCoverPage"
              class="px-4 py-1.5 rounded-md bg-primary font-cinzel text-xs font-semibold tracking-wider text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
              @click="apply"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { reactive, computed, watch, ref } from "vue";
import { IconClose } from '@/lib/icons';
import type { Editor } from "@tiptap/vue-3";
import type { CoverPageAttrs, CoverPageVariant } from "@/lib/tiptap/coverPage";
import ImageUpload from "@/components/common/ImageUpload.vue";

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
