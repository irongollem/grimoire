<template>
  <div class="flex min-w-0 flex-1 items-center gap-1.5">
    <!-- `@focusout`, not `@blur`: `ThemeInput`'s template root is the wrapping
         `<div>`, not its inner `<input>`, so a fallthrough `blur` listener
         (which does not bubble) would attach to a element that never receives
         it. `focusout` bubbles, so clicking away from the real input still
         reaches this listener — the same click-away-to-save `AppInput`'s own
         `@blur` gives the rename field a few lines up in `SiteRoomsPanel`. -->
    <ThemeInput
      v-if="editing"
      v-model="draft"
      :suggestions="themeOptions"
      placeholder="dungeon, tavern, storm… (blank inherits)"
      class="w-full max-w-48"
      @keydown.enter="save"
      @keydown.escape="cancelEdit"
      @focusout="save"
    />
    <template v-else>
      <component
        :is="silent ? IconMute : IconWind"
        class="h-3 w-3 shrink-0 text-muted-foreground/50"
      />
      <span class="shrink-0 truncate text-caption-sm text-muted-foreground">{{ prefix }}</span>
      <span
        v-if="chipValue"
        class="truncate rounded px-1.5 py-0.5 text-caption-sm"
        :class="chipClass"
      >{{ chipValue }}</span>
      <AppButton
        v-if="resolved.kind !== 'own' && resolved.kind !== 'silence'"
        variant="ghost"
        size="inline-xs"
        label="Set…"
        class="shrink-0"
        @click="startEditing"
      />
      <AppButton
        v-else
        variant="ghost"
        size="icon-xs"
        :icon="IconEdit"
        tooltip="Edit ambience"
        class="shrink-0"
        @click="startEditing"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * One row's worth of the Ambience column (#868, story S7, frame "14 Room
 * audio"): what a location's ambient theme resolves to, plus the inline
 * control that edits *its own* `audio_theme` column — never the resolved
 * value, which for "Inherits" and inherited "silence" belongs to an ancestor
 * several rooms up, and editing it here would silently detach the room from
 * that ancestor rather than override it as the DM intended.
 *
 * Split out of `SiteRoomsPanel` (rather than inlined per row) because the
 * same cell renders both the site-default row and every room row beneath it
 * — one component with a `locationId` prop beats two copies of this branching.
 */
import { ref, computed } from "vue";
import ThemeInput from "@/components/common/ThemeInput.vue";
import AppButton from "@/components/common/AppButton.vue";
import { IconEdit, IconMute, IconWind } from "@/lib/icons";
import type { ResolvedAmbience } from "@/lib/locations/ambience";

const props = defineProps<{
  locationId: string;
  /** This location's own raw `audio_theme` column value — null means "inheriting". */
  ownTheme: string | null;
  resolved: ResolvedAmbience;
  themeOptions: readonly string[];
}>();

const emit = defineEmits<{ save: [locationId: string, theme: string | null] }>();

const editing = ref(false);
const draft = ref<string | null>(props.ownTheme);

function startEditing(): void {
  draft.value = props.ownTheme;
  editing.value = true;
}

function save(): void {
  if (!editing.value) return; // blur firing after Enter already closed it
  editing.value = false;
  const trimmed = draft.value?.trim() ?? "";
  const next = trimmed === "" ? null : trimmed;
  if (next === props.ownTheme) return;
  emit("save", props.locationId, next);
}

function cancelEdit(): void {
  editing.value = false;
}

const silent = computed(() => props.resolved.kind === "silence" || props.resolved.kind === "silence-inherited");

// If/else rather than a switch: oxlint's `vue/return-in-computed-property`
// flags an exhaustive switch as a missing return even when every case does,
// the same false positive `lib/locations/tree.ts` documents on its own loop.
//
// "own" and "silence" are this location's own answer; every other kind
// (including "silence-inherited") reads from further up, hence "Inherits ·".
const prefix = computed(() => {
  if (props.resolved.kind === "own") return "Own theme →";
  if (props.resolved.kind === "silence") return "Deliberately silent →";
  if (props.resolved.kind === "inherited" || props.resolved.kind === "silence-inherited") return "Inherits ·";
  return "No ambience";
});

const chipValue = computed(() => (silent.value ? "silence" : props.resolved.theme));

const chipClass = computed(() => {
  if (silent.value) return "border border-dashed border-border text-muted-foreground italic";
  if (props.resolved.kind === "own") return "bg-primary/10 text-primary font-medium";
  return "bg-muted text-muted-foreground";
});
</script>
