<template>
  <div class="space-y-4">
    <h2 class="font-cinzel text-xl font-bold text-foreground">The Party</h2>

    <div v-if="isLoading" class="flex justify-center py-12">
      <LoadingSpinner />
    </div>

    <div v-else-if="!members?.length" class="text-center py-12">
      <p class="font-fell text-muted-foreground italic">No party members yet.</p>
    </div>

    <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div
        v-for="m in members"
        :key="m.id"
        class="rounded-lg border bg-card p-4 flex gap-3"
        :class="m.id === auth.linkedPartyMemberId ? 'border-primary/40' : 'border-border'"
      >
        <!-- Portrait -->
        <div class="shrink-0">
          <div
            v-if="m.portrait_url"
            class="h-14 w-14 rounded-md overflow-hidden border border-border"
          >
            <img :src="m.portrait_url" :alt="m.name" class="h-full w-full object-cover" />
          </div>
          <div v-else class="h-14 w-14 rounded-md bg-muted/50 border border-border flex items-center justify-center">
            <User class="h-6 w-6 text-muted-foreground" />
          </div>
        </div>

        <!-- Info -->
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <p class="font-cinzel text-sm font-bold text-foreground">{{ m.name }}</p>
            <span
              v-if="m.id === auth.linkedPartyMemberId"
              class="font-cinzel text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary tracking-wider"
            >You</span>
          </div>
          <p class="font-fell text-xs text-muted-foreground italic">
            {{ [m.race, m.class].filter(Boolean).join(" ") }}
            <span v-if="m.level" class="font-cinzel not-italic text-primary ml-1">Lv{{ m.level }}</span>
          </p>

          <!-- HP bar -->
          <div class="mt-2">
            <div class="flex items-center justify-between mb-0.5">
              <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider">HP</span>
              <span class="font-cinzel text-[10px]" :class="hpColor(m)">
                {{ m.current_hp }} / {{ m.max_hp }}
              </span>
            </div>
            <div class="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                class="h-full rounded-full transition-all"
                :class="hpBarColor(m)"
                :style="{ width: `${Math.max(0, Math.min(100, (m.current_hp / m.max_hp) * 100))}%` }"
              />
            </div>
          </div>

          <!-- Conditions -->
          <div v-if="m.conditions?.length" class="flex flex-wrap gap-1 mt-2">
            <span
              v-for="cond in m.conditions"
              :key="cond"
              class="font-cinzel text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive tracking-wider"
            >
              {{ cond }}
            </span>
          </div>
        </div>

        <!-- AC badge -->
        <div class="shrink-0 flex flex-col items-center gap-1">
          <Shield class="h-5 w-5 text-muted-foreground" />
          <span class="font-cinzel text-sm font-bold text-foreground">{{ m.ac }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { User, Shield } from "lucide-vue-next";
import { useAuthStore } from "@/stores/auth";
import { useParty } from "@/composables/useParty";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import type { PartyMember } from "@/types/party.types";

const auth = useAuthStore();
const { data: members, isLoading } = useParty();

function hpColor(m: PartyMember) {
  const pct = m.current_hp / m.max_hp;
  if (pct <= 0) return "text-destructive";
  if (pct < 0.33) return "text-destructive";
  if (pct < 0.66) return "text-amber-400";
  return "text-elven-green";
}

function hpBarColor(m: PartyMember) {
  const pct = m.current_hp / m.max_hp;
  if (pct <= 0) return "bg-destructive";
  if (pct < 0.33) return "bg-destructive";
  if (pct < 0.66) return "bg-amber-400";
  return "bg-elven-green";
}
</script>
