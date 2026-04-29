<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="member"
        class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
        @click.self="$emit('close')"
      >
        <div class="relative bg-card rounded-xl border border-border w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
          <!-- Close -->
          <button
            class="absolute top-2 right-2 z-10 bg-black/50 rounded-full p-1 text-white hover:bg-black/70 transition-colors"
            @click="$emit('close')"
          >
            <X class="h-4 w-4" />
          </button>

          <!-- Body: single scrollable area, two columns on sm+ -->
          <div class="overflow-y-auto">
            <div class="flex flex-col sm:flex-row">

              <!-- Left column: portrait + identity + stats -->
              <div class="sm:w-56 shrink-0 sm:border-r border-border">
                <div v-if="member.portrait_url" class="w-full h-52 sm:h-auto sm:aspect-3/4 overflow-hidden">
                  <FocalImage
                    :src="member.portrait_url"
                    :alt="member.name"
                    format="portrait"
                    :focal-point="member.portrait_focal_point ?? null"
                    class="w-full h-full"
                  />
                </div>
                <div class="p-3 space-y-2">
                  <!-- You badge + name + class/level -->
                  <div>
                    <span
                      v-if="member.id === auth.linkedPartyMemberId"
                      class="font-cinzel text-[10px] px-1.5 py-0.5 rounded bg-primary text-primary-foreground tracking-wider mb-1 inline-block"
                    >You</span>
                    <h2 class="font-cinzel text-base font-bold text-foreground leading-tight">{{ member.name }}</h2>
                    <p class="font-fell text-sm text-muted-foreground italic">
                      {{ [getDisplayRace(member, speciesNameMap.get(member.species_id ?? '') ?? null, viewerMemberId, viewerIsDm), member.class].filter(Boolean).join(' ') }}
                      <span v-if="member.level" class="font-cinzel not-italic text-primary ml-1">Lv{{ member.level }}</span>
                    </p>
                  </div>

                  <!-- HP -->
                  <div class="rounded-md bg-muted p-2.5">
                    <template v-if="showNumericHp">
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
                    </template>
                    <template v-else>
                      <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider">HP</span>
                      <p class="font-fell text-sm italic" :class="hpColor">{{ hpLabel }}</p>
                    </template>
                  </div>

                  <!-- AC -->
                  <div class="rounded-md bg-muted p-2.5 flex items-center gap-2">
                    <Shield class="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <p class="font-cinzel text-[10px] text-muted-foreground tracking-wider">AC</p>
                      <p class="font-cinzel text-sm font-bold text-foreground">{{ member.ac }}</p>
                    </div>
                  </div>

                  <!-- Species chip — clickable -->
                  <div v-if="displaySpecies" class="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      class="px-2 py-0.5 rounded bg-muted border border-border font-cinzel text-[10px] text-foreground tracking-wider hover:bg-primary/10 hover:border-primary/40 transition-colors"
                      @click="speciesModalOpen = true"
                    >{{ displaySpecies.name }}</button>
                    <span v-if="displaySpecies.size" class="px-2 py-0.5 rounded bg-muted border border-border font-cinzel text-[10px] text-muted-foreground tracking-wider">
                      {{ displaySpecies.size }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- Right column: conditions + description + notes -->
              <div class="flex-1 p-4 space-y-4 border-t sm:border-t-0 border-border">
                <div v-if="member.conditions?.length" class="flex flex-wrap gap-1.5">
                  <span v-for="cond in member.conditions" :key="cond"
                    class="font-cinzel text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive tracking-wider">{{ cond }}</span>
                </div>

                <div v-if="member.player_description">
                  <p class="font-cinzel text-[10px] text-muted-foreground tracking-wider uppercase mb-1.5">About</p>
                  <RichTextViewer :content="member.player_description" />
                </div>

                <PlayerNotesWidget entity-type="party_member" :entity-id="member.id" placeholder="Your thoughts on this party member…" />
              </div>

            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Species detail modal (nested) -->
    <Transition name="fade">
      <div
        v-if="speciesModalOpen && displaySpecies"
        class="fixed inset-0 z-60 bg-black/70 flex items-center justify-center p-4"
        @click.self="speciesModalOpen = false"
      >
        <div class="bg-card rounded-xl border border-border w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
          <div class="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <h3 class="font-cinzel text-sm font-bold text-foreground">{{ displaySpecies.name }}</h3>
            <button type="button" class="text-muted-foreground hover:text-foreground" @click="speciesModalOpen = false">
              <X class="h-4 w-4" />
            </button>
          </div>
          <div class="overflow-y-auto p-4 space-y-4">
            <!-- Image + meta -->
            <div class="flex gap-3">
              <div v-if="displaySpecies.image_url" class="shrink-0 w-20 aspect-square rounded-md overflow-hidden bg-muted">
                <FocalImage
                  :src="displaySpecies.image_url"
                  :alt="displaySpecies.name"
                  format="portrait"
                  :focal-point="displaySpecies.focal_point ?? null"
                  class="w-full h-full"
                />
              </div>
              <div class="flex flex-col gap-1.5">
                <div class="flex flex-wrap gap-1">
                  <span v-if="displaySpecies.size" class="px-2 py-0.5 rounded bg-primary/10 text-primary font-cinzel text-[10px] tracking-wider">{{ capitalize(displaySpecies.size) }}</span>
                  <span v-if="displaySpecies.source" class="px-2 py-0.5 rounded bg-muted text-muted-foreground font-cinzel text-[10px] tracking-wider">{{ displaySpecies.source }}</span>
                </div>
                <div v-if="speedPills.length" class="flex flex-wrap gap-1">
                  <span v-for="pill in speedPills" :key="pill" class="px-2 py-0.5 rounded bg-muted text-muted-foreground font-cinzel text-[10px] tracking-wider">{{ pill }}</span>
                </div>
                <p v-if="asiText" class="font-fell text-sm text-muted-foreground">{{ asiText }}</p>
                <div v-if="displaySpecies.languages?.length" class="flex flex-wrap gap-1 items-center">
                  <span class="font-cinzel text-[10px] tracking-wider text-muted-foreground">Lang:</span>
                  <span v-for="lang in displaySpecies.languages" :key="lang" class="px-2 py-0.5 rounded bg-muted text-muted-foreground font-cinzel text-[10px] tracking-wider">{{ lang }}</span>
                </div>
              </div>
            </div>

            <!-- Description -->
            <RichTextViewer v-if="displaySpecies.description" :content="displaySpecies.description" />

            <!-- Traits -->
            <div v-if="displaySpecies.traits?.length" class="space-y-2">
              <p class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider">RACIAL TRAITS</p>
              <div v-for="trait in displaySpecies.traits" :key="trait.name">
                <span class="inline-block font-cinzel text-[10px] font-semibold tracking-wider bg-primary/10 text-primary rounded px-2 py-0.5 mb-1">{{ trait.name }}</span>
                <RichTextViewer :content="trait.description" />
              </div>
            </div>

            <!-- Subraces -->
            <div v-if="displaySpecies.subraces?.length" class="space-y-3">
              <p class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider">SUBRACES</p>
              <div v-for="sub in displaySpecies.subraces" :key="sub.name" class="space-y-1">
                <h4 class="font-cinzel text-sm font-bold text-foreground">{{ sub.name }}</h4>
                <RichTextViewer v-if="sub.description" :content="sub.description" />
                <div v-if="sub.traits?.length" class="pl-3 border-l border-border space-y-1.5 mt-1">
                  <div v-for="trait in sub.traits" :key="trait.name">
                    <span class="inline-block font-cinzel text-[10px] font-semibold tracking-wider bg-muted/40 text-muted-foreground rounded px-2 py-0.5 mb-0.5">{{ trait.name }}</span>
                    <RichTextViewer :content="trait.description" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { X, Shield } from "lucide-vue-next";
import FocalImage from "@/components/common/FocalImage.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import PlayerNotesWidget from "@/components/common/PlayerNotesWidget.vue";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { useSpecies, useSpeciesNameMap } from "@/composables/useSpecies";
import { getDisplayRace, getDisplaySpeciesId } from "@/lib/partyMemberDisplay";
import type { PartyMember } from "@/types/party.types";
import type { HealthVisibility } from "@/types/encounter.types";
import type { Species } from "@/types/species.types";

const props = defineProps<{ member: PartyMember | null }>();
defineEmits<{ close: [] }>();

const auth = useAuthStore();
const ui = useUiStore();
const campaign = useCampaignStore();
const speciesNameMap = useSpeciesNameMap();

const speciesModalOpen = ref(false);

const healthVis = computed<HealthVisibility>(
  () => (campaign.activeCampaign?.health_visibility as HealthVisibility) ?? "strategic",
);
const isOwnMember = computed(() => props.member?.id === (viewerMemberId.value ?? auth.linkedPartyMemberId));
const showNumericHp = computed(() =>
  healthVis.value === "strategic" || isOwnMember.value,
);

const viewerMemberId = computed(() =>
  ui.dmPreviewMode ? ui.dmPreviewPartyMemberId : auth.linkedPartyMemberId ?? null,
);
const viewerIsDm = computed(() => !ui.dmPreviewMode && auth.isDM);

const displaySpeciesId = computed(() =>
  props.member ? (getDisplaySpeciesId(props.member, viewerMemberId.value, viewerIsDm.value) ?? "") : "",
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
const hpLabel = computed(() => {
  const p = hpPct.value;
  if (p <= 0) return "Dead";
  if (p <= 25) return "Bloodied";
  if (p <= 50) return "Wounded";
  if (p <= 75) return "Hurt";
  return "Healthy";
});

// ── Species modal helpers ────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const speedPills = computed(() => {
  const s = displaySpecies.value?.speed;
  if (!s) return [];
  const labels: Record<string, string> = {
    walk: "Walk", fly: "Fly", swim: "Swim", climb: "Climb", burrow: "Burrow",
  };
  return (Object.keys(s) as (keyof Species["speed"] & string)[])
    .filter((k) => s[k] !== null && s[k] !== undefined && (s[k] as number) > 0)
    .map((k) => `${labels[k] ?? capitalize(k)} ${s[k]}ft`);
});

function asiToString(asi: Species["ability_score_increases"]): string {
  if (!asi) return "";
  if ("description" in asi && typeof asi.description === "string") return asi.description;
  return Object.entries(asi)
    .map(([k, v]) => `+${v} ${k.toUpperCase()}`)
    .join(", ");
}

const asiText = computed(() =>
  displaySpecies.value ? asiToString(displaySpecies.value.ability_score_increases) : "",
);
</script>
