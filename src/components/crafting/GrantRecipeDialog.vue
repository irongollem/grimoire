<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      @click.self="$emit('close')"
    >
      <div class="bg-card border border-border rounded-lg w-full max-w-sm shadow-xl">
        <div class="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 class="font-cinzel text-base font-bold text-foreground">Grant Recipe</h2>
          <button class="text-muted-foreground hover:text-foreground text-xl leading-none" @click="$emit('close')">✕</button>
        </div>

        <div class="px-5 py-4">
          <p class="font-fell text-sm text-muted-foreground mb-4">
            Select party members who should receive access to
            <span class="text-foreground font-semibold">{{ recipeName }}</span>.
          </p>

          <div v-if="partyMembers.length === 0" class="font-fell text-sm text-muted-foreground italic">
            No party members in this campaign yet.
          </div>

          <div class="flex flex-col gap-2">
            <label
              v-for="member in partyMembers"
              :key="member.id"
              class="flex items-center gap-3 rounded-md border border-border px-3 py-2.5 cursor-pointer hover:bg-muted/40 transition-colors"
              :class="granted.has(member.id) ? 'border-primary bg-primary/10' : ''"
            >
              <input
                type="checkbox"
                class="accent-primary"
                :checked="granted.has(member.id)"
                @change="toggle(member.id)"
              />
              <div class="flex-1 min-w-0">
                <p class="font-cinzel text-sm font-semibold text-foreground truncate">{{ member.name }}</p>
                <p v-if="member.player_name" class="font-fell text-xs text-muted-foreground italic">
                  {{ member.player_name }}
                </p>
              </div>
              <Check v-if="granted.has(member.id)" class="h-3.5 w-3.5 text-primary shrink-0" />
            </label>
          </div>
        </div>

        <div class="flex justify-end gap-2 px-5 py-4 border-t border-border">
          <button
            class="px-4 py-2 font-cinzel text-xs font-semibold tracking-wider text-muted-foreground hover:text-foreground border border-border rounded-md transition-colors"
            @click="$emit('close')"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { Check } from "lucide-vue-next";
import type { PartyMember } from "@/types/party.types";
import type { CraftingRecipeGrant } from "@/types/crafting.types";
import { useGrantRecipe, useRevokeGrant } from "@/composables/useCrafting";

const props = defineProps<{
  open: boolean;
  recipeId: string;
  recipeName: string;
  partyMembers: PartyMember[];
  existingGrants: CraftingRecipeGrant[];
}>();

defineEmits<{ close: [] }>();

const { mutateAsync: grant } = useGrantRecipe();
const { mutateAsync: revoke } = useRevokeGrant();

const granted = ref<Set<string>>(new Set());

watch(
  () => props.existingGrants,
  (grants) => {
    granted.value = new Set(grants.map((g) => g.party_member_id));
  },
  { immediate: true },
);

async function toggle(memberId: string) {
  if (granted.value.has(memberId)) {
    await revoke({ recipeId: props.recipeId, partyMemberId: memberId });
    granted.value.delete(memberId);
  } else {
    await grant({ recipeId: props.recipeId, partyMemberId: memberId });
    granted.value.add(memberId);
  }
  granted.value = new Set(granted.value); // trigger reactivity
}
</script>
