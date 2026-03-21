<template>
  <div>
    <h1 class="font-cinzel text-xl font-bold text-foreground mb-1">People</h1>
    <p class="font-fell text-sm text-muted-foreground italic mb-6">Characters the party has encountered.</p>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <p
      v-else-if="!npcs?.length"
      class="text-center font-fell text-sm text-muted-foreground italic py-12"
    >
      No NPCs have been revealed yet.
    </p>

    <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
      <div
        v-for="npc in npcs"
        :key="npc.id"
        class="flex flex-col rounded-lg border border-border bg-card overflow-hidden cursor-pointer hover:border-primary/50 transition-colors"
        @click="openNpc(npc)"
      >
        <!-- Portrait -->
        <div class="relative aspect-3/4 bg-muted overflow-hidden shrink-0 group">
          <FocalImage
            v-if="npc.player_visible_fields.includes('portrait') && npc.portrait_url"
            :src="npc.portrait_url"
            :alt="npc.player_visible_fields.includes('name') ? npc.name : '???'"
            format="portrait"
            :focal-point="npc.portrait_focal_point"
            class="group-hover:scale-105 transition-transform duration-300"
          />
          <div
            v-else
            class="w-full h-full flex items-center justify-center text-muted-foreground/30"
          >
            <UserIcon class="h-12 w-12" />
          </div>

          <span
            v-if="npc.player_visible_fields.includes('relationship')"
            class="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-cinzel font-bold tracking-wider uppercase text-white"
            :style="{ backgroundColor: relColor(npc.relationship) + 'EE' }"
          >
            {{ npc.relationship }}
          </span>
        </div>

        <!-- Info -->
        <div class="p-2.5 flex flex-col gap-0.5">
          <h3 class="font-cinzel text-sm font-bold text-foreground leading-tight">
            {{ npc.player_visible_fields.includes('name') ? npc.name : '???' }}
          </h3>
          <p v-if="npc.player_visible_fields.includes('status')" class="flex items-center gap-1 font-fell text-xs text-muted-foreground">
            <span class="w-1.5 h-1.5 rounded-full shrink-0" :style="{ backgroundColor: statusColor(npc.status) }" />
            {{ npc.status }}
          </p>
          <p
            v-if="npc.player_visible_fields.includes('race') && (npc.race || npc.class)"
            class="font-fell text-xs text-muted-foreground italic truncate"
          >
            {{ [npc.race, npc.class].filter(Boolean).join(' · ') }}
          </p>
          <p
            v-if="npc.player_visible_fields.includes('occupation') && npc.occupation"
            class="font-fell text-xs text-muted-foreground truncate"
          >
            {{ npc.occupation }}
          </p>
        </div>
      </div>
    </div>

    <!-- Detail lightbox -->
    <Transition name="fade">
      <div
        v-if="selected"
        class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
        @click.self="closeNpc"
      >
        <div class="bg-card rounded-xl border border-border w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
          <!-- Portrait blown up -->
          <div class="relative shrink-0">
            <div
              v-if="selected.player_visible_fields.includes('portrait') && selected.portrait_url"
              class="w-full h-72 overflow-hidden"
            >
              <FocalImage
                :src="selected.portrait_url"
                :alt="selected.player_visible_fields.includes('name') ? selected.name : '???'"
                format="portrait"
                :focal-point="selected.portrait_focal_point"
              />
            </div>
            <button
              class="absolute top-2 right-2 bg-black/50 rounded-full p-1 text-white hover:bg-black/70 transition-colors"
              @click="closeNpc"
            >
              <XIcon class="h-4 w-4" />
            </button>
          </div>

          <div class="p-4 overflow-y-auto space-y-4">
            <!-- Identity -->
            <div>
              <h2 class="font-cinzel text-lg font-bold text-foreground">
                {{ selected.player_visible_fields.includes('name') ? selected.name : '???' }}
              </h2>
              <div class="flex flex-wrap gap-2 mt-1">
                <span
                  v-if="selected.player_visible_fields.includes('relationship')"
                  class="px-2 py-0.5 rounded text-[11px] font-cinzel font-bold tracking-wider uppercase text-white"
                  :style="{ backgroundColor: relColor(selected.relationship) + 'CC' }"
                >
                  {{ selected.relationship }}
                </span>
                <span
                  v-if="selected.player_visible_fields.includes('status')"
                  class="flex items-center gap-1.5 px-2 py-0.5 rounded bg-muted font-cinzel text-[11px] tracking-wider"
                >
                  <span class="w-1.5 h-1.5 rounded-full" :style="{ backgroundColor: statusColor(selected.status) }" />
                  {{ selected.status }}
                </span>
              </div>
              <p
                v-if="selected.player_visible_fields.includes('race') && (selected.race || selected.class)"
                class="mt-1 font-fell text-sm text-muted-foreground italic"
              >
                {{ [selected.race, selected.class].filter(Boolean).join(' · ') }}
              </p>
              <p
                v-if="selected.player_visible_fields.includes('occupation') && selected.occupation"
                class="font-fell text-sm text-muted-foreground"
              >
                {{ selected.occupation }}
              </p>
            </div>

            <!-- Party notes -->
            <div>
              <p class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1.5">PARTY NOTES</p>
              <RichTextEditor v-model="partyNotesEdit" placeholder="What the party knows…" min-height="100px" />
            </div>

            <!-- Personal notes -->
            <div>
              <p class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1.5">
                MY NOTES <span class="font-fell font-normal normal-case text-muted-foreground/60">(private)</span>
              </p>
              <RichTextEditor v-model="personalNotesEdit" placeholder="Your personal observations…" min-height="100px" />
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { UserIcon, XIcon } from "lucide-vue-next";
import { useSharedNpcs } from "@/composables/useNpcs";
import { supabase, getCurrentUser } from "@/lib/supabase";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import type { Npc, NpcRelationship, NpcStatus } from "@/types/npc.types";

