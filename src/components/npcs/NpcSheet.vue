<template>
  <div class="flex flex-col gap-6 lg:flex-row lg:gap-6 lg:h-[calc(100dvh-7.5rem)] lg:overflow-hidden">
    <!-- Col 1 / top: portrait + badges, never scrolls on desktop -->
    <div class="flex flex-col gap-3 lg:w-52 lg:shrink-0 lg:pb-6">
      <FocalImage
        :src="displayPortrait"
        :focal-point="displayFocalPoint"
        format="portrait"
        :lightbox="true"
        placeholder="/assets/placeholders/npc.webp"
        class="w-full rounded-lg overflow-hidden max-h-80 lg:max-h-none lg:flex-1 lg:min-h-0"
      />
      <div class="flex flex-wrap gap-1">
        <span class="text-label bg-muted text-muted-foreground rounded px-2 py-0.5 capitalize">{{ npc.status }}</span>
        <span class="text-label bg-muted text-muted-foreground rounded px-2 py-0.5 capitalize">{{ npc.relationship }}</span>
      </div>
      <div v-if="npc.tags?.length" class="flex flex-wrap gap-1">
        <span v-for="tag in npc.tags" :key="tag" class="text-label bg-muted/60 text-muted-foreground rounded px-2 py-0.5">{{ tag }}</span>
      </div>

      <!-- Factions -->
      <div v-if="npcFactions?.length" class="pt-1 border-t border-border/50">
        <p class="font-cinzel text-2xs tracking-widest text-muted-foreground mb-1.5">FACTIONS</p>
        <div class="flex flex-wrap gap-1">
          <RouterLink
            v-for="row in npcFactions"
            :key="row.faction.id"
            :to="`/factions/${row.faction.id}`"
            class="font-cinzel text-2xs px-2 py-0.5 rounded bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
          >
            {{ row.faction.name }}
          </RouterLink>
        </div>
      </div>

      <!-- Alter ego reveal control (DM only — always visible in the sheet) -->
      <div v-if="hasDisguise" class="pt-1 border-t border-border/50">
        <p class="font-cinzel text-2xs tracking-widest text-muted-foreground mb-1.5">ALTER EGO</p>
        <div class="flex flex-col gap-1.5">
          <p class="text-caption text-muted-foreground italic">
            {{ npc.is_revealed ? `True form revealed` : `Disguised as ${npc.disguise_name || 'unknown'}` }}
          </p>
          <button
            type="button"
            :disabled="isToggling"
            class="w-full py-1 text-label font-semibold rounded border transition-colors disabled:opacity-50"
            :class="npc.is_revealed
              ? 'border-border text-muted-foreground hover:border-foreground/40'
              : 'border-amber-500/50 text-amber-500 bg-amber-500/10 hover:bg-amber-500/20'"
            @click="toggleReveal"
          >
            {{ isToggling ? '…' : (npc.is_revealed ? '◈ Conceal' : '✦ Reveal') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Col 2 / below: tabs + content, scrolls on desktop -->
    <div class="flex-1 min-w-0 lg:overflow-y-auto lg:pb-6">
      <NpcTabContent :npc="npc" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import FocalImage from "@/components/common/FocalImage.vue";
import NpcTabContent from "@/components/npcs/NpcTabContent.vue";
import { useUpdateNpc } from "@/composables/useNpcs";
import { useNpcFactions } from "@/composables/useFactions";
import { getNpcDisplayPortrait, getNpcDisplayFocalPoint } from "@/lib/npcDisplay";
import { useUiStore } from "@/stores/ui";
import { useCampaignMessages } from "@/composables/useCampaignMessages";
import type { Npc } from "@/types/npc.types";

const props = defineProps<{ npc: Npc }>();

const { data: npcFactions } = useNpcFactions(props.npc.id);

const hasDisguise = computed(() =>
  !!(props.npc.disguise_name || props.npc.disguise_portrait_url)
);

const displayPortrait = computed(() => getNpcDisplayPortrait(props.npc));
const displayFocalPoint = computed(() => getNpcDisplayFocalPoint(props.npc));

// Quick reveal/conceal toggle — saves immediately without opening edit mode
const { mutateAsync: updateNpc } = useUpdateNpc();
const isToggling = ref(false);
const ui = useUiStore();
const { sendNarrativeEvent } = useCampaignMessages();

async function toggleReveal() {
  if (isToggling.value) return;
  isToggling.value = true;
  const revealing = !props.npc.is_revealed;
  try {
    await updateNpc({ id: props.npc.id, update: { is_revealed: revealing } });
    // Announce reveal to players in play mode (fire-and-forget)
    if (revealing && ui.dmMode === "play") {
      const disguise = props.npc.disguise_name?.trim();
      const msg = disguise
        ? `${disguise} is revealed to be ${props.npc.name}.`
        : `${props.npc.name} has been revealed.`;
      void sendNarrativeEvent(msg, props.npc.id);
    }
  } finally {
    isToggling.value = false;
  }
}
</script>
