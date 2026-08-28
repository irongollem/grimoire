<template>
  <!--
    One region for "something is running", instead of three pills competing for
    the same corner.

    The sidebar's brand row carried a dice roller, an AI spinner and a green
    Live pill side by side, with the soundboard's count badge in the top bar as
    a fourth — each invented separately, none aware of the others. They are not
    peers: combat, open chains and audio all run *inside* a session. So the
    session is the container and the rest are rows within it, which is also why
    a session indicator does not compete with the encounter one. See #758.

    The dice roller stays where it was: it is a tool the DM reaches for, not a
    thing that is running.
  -->
  <div class="space-y-1.5">
    <SessionControl :size="size" />

    <ul v-if="rows.length" class="space-y-1">
      <li v-for="row in rows" :key="row.key" class="flex items-center gap-1.5 ps-2">
        <span class="text-primary/50" aria-hidden="true">└</span>
        <component
          :is="row.to ? RouterLink : 'span'"
          :to="row.to"
          class="flex min-w-0 flex-1 items-center gap-1.5 text-caption text-muted-foreground"
          :class="row.to ? 'hover:text-foreground transition-colors' : ''"
        >
          <component :is="row.icon" class="h-3 w-3 shrink-0" :class="row.spin ? 'animate-spin' : ''" aria-hidden="true" />
          <span class="truncate">{{ row.label }}</span>
        </component>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { IconEncounter, IconLoading, IconNavQuests, IconNavSoundboard } from "@/lib/icons";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import { useRunningEncounters } from "@/composables/encounters/useEncounterLive";
import { useCampaignSession } from "@/composables/campaign/useCampaignSession";
import { useCampaignLiveQuests } from "@/composables/quests/useQuestFlow";
import { useSoundboardStore } from "@/stores/soundboard";
import { useSpotifyStore } from "@/stores/spotify";
import SessionControl from "./SessionControl.vue";

const { size = "sm" } = defineProps<{ size?: "sm" | "md" }>();

const { isRunning } = useCampaignSession();
const { anyRunning, firstRunning } = useRunningEncounters();
const { data: liveQuests } = useCampaignLiveQuests();
const soundboard = useSoundboardStore();
const spotify = useSpotifyStore();

const audioCount = computed(
  () => soundboard.activeAudioCount + (spotify.isConnected && spotify.isPlaying ? 1 : 0),
);

/** Chains the party is actually walking. A paused chain is a prep concern, not
 *  a thing happening at the table, so it belongs on the prep dashboard rather
 *  than in the chrome. */
const runningChains = computed(
  () => (liveQuests.value ?? []).filter((q) => q.runtime_status === "running").length,
);

interface Row {
  key: string;
  label: string;
  icon: unknown;
  to?: string;
  spin?: boolean;
}

/**
 * Ranked by how much of the DM's attention the thing deserves: combat is the
 * innermost live thing, then narrative position, then the room's audio, then a
 * draft being written somewhere off-screen.
 */
const rows = computed<Row[]>(() => {
  // Nothing nests under a session that isn't running — except a running
  // encounter, which can outlive one on rows that predate `session_id`.
  if (!isRunning.value && !anyRunning.value) return [];
  const out: Row[] = [];
  if (anyRunning.value && firstRunning.value) {
    out.push({
      key: "encounter",
      label: `Combat · round ${firstRunning.value.current_round}`,
      icon: IconEncounter,
      to: `/encounters/${firstRunning.value.encounter_id}/run`,
    });
  }
  if (runningChains.value) {
    out.push({
      key: "chains",
      label: `${runningChains.value} quest${runningChains.value === 1 ? "" : "s"} in play`,
      icon: IconNavQuests,
      to: "/quests",
    });
  }
  if (audioCount.value) {
    out.push({
      key: "audio",
      label: `${audioCount.value} sound${audioCount.value === 1 ? "" : "s"} playing`,
      icon: IconNavSoundboard,
      to: "/soundboard",
    });
  }
  if (isAnyAiGenerating.value) {
    out.push({ key: "ai", label: "Writing a draft", icon: IconLoading, spin: true });
  }
  return out;
});
</script>
