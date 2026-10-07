<template>
  <Teleport to="body">
    <!--
      `:css="false"` for the same reason as the soundboard widget: the flight is
      measured from wherever the toggle button was, which no static class knows.
    -->
    <Transition :css="false" @enter="onEnter" @leave="onLeave">
      <aside
        v-if="visible"
        ref="panelEl"
        aria-label="DM scratchpad"
        data-test="dm-scratchpad"
        data-scratchpad
        class="fixed inset-x-0 bottom-0 z-40 md:z-250 flex h-[min(70dvh,34rem)] flex-col overflow-hidden rounded-t-2xl border-t border-border bg-card pb-[env(safe-area-inset-bottom)] shadow-2xl barnav:bottom-[calc(4rem+env(safe-area-inset-bottom))] barnav:pb-0 md:inset-x-auto md:right-0 md:bottom-0 md:top-0 md:h-auto md:w-[23rem] md:rounded-none md:border-t-0 md:border-l md:pb-0 md:barnav:top-[3.75rem] md:barnav:bottom-[calc(4.5rem+env(safe-area-inset-bottom))]"
      >
        <header class="flex items-start gap-2 border-b border-border bg-muted/20 px-3 py-2.5">
          <div class="min-w-0 flex-1">
            <template v-if="store.shown">
              <p class="text-caption text-muted-foreground" data-test="kind">
                {{ dmNoteEntry(store.shown.type).label }}<span v-if="pinnedNow" class="text-gold-400">, pinned</span>
              </p>
              <h2 class="truncate font-heading text-heading font-semibold text-foreground" data-test="title">
                {{ store.shown.label }}
              </h2>
            </template>
            <h2 v-else class="text-heading font-semibold text-foreground">DM notes</h2>
          </div>
          <AppButton
            v-if="store.shown"
            variant="ghost"
            size="icon-xs"
            :icon="IconPin"
            :active="pinnedNow"
            :aria-label="pinnedNow ? 'Pinned. Unpin this note' : 'Pin this note'"
            :tooltip="pinnedNow ? 'Pinned: unpin' : 'Pin: keep this note while you browse'"
            data-test="pin"
            @click="pinnedNow ? store.unpin() : store.pin()"
          />
          <AppButton
            variant="ghost"
            size="icon-xs"
            :icon="IconClose"
            aria-label="Close DM scratchpad"
            data-test="close"
            @click="store.toggle()"
          />
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto">
          <AppButton
            v-if="switchTarget"
            variant="subtle"
            size="sm"
            block
            class="m-3 w-auto"
            :label="`Switch to ${switchTarget.label}`"
            data-test="switch"
            @click="store.unpin()"
          />

          <div v-if="store.shown" class="p-3">
            <DmNoteBox
              :key="`${store.shown.type}:${store.shown.id}`"
              variant="panel"
              :type="store.shown.type"
              :id="store.shown.id"
              :label="store.shown.label"
            />
          </div>
          <p v-else class="px-6 py-8 text-center text-body text-muted-foreground" data-test="empty">
            Open an NPC, place, item… and its DM notes appear here.
          </p>

          <section v-if="label && touches.length > 0" class="border-t border-border" data-test="touched">
            <h3 class="px-3 pb-1 pt-3 text-label-lg font-semibold text-muted-foreground">{{ label }}</h3>
            <ul class="pb-2">
              <li v-for="touch in touches" :key="touch.id">
                <AppButton
                  v-if="dmNoteEntry(touch.entity_type).route(touch.entity_id)"
                  :to="dmNoteEntry(touch.entity_type).route(touch.entity_id) ?? undefined"
                  variant="menu"
                  size="body"
                  block
                  :active="isShown(touch)"
                  class="px-3"
                  data-test="touch"
                >
                  <span class="flex w-full min-w-0 items-baseline gap-2">
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-body text-foreground">{{ touch.entity_label }}</span>
                      <span class="block text-caption text-muted-foreground">
                        {{ isShown(touch) ? "Showing now" : dmNoteEntry(touch.entity_type).label }}
                      </span>
                    </span>
                    <span class="shrink-0 text-caption-sm text-muted-foreground/70">{{ timeAgo(touch.touched_at) }}</span>
                  </span>
                </AppButton>
              </li>
            </ul>
          </section>
        </div>
      </aside>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, ref, watchEffect } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import { useDmNoteTouches } from "@/composables/notes/useDmNoteTouches";
import { useAbove } from "@/composables/useBreakpoint";
import { useHotkeys } from "@/composables/useHotkeys";
import { dmNoteEntry } from "@/lib/dmNotes/registry";
import { IconClose, IconPin } from "@/lib/icons";
import { canAnimate, originTransform, REST_TRANSFORM, whenSettled } from "@/lib/motion";
import { timeAgo } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
import { useScratchpadStore } from "@/stores/scratchpad";
import type { DmNoteTouch } from "@/types/dmNote.types";

