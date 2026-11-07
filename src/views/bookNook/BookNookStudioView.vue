<template>
  <div v-if="loading" class="flex h-dvh items-center justify-center bg-background">
    <LoadingSpinner />
  </div>

  <div v-else-if="!draft.ready.value || !scene" class="flex h-dvh items-center justify-center bg-background">
    <EmptyState title="Could not open this nook" description="It may have been deleted, or belong to another campaign.">
      <template #action>
        <AppButton to="/book-nook" variant="outline" label="Back to Book Nook" />
      </template>
    </EmptyState>
  </div>

  <div v-else class="flex h-dvh flex-col bg-background">
    <header class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-card px-3 py-2">
      <AppButton
        variant="ghost"
        fill="muted"
        size="sm"
        class="shrink-0"
        :icon="IconChevronLeft"
        :label="backLabel"
        :aria-label="`Back to ${backLabel}`"
        @click="leave"
      />
      <div class="min-w-0 flex-1">
        <p class="flex items-center gap-1 text-label uppercase text-muted-foreground">Book Nook <ManualHelpLink page="book-nook" /></p>
        <AppInput
          v-model="draft.draft.title"
          tone="underline"
          size="body"
          class="w-full max-w-sm"
          aria-label="Nook title"
          placeholder="Untitled nook"
        />
      </div>
      <SegmentedControl v-model="viewMode" :options="VIEW_OPTIONS" size="sm" />
      <div class="flex items-center gap-2">
        <span class="text-label uppercase text-muted-foreground max-sm:hidden">Show on</span>
        <SegmentedControl v-model="screen" :options="SCREEN_OPTIONS" size="sm" />
      </div>
      <AppButton
        variant="outline"
        size="sm"
        :icon="clock.playing.value ? IconPause : IconPlay"
        :label="clock.playing.value ? 'Pause' : 'Play'"
        @click="clock.toggle()"
      />
      <AutosaveStatus :status="draft.status.value" :error="draft.saveError.value" paused-label="Saved elsewhere">
        <template #error-action>
          <AppButton variant="link" size="inline-xs" label="Try again" @click="draft.flush()" />
        </template>
      </AutosaveStatus>
      <AppButton v-if="draft.stale.value" variant="outline" tone="caution" size="sm" label="Reload" @click="reload" />
      <AppButton variant="primary" size="sm" label="Done" @click="leave" />
    </header>

    <div class="flex min-h-0 flex-1 max-lg:flex-col max-lg:overflow-y-auto">
      <aside class="w-72 shrink-0 overflow-y-auto border-r border-border bg-card max-lg:w-full max-lg:border-b max-lg:border-r-0" aria-label="Layers">
        <StudioLayers
          :scene="scene"
          :selection="selection"
          :hidden="hidden"
          :nook-id="nookId"
          @select="selection = $event"
          @toggle="toggleHidden"
          @update="draft.update"
          @added="selection = $event"
          @add-touch="addTouchAtCentre"
          @reorder="(id, onto) => run({ op: 'reorderTo', id, onto })"
        />
      </aside>

      <main class="flex min-h-0 min-w-0 flex-1 flex-col bg-muted/30 max-lg:min-h-96">
        <div class="min-h-0 flex-1">
          <StudioStage
            v-if="viewMode === 'front'"
            :scene="scene"
            :images="nookImages.images.value"
            :aspects="nookImages.aspects.value"
            :ready="nookImages.ready.value"
            :screen="screen"
            :t="clock.t.value"
            :selection="selection"
            :hidden="hidden"
            @select="selection = $event"
            @op="run"
            @grab="onGrab"
          />
          <StudioSideView
            v-else
            :scene="scene"
            :selection="selection"
            :aspects="nookImages.aspects.value"
            :screen="screen"
            @select="selection = $event"
            @op="run"
            @breathe="run({ op: 'breathing', breathing: 'gentle' })"
          />
        </div>
        <p v-if="nookImages.failed.value.length > 0" class="px-4 pb-2 text-body text-destructive" role="alert">
          {{ nookImages.failed.value.length === 1 ? "A picture" : `${nookImages.failed.value.length} pictures` }} could not be loaded.
          Reload the page to try again.
        </p>
        <div class="flex flex-col gap-3 border-t border-border bg-card px-4 py-3">
          <StudioFramingNotice :issues="issues" :names="layerNames" :screen="screenWord" :can-gentler="canGentler" @gentler="breatheGentler" />
          <StudioLoopBar
            :t="clock.t.value"
            :loop="scene.loop"
            @seek="clock.seek"
            @scrub="(held) => (held ? clock.hold() : clock.release())"
            @update:loop="(seconds) => run({ op: 'loop', seconds })"
          />
          <StudioSettingsBar
            :camera="scene.camera"
            :grade="scene.grade"
            :frame="scene.frame"
            @breathing="(breathing) => run({ op: 'breathing', breathing })"
            @mood="(mood) => run({ op: 'mood', mood })"
            @frame="(frame) => run({ op: 'frame', frame: frame && { style: frame.style, name: frame.name, fit: frame.fit, tall: frame.tall, wide: frame.wide } })"
          />
          <StudioSoundRow :nook-id="nookId" />
        </div>
      </main>

      <aside class="w-84 shrink-0 overflow-y-auto border-l border-border bg-card max-lg:w-full max-lg:border-l-0 max-lg:border-t" aria-label="Inspector">
        <StudioInspector
          :target="selection"
          :scene="scene"
          :aspects="nookImages.aspects.value"
          :apply="run"
          @side-view="viewMode = 'side'"
          @replace-room="pickRoom"
        />
        <input ref="roomInput" type="file" accept="image/png,image/webp,image/jpeg" class="sr-only" tabindex="-1" aria-hidden="true" @change="replaceRoomFrom" />
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The Book Nook studio (#1142, frame 03), full screen at `/book-nook/:id` like Edit map: the room's layers on
 * the left, the stage in the middle, the selected thing on the right. It saves itself; Done returns to where
 * it was opened from.
 */
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import AutosaveStatus from "@/components/common/feedback/AutosaveStatus.vue";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import LoadingSpinner from "@/components/common/feedback/LoadingSpinner.vue";
import StudioFramingNotice from "@/components/bookNook/studio/StudioFramingNotice.vue";
import StudioInspector from "@/components/bookNook/studio/StudioInspector.vue";
import StudioLayers from "@/components/bookNook/studio/StudioLayers.vue";
import StudioLoopBar from "@/components/bookNook/studio/StudioLoopBar.vue";
import StudioSettingsBar from "@/components/bookNook/studio/StudioSettingsBar.vue";
import StudioSoundRow from "@/components/bookNook/studio/StudioSoundRow.vue";
import StudioSideView from "@/components/bookNook/studio/StudioSideView.vue";
import StudioStage from "@/components/bookNook/studio/StudioStage.vue";
import { useBookNook } from "@/composables/bookNook/useBookNooks";
import { useNookDraft } from "@/composables/bookNook/useNookDraft";
import { useNookImages } from "@/composables/bookNook/useNookImages";
import { useStudioClock } from "@/composables/bookNook/useStudioClock";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import { addTouchPlaced, gentler, targetKey, type StudioOp, type Target } from "@/lib/bookNook/edit";
import { replaceRoom } from "@/lib/bookNook/editRoom";
import { PICTURE_ID } from "@/lib/bookNook/edit";
import { layersOf } from "@/lib/bookNook/scene";
import { removeNookImages, uploadNookImage } from "@/lib/bookNook/upload";
import { supabase } from "@/lib/supabase";
import { isOrphanedOwnNookFile } from "./replacedNookFile";
import { composeStill } from "@/lib/bookNook/still";
import { giveStillToPlace } from "@/composables/bookNook/useShowNookAtPlace";
import { useAuthStore } from "@/stores/auth";
import { checkWindow, windowFor } from "@/lib/bookNook/framing";
import type { TouchKind } from "@/lib/bookNook/presets";
import { STUDIO_SCREENS, screenOf, type StudioScreen } from "@/lib/bookNook/stageGeometry";
import { IconChevronLeft, IconPause, IconPlay } from "@/lib/icons";
import { useAppUiStore } from "@/stores/ui/app";

const route = useRoute();
const router = useRouter();
const toast = useToast();
const { confirm } = useConfirm();

const nookId = computed(() => (typeof route.params.id === "string" ? route.params.id : ""));

const appUi = useAppUiStore();
appUi.editorFocus = true;
onBeforeUnmount(() => { appUi.editorFocus = false; });

const draft = useNookDraft(nookId);
const savedNook = useBookNook(nookId);
const loading = draft.loading;
const scene = computed(() => draft.draft.scene);
const layerNames = computed(() => {
  const current = scene.value;
  return new Map(current ? layersOf(current).flatMap((layer) => (layer.name ? [[layer.id, layer.name] as const] : [])) : []);
});

// "Replace the room…" in the picture's inspector: a new painting of the same room, same shape, so every cut-out
// stays where it stands. A picture of another shape would move them all, so it is refused with the reason.
const auth = useAuthStore();
const roomInput = ref<HTMLInputElement | null>(null);
function pickRoom() {
  roomInput.value?.click();
}
async function replaceRoomFrom(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  const user = auth.user;
  const room = scene.value;
  if (!file || !user || !room) return;
  try {
    const bitmap = await createImageBitmap(file);
    const shape = bitmap.width / bitmap.height;
    bitmap.close();
    const current = room.size.width / room.size.height;
    if (Math.abs(shape - current) / current > 0.02) {
      toast.error("That picture is a different shape from this room, so every cut-out would move. Use one the same shape.");
      return;
    }
    const url = await uploadNookImage(file, nookId.value, user.id);
    const oldUrl = layersOf(room).find((l) => l.id === PICTURE_ID)?.src;
    draft.update((latest) => replaceRoom(latest, url));
    await removeIfReplaced(oldUrl);
  } catch (e) {
    toast.error(toast.fromError(e));
  }
}

/**
 * A replaced file is deleted only when it is this nook's own and nothing uses it any more; a failure is logged and
 * never blocks the DM, because a stray file costs nothing and a stuck editor does.
 */
async function removeIfReplaced(oldUrl: string | null | undefined, extraGuard?: () => Promise<boolean>) {
  try {
    if (!isOrphanedOwnNookFile(oldUrl, nookId.value, scene.value)) return;
    if (extraGuard && !(await extraGuard())) return;
    await removeNookImages([oldUrl]);
  } catch (e) {
    console.warn("[Book Nook] could not remove a replaced file:", e);
  }
}

const nookImages = useNookImages(scene);
const clock = useStudioClock(() => scene.value?.loop ?? 12);

// ── What the studio shows ─────────────────────────────────────────────────────────────────────────────────────
const VIEW_OPTIONS = [
  { value: "front", label: "Front" },
  { value: "side", label: "Side" },
] as const;
const SCREEN_OPTIONS = STUDIO_SCREENS.map((s) => ({ value: s.id, label: s.label }));
const viewMode = ref<"front" | "side">("front");
const screen = ref<StudioScreen>("tv");
const screenWord = computed(() => (screen.value === "phone" ? "phone" : screenOf(screen.value).label));

const selection = ref<Target | null>(null);
/** Studio-only hiding (`layerKey` / `effectKey`): never saved. */
const hidden = ref<ReadonlySet<string>>(new Set());
function toggleHidden(key: string) {
  const next = new Set(hidden.value);
  if (!next.delete(key)) next.add(key);
  hidden.value = next;
}

// ── Edits ─────────────────────────────────────────────────────────────────────────────────────────────────────
function run(op: StudioOp) {
  try {
    draft.apply(op);
  } catch (e) {
    toast.error(toast.fromError(e));
    return;
  }
  // A removed thing must not stay selected, nor its hidden mark linger on whatever takes its place in the stack.
  if (op.op === "remove") {
    if (selection.value && targetKey(selection.value) === targetKey(op.target)) selection.value = null;
    hidden.value = new Set([...hidden.value].filter((k) => k !== targetKey(op.target) && !k.startsWith("fx:")));
  }
}

function onGrab(held: boolean) {
  if (held) clock.hold();
  else clock.release();
}

function addTouchAtCentre(kind: TouchKind) {
  let index = -1;
  draft.update((s) => {
    const placed = addTouchPlaced(s, kind, { x: s.size.width / 2, y: s.size.height / 2 });
    index = placed.index;
    return placed.scene;
  });
  if (index >= 0) selection.value = { kind: "effect", index };
}

// ── Framing ───────────────────────────────────────────────────────────────────────────────────────────────────
const issues = computed(() => {
  const s = scene.value;
  if (!s || !nookImages.ready.value) return [];
  const info = screenOf(screen.value);
  return checkWindow(s, nookImages.sizes.value, nookImages.cut.value, windowFor(s, info.window), { tilt: info.tilt });
});
const canGentler = computed(() => (scene.value ? gentler(scene.value.camera) !== null : false));
function breatheGentler() {
  const s = scene.value;
  const next = s ? gentler(s.camera) : null;
  if (next) run({ op: "breathing", breathing: next });
}

// ── Leaving ───────────────────────────────────────────────────────────────────────────────────────────────────
/** Inside the app, Done goes back to where the studio was opened from; opened cold, to the nook list. */
const cameFromApp = typeof window !== "undefined" && typeof window.history.state?.back === "string";
const backLabel = cameFromApp ? "Back" : "Book Nook";
function leave() {
  if (cameFromApp) router.back();
  else void router.push("/book-nook");
}

async function reload() {
  const ok = await confirm("Take the copy that was saved elsewhere? What you changed here since is lost.", {
    title: "Reload this nook",
    confirmLabel: "Reload",
  });
  if (!ok) return;
  try {
    await draft.reload();
  } catch (e) {
    toast.error(toast.fromError(e));
  }
}

// The still (the first frame, every cut-out in place) is redrawn when the DM leaves, if the room changed while
// they were here: lists, cards, reduce-motion and the place's picture show it, never the scene itself.
const changedThisVisit = ref(false);
watch(
  () => (draft.ready.value ? JSON.stringify(scene.value) : null),
  (now, before) => {
    if (now !== null && before !== null && before !== undefined && now !== before) changedThisVisit.value = true;
  },
);
async function writeStill() {
  const current = scene.value;
  const user = auth.user;
  if (!changedThisVisit.value || !current || !user || !nookImages.ready.value) return;
  try {
    const blob = await composeStill(current, nookImages.images.value);
    const oldStill = savedNook.data.value?.still_url;
    const url = await uploadNookImage(blob, nookId.value, user.id);
    await draft.setStill(url);
    await giveStillToPlace(nookId.value, url);
    changedThisVisit.value = false;
    // A place the nook was taken off keeps the old still as its own picture, so that file is not ours to remove.
    await removeIfReplaced(oldStill, async () => {
      const { data, error } = await supabase.from("locations").select("id").eq("image_url", oldStill!).limit(1);
      if (error) throw error;
      return data.length === 0;
    });
  } catch (e) {
    // The scene is saved; only its still is behind. Say so and let the DM go.
    toast.error(`The nook is saved, but its still picture could not be updated: ${toast.fromError(e)}`);
  }
}

// Work the page has already put away must be sent before the route goes. A stale draft cannot be sent, so
// leaving it asks first.
onBeforeRouteLeave(async () => {
  if (draft.stale.value) {
    return confirm("This nook was saved somewhere else, so your latest changes here were not saved. Leave anyway?", {
      title: "Unsaved changes",
      confirmLabel: "Leave",
    });
  }
  await draft.flush();
  await writeStill();
  return true;
});
</script>
