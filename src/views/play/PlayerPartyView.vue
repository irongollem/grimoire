<template>
  <div class="w-fit mx-auto space-y-8">

    <!-- ── The Party ───────────────────────────────────────────────────────── -->
    <section>
      <h2 class="font-cinzel text-lg font-bold text-foreground mb-4">The Party</h2>

      <div v-if="partyLoading" class="flex justify-center py-8">
        <LoadingSpinner />
      </div>
      <p v-else-if="!members?.length" class="font-fell text-muted-foreground italic">
        No party members yet.
      </p>
      <div v-else class="flex flex-wrap gap-4">
        <div
          v-for="m in members"
          :key="m.id"
          class="flex flex-col rounded-lg border bg-card overflow-hidden cursor-pointer hover:border-primary/50 transition-colors shrink-0 w-50"
          :class="m.id === auth.linkedPartyMemberId ? 'border-primary/40' : 'border-border'"
          @click="openMember(m)"
        >
          <div class="relative aspect-3/4 bg-muted overflow-hidden shrink-0 group">
            <img
              v-if="m.portrait_url"
              :src="m.portrait_url"
              :alt="m.name"
              class="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
            />
            <div v-else class="w-full h-full flex items-center justify-center text-muted-foreground/30">
              <UserIcon class="h-10 w-10" />
            </div>
            <span
              v-if="m.id === auth.linkedPartyMemberId"
              class="absolute top-2 left-2 font-cinzel text-[10px] px-1.5 py-0.5 rounded bg-primary text-primary-foreground tracking-wider"
            >You</span>
          </div>

          <div class="p-2.5 flex flex-col gap-1.5">
            <div>
              <h3 class="font-cinzel text-sm font-bold text-foreground leading-tight truncate">{{ m.name }}</h3>
              <p class="font-fell text-xs text-muted-foreground italic truncate">
                {{ [m.race, m.class].filter(Boolean).join(' ') }}
                <span v-if="m.level" class="font-cinzel not-italic text-primary ml-1">Lv{{ m.level }}</span>
              </p>
            </div>
            <div>
              <div class="flex items-center justify-between mb-0.5">
                <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider">HP</span>
                <span class="font-cinzel text-[10px]" :class="hpColor(m)">{{ m.current_hp }} / {{ m.max_hp }}</span>
              </div>
              <div class="h-1.5 rounded-full bg-muted overflow-hidden">
                <div class="h-full rounded-full transition-all" :class="hpBarColor(m)"
                  :style="{ width: `${Math.max(0, Math.min(100, (m.current_hp / m.max_hp) * 100))}%` }" />
              </div>
            </div>
            <div class="flex items-center gap-2 flex-wrap">
              <span class="flex items-center gap-1">
                <Shield class="h-3 w-3 text-muted-foreground shrink-0" />
                <span class="font-cinzel text-xs font-bold text-foreground">{{ m.ac }}</span>
              </span>
              <span
                v-for="cond in (m.conditions ?? []).slice(0, 2)" :key="cond"
                class="font-cinzel text-[10px] px-1 py-0.5 rounded bg-destructive/10 text-destructive tracking-wider"
              >{{ cond }}</span>
              <span v-if="(m.conditions?.length ?? 0) > 2" class="font-fell text-[10px] text-muted-foreground italic">
                +{{ (m.conditions?.length ?? 0) - 2 }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ── People (shared NPCs) ────────────────────────────────────────────── -->
    <section v-if="npcs?.length || npcsLoading">
      <h2 class="font-cinzel text-lg font-bold text-foreground mb-4">People</h2>

      <div v-if="npcsLoading" class="flex justify-center py-8">
        <LoadingSpinner />
      </div>
      <div v-else class="flex flex-wrap gap-4">
        <div
          v-for="npc in sortedNpcs"
          :key="npc.id"
          class="flex flex-col rounded-lg border border-border bg-card overflow-hidden cursor-pointer hover:border-primary/50 transition-colors shrink-0 w-50"
          @click="openNpc(npc)"
        >
          <div class="relative aspect-3/4 bg-muted overflow-hidden shrink-0 group">
            <img
              v-if="npc.player_visible_fields.includes('portrait') && npc.portrait_url"
              :src="npc.portrait_url"
              :alt="npc.player_visible_fields.includes('name') ? npc.name : '???'"
              class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
            <div v-else class="w-full h-full flex items-center justify-center text-muted-foreground/30">
              <UserIcon class="h-10 w-10" />
            </div>
            <span
              v-if="npc.player_visible_fields.includes('relationship')"
              class="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-cinzel font-bold tracking-wider uppercase text-white"
              :style="{ backgroundColor: relColor(npc.relationship) + 'EE' }"
            >{{ npc.relationship }}</span>
          </div>

          <div class="p-2.5 flex flex-col gap-0.5">
            <h3 class="font-cinzel text-sm font-bold text-foreground leading-tight truncate">
              {{ npc.player_visible_fields.includes('name') ? npc.name : '???' }}
            </h3>
            <p v-if="npc.player_visible_fields.includes('status')" class="flex items-center gap-1 font-fell text-xs text-muted-foreground">
              <span class="w-1.5 h-1.5 rounded-full shrink-0" :style="{ backgroundColor: statusColor(npc.status) }" />
              {{ npc.status }}
            </p>
            <p v-if="npc.player_visible_fields.includes('race') && (npc.race || npc.class)" class="font-fell text-xs text-muted-foreground italic truncate">
              {{ [npc.race, npc.class].filter(Boolean).join(' · ') }}
            </p>
            <p v-if="npc.player_visible_fields.includes('occupation') && npc.occupation" class="font-fell text-xs text-muted-foreground truncate">
              {{ npc.occupation }}
            </p>
            <p v-if="npc.player_visible_fields.includes('location') && resolvedLocation(npc)" class="font-fell text-xs text-muted-foreground truncate">
              📍 {{ resolvedLocation(npc) }}
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- ── Party member lightbox ───────────────────────────────────────────── -->
    <Transition name="fade">
      <div v-if="selectedMember" class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" @click.self="closeMember">
        <div class="bg-card rounded-xl border border-border w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
          <div class="relative shrink-0">
            <div v-if="selectedMember.portrait_url" class="w-full max-h-72 overflow-hidden">
              <img :src="selectedMember.portrait_url" :alt="selectedMember.name" class="w-full h-full object-cover object-top" />
            </div>
            <button class="absolute top-2 right-2 bg-black/50 rounded-full p-1 text-white hover:bg-black/70 transition-colors" @click="closeMember">
              <XIcon class="h-4 w-4" />
            </button>
            <span v-if="selectedMember.id === auth.linkedPartyMemberId"
              class="absolute top-2 left-2 font-cinzel text-[10px] px-1.5 py-0.5 rounded bg-primary text-primary-foreground tracking-wider">You</span>
          </div>
          <div class="p-4 overflow-y-auto space-y-4">
            <div>
              <h2 class="font-cinzel text-lg font-bold text-foreground">{{ selectedMember.name }}</h2>
              <p class="font-fell text-sm text-muted-foreground italic">
                {{ [selectedMember.race, selectedMember.class].filter(Boolean).join(' ') }}
                <span v-if="selectedMember.level" class="font-cinzel not-italic text-primary ml-1">Lv{{ selectedMember.level }}</span>
              </p>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div class="rounded-md bg-muted p-2.5">
                <div class="flex items-center justify-between mb-1">
                  <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider">HP</span>
                  <span class="font-cinzel text-sm font-bold" :class="hpColor(selectedMember)">
                    {{ selectedMember.current_hp }} / {{ selectedMember.max_hp }}
                  </span>
                </div>
                <div class="h-1.5 rounded-full bg-background overflow-hidden">
                  <div class="h-full rounded-full transition-all" :class="hpBarColor(selectedMember)"
                    :style="{ width: `${Math.max(0, Math.min(100, (selectedMember.current_hp / selectedMember.max_hp) * 100))}%` }" />
                </div>
              </div>
              <div class="rounded-md bg-muted p-2.5 flex items-center gap-2">
                <Shield class="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p class="font-cinzel text-[10px] text-muted-foreground tracking-wider">AC</p>
                  <p class="font-cinzel text-sm font-bold text-foreground">{{ selectedMember.ac }}</p>
                </div>
              </div>
            </div>
            <div v-if="selectedMember.conditions?.length" class="flex flex-wrap gap-1.5">
              <span v-for="cond in selectedMember.conditions" :key="cond"
                class="font-cinzel text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive tracking-wider">{{ cond }}</span>
            </div>
            <div>
              <p class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1.5">
                MY NOTES <span class="font-fell font-normal normal-case text-muted-foreground/60">(private)</span>
              </p>
              <RichTextEditor v-model="memberNotesEdit" placeholder="Your thoughts on this party member…" min-height="100px" />
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ── NPC lightbox ────────────────────────────────────────────────────── -->
    <Transition name="fade">
      <div v-if="selectedNpc" class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" @click.self="closeNpc">
        <div class="bg-card rounded-xl border border-border w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
          <div class="relative shrink-0">
            <div v-if="selectedNpc.player_visible_fields.includes('portrait') && selectedNpc.portrait_url" class="w-full max-h-72 overflow-hidden">
              <img :src="selectedNpc.portrait_url"
                :alt="selectedNpc.player_visible_fields.includes('name') ? selectedNpc.name : '???'"
                class="w-full h-full object-cover object-top" />
            </div>
            <button class="absolute top-2 right-2 bg-black/50 rounded-full p-1 text-white hover:bg-black/70 transition-colors" @click="closeNpc">
              <XIcon class="h-4 w-4" />
            </button>
          </div>
          <div class="p-4 overflow-y-auto space-y-4">
            <div>
              <h2 class="font-cinzel text-lg font-bold text-foreground">
                {{ selectedNpc.player_visible_fields.includes('name') ? selectedNpc.name : '???' }}
              </h2>
              <div class="flex flex-wrap gap-2 mt-1">
                <span v-if="selectedNpc.player_visible_fields.includes('relationship')"
                  class="px-2 py-0.5 rounded text-[11px] font-cinzel font-bold tracking-wider uppercase text-white"
                  :style="{ backgroundColor: relColor(selectedNpc.relationship) + 'CC' }">
                  {{ selectedNpc.relationship }}
                </span>
                <span v-if="selectedNpc.player_visible_fields.includes('status')"
                  class="flex items-center gap-1.5 px-2 py-0.5 rounded bg-muted font-cinzel text-[11px] tracking-wider">
                  <span class="w-1.5 h-1.5 rounded-full" :style="{ backgroundColor: statusColor(selectedNpc.status) }" />
                  {{ selectedNpc.status }}
                </span>
              </div>
              <p v-if="selectedNpc.player_visible_fields.includes('race') && (selectedNpc.race || selectedNpc.class)"
                class="mt-1 font-fell text-sm text-muted-foreground italic">
                {{ [selectedNpc.race, selectedNpc.class].filter(Boolean).join(' · ') }}
              </p>
              <p v-if="selectedNpc.player_visible_fields.includes('occupation') && selectedNpc.occupation"
                class="font-fell text-sm text-muted-foreground">{{ selectedNpc.occupation }}</p>
            </div>
            <div>
              <p class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1.5">PARTY NOTES</p>
              <RichTextEditor v-model="npcPartyNotesEdit" placeholder="What the party knows…" min-height="100px" />
            </div>
            <div>
              <p class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1.5">
                MY NOTES <span class="font-fell font-normal normal-case text-muted-foreground/60">(private)</span>
              </p>
              <RichTextEditor v-model="npcPersonalNotesEdit" placeholder="Your personal observations…" min-height="100px" />
            </div>
          </div>
        </div>
      </div>
    </Transition>

  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { UserIcon, XIcon, Shield } from "lucide-vue-next";
import { useAuthStore } from "@/stores/auth";
import { useParty } from "@/composables/useParty";
import { useSharedNpcs } from "@/composables/useNpcs";
import { useAllLocations } from "@/composables/useLocations";
import { supabase, getCurrentUser } from "@/lib/supabase";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import type { PartyMember } from "@/types/party.types";
import type { Npc, NpcRelationship, NpcStatus } from "@/types/npc.types";

const auth = useAuthStore();
const { data: members, isLoading: partyLoading } = useParty();
const { data: npcs, isLoading: npcsLoading } = useSharedNpcs();
const { data: allLocations } = useAllLocations();

const locationMap = computed(() => {
  const m = new Map<string, string>();
  for (const loc of allLocations.value ?? []) m.set(loc.id, loc.name);
  return m;
});

function resolvedLocation(npc: { location_id: string | null }) {
  return npc.location_id ? (locationMap.value.get(npc.location_id) ?? "") : "";
}

const sortedNpcs = computed(() =>
  [...(npcs.value ?? [])].sort((a, b) => {
    const locA = resolvedLocation(a).toLowerCase();
    const locB = resolvedLocation(b).toLowerCase();
    if (locA && !locB) return -1;
    if (!locA && locB) return 1;
    return locA.localeCompare(locB);
  })
);

// ── Party member lightbox ────────────────────────────────────────────────────
const selectedMember = ref<PartyMember | null>(null);
const memberNotesEdit = ref("");

async function openMember(m: PartyMember) {
  selectedMember.value = m;
  const { data } = await supabase.from("party_member_player_notes").select("notes").eq("party_member_id", m.id).maybeSingle();
  memberNotesEdit.value = data?.notes ?? "";
}

async function saveMemberNotes() {
  if (!selectedMember.value) return;
  const user = await getCurrentUser();
  await supabase.from("party_member_player_notes").upsert(
    { party_member_id: selectedMember.value.id, user_id: user!.id, notes: memberNotesEdit.value },
    { onConflict: "party_member_id,user_id" },
  );
}

async function closeMember() {
  await saveMemberNotes();
  selectedMember.value = null;
}

// ── NPC lightbox ─────────────────────────────────────────────────────────────
const selectedNpc = ref<Npc | null>(null);
const npcPartyNotesEdit = ref("");
const npcPersonalNotesEdit = ref("");

async function openNpc(npc: Npc) {
  selectedNpc.value = npc;
  npcPartyNotesEdit.value = npc.party_notes ?? "";
  const { data } = await supabase.from("npc_player_notes").select("notes").eq("npc_id", npc.id).maybeSingle();
  npcPersonalNotesEdit.value = data?.notes ?? "";
}

async function saveNpcPartyNotes() {
  if (!selectedNpc.value) return;
  await supabase.rpc("update_npc_party_notes", { p_npc_id: selectedNpc.value.id, p_notes: npcPartyNotesEdit.value });
}

async function saveNpcPersonalNotes() {
  if (!selectedNpc.value) return;
  const user = await getCurrentUser();
  await supabase.from("npc_player_notes").upsert(
    { npc_id: selectedNpc.value.id, user_id: user!.id, notes: npcPersonalNotesEdit.value },
    { onConflict: "npc_id,user_id" },
  );
}

async function closeNpc() {
  await Promise.all([saveNpcPartyNotes(), saveNpcPersonalNotes()]);
  selectedNpc.value = null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function hpColor(m: PartyMember) {
  const pct = m.current_hp / m.max_hp;
  return pct < 0.33 ? "text-destructive" : pct < 0.66 ? "text-amber-400" : "text-elven-green";
}
function hpBarColor(m: PartyMember) {
  const pct = m.current_hp / m.max_hp;
  return pct < 0.33 ? "bg-destructive" : pct < 0.66 ? "bg-amber-400" : "bg-elven-green";
}

const REL_COLORS: Record<NpcRelationship, string> = { ally: "#2563eb", neutral: "#6b7280", enemy: "#dc2626", unknown: "#9333ea" };
const STATUS_COLORS: Record<NpcStatus, string> = { alive: "#22c55e", dead: "#ef4444", missing: "#f59e0b", unknown: "#6b7280" };
function relColor(rel: NpcRelationship) { return REL_COLORS[rel] ?? "#6b7280"; }
function statusColor(s: NpcStatus) { return STATUS_COLORS[s] ?? "#6b7280"; }
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
