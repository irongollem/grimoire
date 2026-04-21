<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="member"
        class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
        @click.self="$emit('close')"
      >
        <div class="bg-card rounded-xl border border-border w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
          <div class="relative shrink-0">
            <div v-if="member.portrait_url" class="w-full h-72 overflow-hidden">
              <FocalImage
                :src="member.portrait_url"
                :alt="member.name"
                format="portrait"
                :focal-point="member.portrait_focal_point ?? null"
              />
            </div>
            <button
              class="absolute top-2 right-2 bg-black/50 rounded-full p-1 text-white hover:bg-black/70 transition-colors"
              @click="$emit('close')"
            >
              <X class="h-4 w-4" />
            </button>
            <span
              v-if="member.id === auth.linkedPartyMemberId"
              class="absolute top-2 left-2 font-cinzel text-[10px] px-1.5 py-0.5 rounded bg-primary text-primary-foreground tracking-wider"
            >You</span>
          </div>
          <div class="p-4 overflow-y-auto space-y-4">
            <div>
              <h2 class="font-cinzel text-lg font-bold text-foreground">{{ member.name }}</h2>
              <p class="font-fell text-sm text-muted-foreground italic">
                {{ [getDisplayRace(member, speciesNameMap.get(member.species_id ?? '') ?? null, viewerMemberId), member.class].filter(Boolean).join(' ') }}
                <span v-if="member.level" class="font-cinzel not-italic text-primary ml-1">Lv{{ member.level }}</span>
              </p>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div class="rounded-md bg-muted p-2.5">
                <div class="flex items-center justify-between mb-1">
                  <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider">HP</span>
                  <span class="font-cinzel text-sm font-bold" :class="hpColor">
                    {{ member.current_hp }} / {{ member.max_hp }}
                  </span>
                </div>
                <div class="h-1.5 rounded-full bg-background overflow-hidden">
                  <div class="h-full rounded-full transition-all" :class="hpBarColor"
                    :style="{ width: `${hpPct}%` }" />
                </div>
              </div>
              <div class="rounded-md bg-muted p-2.5 flex items-center gap-2">
                <Shield class="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p class="font-cinzel text-[10px] text-muted-foreground tracking-wider">AC</p>
                  <p class="font-cinzel text-sm font-bold text-foreground">{{ member.ac }}</p>
                </div>
              </div>
            </div>
            <div v-if="member.conditions?.length" class="flex flex-wrap gap-1.5">
              <span v-for="cond in member.conditions" :key="cond"
                class="font-cinzel text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive tracking-wider">{{ cond }}</span>
            </div>
            <!-- Species detail — shows true or disguise species depending on viewer -->
            <div v-if="displaySpecies" class="space-y-3 border-t border-border pt-3">
              <div v-if="displaySpecies.image_url" class="rounded-md overflow-hidden">
                <FocalImage
                  :src="displaySpecies.image_url"
                  :alt="displaySpecies.name"
                  format="landscape"
                  :focal-point="displaySpecies.focal_point ?? null"
                />
              </div>
              <h3 class="font-cinzel text-sm font-bold text-foreground">{{ displaySpecies.name }}</h3>
              <div class="flex flex-wrap gap-3 font-fell text-xs text-muted-foreground italic">
                <span v-if="displaySpecies.size">Size: {{ displaySpecies.size }}</span>
                <span v-if="displaySpecies.speed?.walk">Speed: {{ displaySpecies.speed.walk }} ft.</span>
                <span v-if="displaySpecies.languages?.length">Languages: {{ displaySpecies.languages.join(', ') }}</span>
              </div>
              <RichTextViewer v-if="displaySpecies.description" :content="displaySpecies.description" />
              <div v-if="displaySpecies.traits?.length" class="space-y-2">
                <div v-for="trait in displaySpecies.traits" :key="trait.name">
                  <p class="font-cinzel text-xs font-semibold text-foreground">{{ trait.name }}</p>
                  <RichTextViewer :content="trait.description" class="font-fell text-xs text-muted-foreground" />
                </div>
              </div>
            </div>

            <PlayerNotesWidget entity-type="party_member" :entity-id="member.id" placeholder="Your thoughts on this party member…" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { X, Shield } from "lucide-vue-next";
import FocalImage from "@/components/common/FocalImage.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import PlayerNotesWidget from "@/components/common/PlayerNotesWidget.vue";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import { useSpecies, useSpeciesNameMap } from "@/composables/useSpecies";
import { getDisplayRace, getDisplaySpeciesId } from "@/lib/partyMemberDisplay";
import type { PartyMember } from "@/types/party.types";

const props = defineProps<{ member: PartyMember | null }>();
defineEmits<{ close: [] }>();

const auth = useAuthStore();
const ui = useUiStore();
const speciesNameMap = useSpeciesNameMap();

const viewerMemberId = computed(() =>
  ui.dmPreviewMode ? ui.dmPreviewPartyMemberId : auth.linkedPartyMemberId ?? null,
);

const displaySpeciesId = computed(() =>
  props.member ? (getDisplaySpeciesId(props.member, viewerMemberId.value) ?? "") : "",
);
const { data: displaySpecies } = useSpecies(displaySpeciesId);

const hpPct = computed(() => {
  if (!props.member || props.member.max_hp === 0) return 0;
  return Math.max(0, Math.min(100, (props.member.current_hp / props.member.max_hp) * 100));
});
const hpColor = computed(() => {
  const p = hpPct.value;
  if (p <= 0 || p < 33) return "text-destructive";
  if (p < 66) return "text-amber-400";
  return "text-elven-green";
});
const hpBarColor = computed(() => {
  const p = hpPct.value;
  if (p <= 0) return "bg-muted-foreground/40";
  if (p < 33) return "bg-destructive";
  if (p < 66) return "bg-amber-500";
  return "bg-elven-green";
});
</script>
