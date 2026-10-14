<template>
  <div
    v-if="hasMinded"
    role="radiogroup"
    aria-label="Character you are playing"
    class="flex shrink-0 items-center pl-3"
    @keydown="onKeydown"
  >
    <div
      v-for="entry in characters"
      :key="entry.member.id"
      :ref="(el) => setToken(entry.member.id, el)"
      class="relative -ml-3"
      :class="entry.member.id === activeId ? 'z-10' : 'z-0'"
    >
      <AppButton
        role="radio"
        :aria-checked="entry.member.id === activeId"
        :tabindex="entry.member.id === activeId ? 0 : -1"
        variant="ghost"
        size="inline"
        shape="pill"
        :disabled="switching && switchingId !== entry.member.id"
        :aria-label="labelFor(entry)"
        :title="`${slipFor(entry)} (${comboLabel})`"
        class="relative block p-0 ring-2 ring-offset-1 ring-offset-card focus-visible:ring-primary"
        :class="entry.member.id === activeId
          ? 'h-9 w-9 ring-primary'
          : 'h-7 w-7 ring-border grayscale max-md:h-9 max-md:w-9'"
        @click="switchTo(entry.member.id)"
      >
        <template #icon>
          <span class="relative block h-full w-full overflow-hidden rounded-full bg-muted">
            <FocalImage
              :src="entry.member.portrait_url"
              :alt="entry.member.name"
              format="token"
              :focal-point="entry.member.portrait_focal_point ?? null"
              :placeholder="placeholderUrl('character')"
            />
            <span
              v-if="switchingId === entry.member.id"
              class="absolute inset-0 grid place-items-center bg-background/70"
            >
              <BannerLoader class="h-3/5" />
            </span>
          </span>
        </template>
      </AppButton>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Look after my character (#1059): small round portraits in the player header,
 * the character being played ringed and in colour, the others in greyscale. It
 * shows only for someone minding a character, who usually still plays their
 * own. One tap switches; the hotkey cycles to the next. The name and the
 * hotkey show in the app's one tooltip (`lib/tooltip.ts`), through `title`.
 */
import { computed, nextTick, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import FocalImage from "@/components/common/media/FocalImage.vue";
import BannerLoader from "@/components/brand/BannerLoader.vue";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";
import { formatCombo, isMacPlatform } from "@/lib/hotkeys";
import { useHotkeys } from "@/composables/useHotkeys";
import { usePlayableCharacters, type PlayableCharacter } from "@/composables/party/usePlayableCharacters";
import { nextPlayableId } from "@/lib/player/playableCharacters";
import { canAnimate } from "@/lib/motion";

const COMBO = "mod+shift+u";

const { characters, activeId, hasMinded, switchTo, switching, switchingId } = usePlayableCharacters();

const comboLabel = formatCombo(COMBO, isMacPlatform());

function labelFor(entry: PlayableCharacter): string {
  return entry.kind === "minding"
    ? `${entry.member.name}, looked after for ${entry.ownerName ?? "their player"}`
    : entry.member.name;
}

function slipFor(entry: PlayableCharacter): string {
  return entry.kind === "minding" ? `${entry.member.name}, ${entry.ownerName ?? "their player"}'s character` : entry.member.name;
}

const tokens = new Map<string, HTMLElement>();
function setToken(id: string, el: unknown) {
  if (el instanceof HTMLElement) tokens.set(id, el);
  else tokens.delete(id);
}

// The one moment of motion: the token that comes forward settles into place.
watch(activeId, async (id, previous) => {
  if (!id || previous === undefined) return;
  await nextTick();
  const el = tokens.get(id);
  if (!el || !canAnimate(el)) return;
  el.animate(
    [{ transform: "translateX(-0.5rem) scale(0.8)" }, { transform: "translateX(0) scale(1)" }],
    { duration: 260, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
  );
});

function onKeydown(event: KeyboardEvent) {
  const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
  if (step === 0) return;
  event.preventDefault();
  const ids = characters.value.map(c => c.member.id);
  const at = activeId.value === null ? -1 : ids.indexOf(activeId.value);
  const target = ids[(at + step + ids.length) % ids.length];
  void switchTo(target);
  void nextTick(() => tokens.get(target)?.querySelector<HTMLElement>("[role=radio]")?.focus());
}

useHotkeys(
  computed(() => [
    {
      combo: COMBO,
      description: "Switch to the next character you are playing",
      handler: () => {
        const next = nextPlayableId(characters.value.map(c => c.member.id), activeId.value);
        if (next) void switchTo(next);
      },
    },
  ]),
  { layer: "global", enabled: () => hasMinded.value && characters.value.length > 1 },
);
</script>
