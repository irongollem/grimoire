<template>
  <AppModal :open="open" size="lg" :backdrop-dismiss="false" @close="close">
    <ModalHeader title="Upload your own frame" subtitle="Free, and yours for every nook." :icon="IconAddImage" tone="gold" closeable @close="close" />

    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
      <p class="mb-3 text-caption text-muted-foreground">
        A picture with a see-through opening, laid over the edge of the screen. It never moves; the room shifts behind it.
      </p>
      <div class="grid gap-3 sm:grid-cols-2">
        <section v-for="slot in SLOTS" :key="slot.shape" class="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-3" :aria-labelledby="`frame-slot-${slot.shape}`">
          <header>
            <h3 :id="`frame-slot-${slot.shape}`" class="text-label-lg font-semibold">{{ slot.label }}</h3>
            <p class="text-caption text-muted-foreground">{{ slot.hint }}</p>
          </header>
          <div class="flex h-40 items-center justify-center overflow-hidden rounded-md border border-border bg-[repeating-conic-gradient(var(--color-muted)_0_25%,var(--color-card)_0_50%)] bg-size-[1rem_1rem]">
            <img v-if="picked[slot.shape]" :src="picked[slot.shape]?.preview" :alt="`${slot.label} frame preview`" class="size-full object-contain" />
            <span v-else class="text-caption text-muted-foreground">No picture yet</span>
          </div>
          <p v-if="errors[slot.shape]" class="text-caption text-tone-danger" role="alert">{{ errors[slot.shape] }}</p>
          <input :ref="(el) => (inputs[slot.shape] = el as HTMLInputElement | null)" type="file" accept="image/png,image/webp" class="sr-only" tabindex="-1" :aria-label="`${slot.label} frame picture`" @change="(e) => onFile(slot.shape, e)" />
          <div class="flex gap-2">
            <AppButton variant="outline" size="sm" class="flex-1" label="Choose a file" :disabled="uploading" @click="inputs[slot.shape]?.click()" />
            <AppButton v-if="picked[slot.shape]" variant="ghost" size="sm" label="Remove" :disabled="uploading" @click="remove(slot.shape)" />
          </div>
        </section>
      </div>
      <label class="mt-3 flex flex-col gap-1">
        <span class="text-label uppercase text-muted-foreground">Name</span>
        <AppInput v-model="name" placeholder="My frame" :maxlength="60" aria-label="Frame name" />
      </label>
    </div>

    <div class="flex justify-end gap-2 border-t border-border px-5 py-3">
      <AppButton variant="ghost" label="Cancel" :disabled="uploading" @click="close" />
      <AppButton variant="primary" label="Use this frame" :loading="uploading" :disabled="!canUse" @click="onUse" />
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppModal from "@/components/common/overlays/AppModal.vue";
import ModalHeader from "@/components/common/overlays/ModalHeader.vue";
import { useToast } from "@/composables/useToast";
import { hasOpening } from "@/lib/bookNook/frames";
import { uploadNookFrame } from "@/lib/bookNook/upload";
import { IconAddImage } from "@/lib/icons";
import { useAuthStore } from "@/stores/auth";
import { loadImage } from "./addCutout/canvas";

/**
 * "Upload your own frame": a wide and a tall picture (one is enough) with a see-through middle. The pictures are
 * stored under the DM's own `nooks/frames/` folder, not a nook's, so deleting a nook never takes a frame other
 * nooks use. Emits the stored pair; the studio applies it with the frame op.
 */
const { open } = defineProps<{ open: boolean }>();
const emit = defineEmits<{
  close: [];
  picked: [frame: { style: string; name: string; tall?: string; wide?: string }];
}>();

type Shape = "wide" | "tall";
const SLOTS: { shape: Shape; label: string; hint: string }[] = [
  { shape: "wide", label: "Wide", hint: "for the TV and the website" },
  { shape: "tall", label: "Tall", hint: "for phones" },
];
const NO_OPENING = "This picture has no see-through middle, so it would cover the room. Use a PNG or WebP with the opening cut out.";
/** The longest side the opening is read at: enough to see the middle, cheap to read. */
const READ_MAX = 256;

const toast = useToast();
const auth = useAuthStore();
const picked = reactive<Partial<Record<Shape, { file: File; preview: string }>>>({});
const errors = reactive<Partial<Record<Shape, string>>>({});
const inputs: Partial<Record<Shape, HTMLInputElement | null>> = {};
const name = ref("");
const uploading = ref(false);
const canUse = computed(() => !uploading.value && (!!picked.wide || !!picked.tall));

async function opening(file: File): Promise<boolean> {
  const img = await loadImage(file);
  const k = Math.min(1, READ_MAX / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * k));
  const height = Math.max(1, Math.round(img.naturalHeight * k));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("This browser cannot read the picture.");
  ctx.drawImage(img, 0, 0, width, height);
  return hasOpening(ctx.getImageData(0, 0, width, height).data, width, height);
}

function drop(shape: Shape) {
  const was = picked[shape];
  if (was) URL.revokeObjectURL(was.preview);
  delete picked[shape];
  delete errors[shape];
}

function remove(shape: Shape) {
  drop(shape);
}

async function onFile(shape: Shape, event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  drop(shape);
  try {
    if (!(await opening(file))) {
      errors[shape] = NO_OPENING;
      return;
    }
  } catch (e) {
    errors[shape] = toast.fromError(e);
    return;
  }
  picked[shape] = { file, preview: URL.createObjectURL(file) };
  if (!name.value.trim()) name.value = file.name.replace(/\.[^.]+$/, "");
}

async function onUse() {
  const user = auth.user;
  if (!user) {
    toast.error("Sign in again to upload a frame.");
    return;
  }
  uploading.value = true;
  try {
    const [wide, tall] = await Promise.all(
      (["wide", "tall"] as const).map((shape) => {
        const p = picked[shape];
        return p ? uploadNookFrame(p.file, user.id) : Promise.resolve(undefined);
      }),
    );
    emit("picked", { style: `own-${crypto.randomUUID()}`, name: name.value.trim() || "My frame", tall, wide });
    emit("close");
  } catch (e) {
    toast.error(toast.fromError(e));
  } finally {
    uploading.value = false;
  }
}

function close() {
  if (!uploading.value) emit("close");
}

// A reopened dialog starts empty.
watch(
  () => open,
  (now) => {
    if (now) return;
    drop("wide");
    drop("tall");
    name.value = "";
  },
);
</script>