// The note box holds the rich text editor. The scratchpad is mounted by the DM layout on
// every page, so a static import put the whole editor (tiptap, about 140 kB gzip) on every
// DM's first load, whether or not the panel was ever opened (#999). It renders only once a
// note is shown, so this fetches the editor on first use.
const DmNoteBox = defineAsyncComponent(() => import("@/components/notes/DmNoteBox.vue"));

const store = useScratchpadStore();
const auth = useAuthStore();
const docked = useAbove("md");
const panelEl = ref<HTMLElement | null>(null);

// A player or a campaign-less session never sees the panel, even if the flag
// was left open when the active campaign changed.
const visible = computed(() => store.open && auth.isDM);

// The touches (and the session log that frames them) are read only while the
// panel is on screen: it is closed by default and mounted on every DM page (#999).
const { touches, label } = useDmNoteTouches(() => visible.value);

const pinnedNow = computed(() => store.pinned !== null);
/** Pinned, and the page has moved on to something else. */
const switchTarget = computed(() => {
  const pinned = store.pinned;
  const page = store.pageSubject;
  if (!pinned || !page) return null;
  return pinned.type === page.type && pinned.id === page.id ? null : page;
});

function isShown(touch: DmNoteTouch): boolean {
  const shown = store.shown;
  return shown !== null && shown.type === touch.entity_type && shown.id === touch.entity_id;
}

// Docked, the panel owns the right edge of the viewport: the layout and every
// full-width overlay end where it begins (base.css), which is what lets it sit
// above a modal without covering one. As a phone sheet it reserves nothing.
// The panel's own `md:w-[23rem]`: a literal there, because the variable is
// cleared the moment it closes, mid-way through its leave animation.
const dockWidth = "23rem";
watchEffect(() => {
  const root = document.documentElement;
  if (visible.value && docked.value) {
    root.dataset.scratchpadDock = "";
    root.style.setProperty("--dock-right", dockWidth);
  } else {
    delete root.dataset.scratchpadDock;
    root.style.removeProperty("--dock-right");
  }
});
onBeforeUnmount(() => {
  delete document.documentElement.dataset.scratchpadDock;
  document.documentElement.style.removeProperty("--dock-right");
});

// mod+; works from inside the editor so the panel that took the keyboard can
// give it back. Global layer, registered here because the open state is here.
useHotkeys(
  [
    {
      combo: "mod+;",
      description: "Open the DM scratchpad",
      allowInTextEntry: true,
      handler: () => {
        if (auth.isDM) store.toggle();
      },
    },
  ],
  { layer: "global" },
);

// Page layer, not overlay: overlay is a hard cutoff that would silence the
// sound palette and every other shortcut while a docked, non-modal panel is
// open. Not allowed in text entry, so Escape inside the editor still belongs
// to the editor (closing a link popover, say) and only closes the panel from
// outside it. A page's own Escape still wins: it registers later.
useHotkeys(
  [{ combo: "escape", description: "Close the DM scratchpad", hidden: true, handler: () => store.toggle() }],
  { layer: "page", enabled: visible },
);

// ── Open and close ────────────────────────────────────────────────────────────
// Flies from the toggle's rect like the soundboard widget. Without a recorded
// origin (the hotkey) it slides in from its own edge: right when docked, bottom
// as a phone sheet.

const ENTER_MS = 340;
const LEAVE_MS = 240;
const SLIDE_MS = 260;

function flight(el: Element): string | null {
  const origin = store.launchRect;
  if (!origin) return null;
  return originTransform(origin, el.getBoundingClientRect());
}

function slideFrom(): string {
  return docked.value ? "translateX(100%)" : "translateY(100%)";
}

function onEnter(el: Element, done: () => void) {
  if (!canAnimate(el)) {
    done();
    return;
  }
  const from = flight(el);
  whenSettled(
    (el as HTMLElement).animate(
      { transform: [from ?? slideFrom(), REST_TRANSFORM], opacity: [from ? 0.4 : 1, 1] },
      { duration: from ? ENTER_MS : SLIDE_MS, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    ),
    done,
  );
}

function onLeave(el: Element, done: () => void) {
  if (!canAnimate(el)) {
    done();
    return;
  }
  const to = flight(el);
  whenSettled(
    (el as HTMLElement).animate(
      { transform: [REST_TRANSFORM, to ?? slideFrom()], opacity: [1, to ? 0 : 1] },
      { duration: to ? LEAVE_MS : SLIDE_MS, easing: "ease-in" },
    ),
    done,
  );
}
</script>
