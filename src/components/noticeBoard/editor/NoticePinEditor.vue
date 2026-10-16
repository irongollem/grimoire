<template>
  <section class="flex flex-col gap-4" data-pin-editor>
    <div class="flex items-center justify-between gap-2">
      <h3 class="text-heading-sm font-bold text-foreground">{{ STYLE_LABELS[draft.style] }}</h3>
      <AutosaveStatus :status="status" :error="saveError" />
    </div>

    <!-- What the reader will see, as it will look. -->
    <div class="preview rounded-lg border border-border p-3" data-pin-preview>
      <NoticePinFace :face="previewFace" mode="reader" />
    </div>

    <div class="space-y-1.5">
      <p class="text-eyebrow font-semibold text-muted-foreground">Kind</p>
      <SegmentedControl v-model="draft.style" :options="STYLE_OPTIONS" size="sm" wrap />
    </div>

    <div class="space-y-1.5">
      <label class="text-eyebrow font-semibold text-muted-foreground" :for="`${uid}-headline`">
        {{ HEADLINE_FIELD[draft.style].label }}
      </label>
      <AppInput
        :id="`${uid}-headline`"
        v-model="draft.headline"
        tone="card"
        size="body"
        :placeholder="HEADLINE_FIELD[draft.style].placeholder"
      />
    </div>

    <div class="space-y-1.5">
      <label class="text-eyebrow font-semibold text-muted-foreground" :for="`${uid}-body`">
        {{ BODY_FIELD[draft.style].label }}
      </label>
      <!-- Plain text on purpose: the notice is hand-written, and the player's face sets it in the hand as typed. -->
      <textarea
        :id="`${uid}-body`"
        data-field="input"
        :value="draft.body"
        rows="4"
        :placeholder="BODY_FIELD[draft.style].placeholder"
        :class="cn(fieldVariants({ tone: 'card', size: 'body' }), 'w-full resize-y')"
        @input="draft.body = ($event.target as HTMLTextAreaElement).value"
      />
    </div>

    <div v-if="draft.style === 'poster'" class="space-y-1.5">
      <label class="text-eyebrow font-semibold text-muted-foreground" :for="`${uid}-reward`">Reward</label>
      <AppInput
        :id="`${uid}-reward`"
        v-model="draft.reward"
        tone="card"
        size="body"
        placeholder="50 gold crowns, paid at the reeve's hall"
      />
    </div>

    <div v-if="draft.style === 'letter'" class="space-y-1.5">
      <p class="text-eyebrow font-semibold text-muted-foreground">Wax seal</p>
      <SegmentedControl v-model="sealModel" :options="SEAL_OPTIONS" size="sm" />
    </div>

    <div v-if="draft.style === 'poster' || draft.style === 'image'" class="flex flex-col gap-2">
      <p class="text-eyebrow font-semibold text-muted-foreground">Picture</p>
      <div v-if="draft.image_url" class="flex items-center gap-3">
        <!-- Pins carry no focal point column, so every picture is framed from its centre. -->
        <FocalImage
          :src="draft.image_url"
          format="square"
          :focal-point="CENTRED"
          class="h-16 w-16 shrink-0 overflow-hidden rounded-md border border-border"
        />
        <AppButton variant="ghost" size="sm" tone="danger" label="Remove picture" @click="setPicture(null)" />
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <AppButton
          variant="outline"
          size="sm"
          :icon="IconUpload"
          :loading="isUploading"
          :label="draft.image_url ? 'Replace picture' : 'Upload a picture'"
          @click="fileInput?.click()"
        />
        <input ref="fileInput" type="file" accept="image/*" class="sr-only" tabindex="-1" @change="onFile" />
      </div>
      <p v-if="uploadError" role="alert" class="text-caption text-destructive">{{ uploadError }}</p>
      <NoticePinSubjectPicker v-if="draft.style === 'poster'" @pick="onSubject" />
    </div>

    <div class="space-y-1.5">
      <p class="text-eyebrow font-semibold text-muted-foreground">Size</p>
      <SegmentedControl v-model="draft.size" :options="SIZE_OPTIONS" size="sm" />
    </div>

    <NoticePinOffers :draft="draft" :campaign-id="pin.campaign_id" />

    <div v-if="pin.status === 'taken'" class="rounded-md bg-muted/50 px-3 py-2 text-caption text-foreground">
      {{ stubLabel(previewFace) }}. Pin it back up and it hangs on the board again; nothing it revealed is undone.
    </div>

    <div class="flex flex-wrap items-center gap-2 border-t border-border pt-3">
      <AppButton
        v-if="pin.status === 'draft'"
        variant="primary"
        size="md"
        label="Put it up"
        :disabled="!hasFace(draft) || busy"
        :tooltip="hasFace(draft) ? 'Hang it on the board. Players see it as soon as the board is shown.' : 'Write something or add a picture first.'"
        @click="putUp"
      />
      <AppButton v-else-if="pin.status === 'up'" variant="outline" size="md" label="Take down" tooltip="Back to drafts, off the board" :disabled="busy" @click="takeDown" />
      <AppButton v-else variant="primary" size="md" label="Pin back up" :disabled="busy" @click="pinBackUp" />
      <AppButton variant="ghost" size="md" tone="danger" :icon="IconDelete" label="Delete" class="ml-auto" :disabled="busy" @click="remove" />
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * One pin's form. It saves itself (a draft of the face, offers and size), and the three things that move a pin
 * between states (Put it up, Take down, Pin back up) are explicit buttons that flush the draft first. The parent
 * keys it on the pin id, so another pin is a fresh draft and the unmount flush writes the old one.
 */