const { data: npcs, isLoading } = useSharedNpcs();

const selected = ref<Npc | null>(null);
const partyNotesEdit = ref("");
const personalNotesEdit = ref("");

async function openNpc(npc: Npc) {
  selected.value = npc;
  partyNotesEdit.value = npc.party_notes ?? "";

  // Load this player's personal notes for the NPC
  const { data } = await supabase
    .from("npc_player_notes")
    .select("notes")
    .eq("npc_id", npc.id)
    .maybeSingle();
  personalNotesEdit.value = data?.notes ?? "";
}

async function savePartyNotes() {
  if (!selected.value) return;
  await supabase.rpc("update_npc_party_notes", {
    p_npc_id: selected.value.id,
    p_notes: partyNotesEdit.value,
  });
}

async function savePersonalNotes() {
  if (!selected.value) return;
  const user = await getCurrentUser();
  await supabase.from("npc_player_notes").upsert(
    { npc_id: selected.value.id, user_id: user!.id, notes: personalNotesEdit.value },
    { onConflict: "npc_id,user_id" },
  );
}

async function closeNpc() {
  await Promise.all([savePartyNotes(), savePersonalNotes()]);
  selected.value = null;
}

const REL_COLORS: Record<NpcRelationship, string> = {
  ally: "#2563eb",
  neutral: "#6b7280",
  enemy: "#dc2626",
  unknown: "#9333ea",
};
const STATUS_COLORS: Record<NpcStatus, string> = {
  alive: "#22c55e",
  dead: "#ef4444",
  missing: "#f59e0b",
  unknown: "#6b7280",
};
function relColor(rel: NpcRelationship) { return REL_COLORS[rel] ?? "#6b7280"; }
function statusColor(s: NpcStatus) { return STATUS_COLORS[s] ?? "#6b7280"; }
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