import { computed, reactive, ref, useId, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import { fieldVariants } from "@/components/common/controls/fieldVariants";
import AutosaveStatus from "@/components/common/feedback/AutosaveStatus.vue";
import FocalImage from "@/components/common/media/FocalImage.vue";
import { useAutosave } from "@/composables/useAutosave";
import { useConfirm } from "@/composables/useConfirm";
import { useImageUpload } from "@/composables/useImageUpload";
import {
  useDeleteNoticeBoardPin,
  usePinNoticeBackUp,
  useUpdateNoticeBoardPin,
} from "@/composables/noticeBoards/useNoticeBoards";
import { IconDelete, IconUpload } from "@/lib/icons";
import { deleteUnreferencedByPublicUrl } from "@/lib/storage";
import { stubLabel, STYLE_LABELS, toPinFace } from "@/lib/noticeBoard/faces";
import { cn } from "@/lib/utils";
import {
  NOTICE_PIN_SIZES,
  NOTICE_PIN_STYLES,
  type NoticeBoardPin,
  type NoticePinSeal,
} from "@/types/noticeBoard.types";
import NoticePinFace from "../NoticePinFace.vue";
import NoticePinOffers from "./NoticePinOffers.vue";
import NoticePinSubjectPicker from "./NoticePinSubjectPicker.vue";
import { BODY_FIELD, draftsEqual, draftToUpdate, HEADLINE_FIELD, hasFace, pinToDraft } from "./pinDraft";

const { pin, takerName = null } = defineProps<{ pin: NoticeBoardPin; takerName?: string | null }>();
const emit = defineEmits<{ deleted: [] }>();

const uid = useId();
const { confirm } = useConfirm();
const update = useUpdateNoticeBoardPin();
const backUp = usePinNoticeBackUp();
const del = useDeleteNoticeBoardPin();
const { upload, isUploading, uploadError } = useImageUpload("dungeon-feature-images");

const draft = reactive(pinToDraft(pin));
const version = ref(pin.updated_at);
/** The picture the row holds right now. A save that moves off it (removed, replaced, or the pin became a note) sweeps it. */
let savedImage = pin.image_url;

/**
 * Delete a stored picture nothing else points at: a portrait copied from an NPC or monster is theirs, and the sweep
 * keeps any file another row holds. Failing to tidy up must not read as a failed save, so it is reported on its own.
 */
async function sweep(url: string | null) {
  if (!url) return;
  try {
    await deleteUnreferencedByPublicUrl({ urls: [url] });
  } catch (error) {
    setTimeout(() => { throw error; });
  }
}

const { status, dirty, saving, saveError, saveNow, reset, hold, release } = useAutosave({
  draft,
  initial: () => pinToDraft(pin),
  equal: draftsEqual,
  errorMessage: "Could not save this notice",
  async save(snapshot) {
    const next = draftToUpdate(snapshot);
    const saved = await update.mutateAsync({ id: pin.id, update: next });
    version.value = saved.updated_at;
    const written = next.image_url ?? null;
    if (written !== savedImage) {
      const old = savedImage;
      savedImage = written;
      await sweep(old);
    }
  },
});

// Our own save echoes back through `pin` (the optimistic write, then the refetch) with the text trimmed and blanks
// nulled; re-seeding from that would pull characters out from under the caret. Only a row changed elsewhere, while
// nothing here is unsaved, may replace the draft.
watch(
  () => pin,
  (next) => {
    if (next.updated_at === version.value || dirty.value || saving.value) return;
    version.value = next.updated_at;
    savedImage = next.image_url;
    reset(pinToDraft(next));
  },
  { deep: true },
);

// The preview is the draft as it will be saved, wearing the pin's own place and taker.
const previewFace = computed(() => ({
  ...toPinFace(pin, takerName),
  style: draft.style,
  headline: draft.headline,
  body: draft.body,
  reward: draft.style === "poster" ? draft.reward : null,
  image_url: draft.style === "poster" || draft.style === "image" ? draft.image_url : null,
  seal: draft.style === "letter" ? (draft.seal ?? "red") : null,
  size: draft.size,
}));

const STYLE_OPTIONS = NOTICE_PIN_STYLES.map((value) => ({ value, label: STYLE_LABELS[value] }));
const SIZE_LABELS = { sm: "Small", md: "Medium", lg: "Large" } as const;
const SIZE_OPTIONS = NOTICE_PIN_SIZES.map((value) => ({ value, label: SIZE_LABELS[value] }));
const SEAL_OPTIONS = [
  { value: "red", label: "Red tower" },
  { value: "black", label: "Black stag" },
] as const;
const sealModel = computed({
  get: (): NoticePinSeal => draft.seal ?? "red",
  set: (value: NoticePinSeal) => {
    draft.seal = value;
  },
});

// ── Picture ──────────────────────────────────────────────────────────────────
const CENTRED = { x: 50, y: 50 };
const fileInput = ref<HTMLInputElement | null>(null);
async function onFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  const url = await upload(file);
  if (url) await setPicture(url);
}

/** A picture uploaded here and replaced before it ever saved is held by no row, so it goes now; a saved one goes with the save. */
async function setPicture(next: string | null) {
  const unsaved = draft.image_url !== savedImage && draft.image_url !== next ? draft.image_url : null;
  draft.image_url = next;
  await sweep(unsaved);
}

/** A wanted poster of someone from the campaign: their name on the paper, their portrait in the frame. */
function onSubject(subject: { name: string; image: string | null }) {
  draft.headline = subject.name;
  if (subject.image) void setPicture(subject.image);
}

// ── Moving between states ────────────────────────────────────────────────────
const busy = computed(() => update.isPending.value || backUp.isPending.value || del.isPending.value);

async function putUp() {
  await saveNow();
  if (dirty.value) return; // the save failed; the status line says why
  await update.mutateAsync({ id: pin.id, update: { status: "up" } });
}
async function takeDown() {
  await saveNow();
  await update.mutateAsync({ id: pin.id, update: { status: "draft" } });
}
async function pinBackUp() {
  await saveNow();
  await backUp.mutateAsync(pin.id);
}
async function remove() {
  const name = pin.headline?.trim() || STYLE_LABELS[pin.style].toLowerCase();
  if (!(await confirm(`Delete "${name}"? This cannot be undone.`))) return;
  // Nothing may be written after the row is gone, the unmount flush included.
  await hold();
  try {
    await del.mutateAsync(pin.id);
    emit("deleted");
  } catch (error) {
    release();
    throw error;
  }
}
</script>

<style scoped>
.preview {
  /* The notice's own paper sits on a neutral patch, not the page, so a pale poster does not vanish into it. */
  background: color-mix(in oklab, var(--muted) 70%, transparent);
  max-height: 22rem;
  overflow: auto;
}
/* The reader's own size is for a full-screen lean-in; the side panel is narrower, so the preview reads smaller. */
.preview :deep(.nb-face.is-reader) {
  --u: min(0.045rem, calc((100vw - 5rem) / 400));
}
</style>
