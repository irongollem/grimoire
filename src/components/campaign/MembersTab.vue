<template>
  <div class="space-y-4 max-w-3xl">
    <!-- Loading -->
    <div v-if="membersQuery.isPending.value || partyQuery.isPending.value" class="text-center py-12">
      <LoadingSpinner />
    </div>

    <template v-else>
      <!-- Member rows -->
      <div
        v-for="member in members"
        :key="member.id"
        class="rounded-lg border border-border bg-card p-4 flex flex-col sm:flex-row sm:items-center gap-4"
      >
        <!-- Avatar + identity -->
        <div class="flex items-center gap-3 flex-1 min-w-0">
          <div class="relative shrink-0">
            <div
              class="h-9 w-9 rounded-full flex items-center justify-center font-cinzel font-bold text-sm"
              :class="member.role === 'dm'
                ? 'bg-gold-500/20 text-gold-400'
                : 'bg-primary/20 text-primary'"
            >
              {{ (member.display_name || member.user_id).slice(0, 2).toUpperCase() }}
            </div>
            <!-- Online indicator -->
            <span
              class="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card"
              :class="isOnline(member.user_id) ? 'bg-elven-green' : 'bg-muted-foreground/30'"
              :title="isOnline(member.user_id) ? 'Online' : 'Offline'"
            />
          </div>
          <div class="min-w-0">
            <p class="font-cinzel text-sm font-semibold text-foreground truncate">
              {{ member.display_name || '(unnamed player)' }}
            </p>
            <span
              class="inline-block text-[10px] font-cinzel tracking-widest uppercase px-1.5 py-0.5 rounded"
              :class="member.role === 'dm'
                ? 'bg-gold-500/15 text-gold-400'
                : 'bg-primary/15 text-primary'"
            >
              {{ member.role }}
            </span>
          </div>
        </div>

        <!-- Party member assignment (players only) -->
        <div v-if="member.role === 'player'" class="flex items-center gap-2 shrink-0">
          <label class="font-fell text-xs text-muted-foreground italic whitespace-nowrap">
            Character:
          </label>
          <select
            :value="member.party_member_id ?? ''"
            class="rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring min-w-[160px]"
            :disabled="updateMember.isPending.value"
            @change="assignPartyMember(member.id, ($event.target as HTMLSelectElement).value)"
          >
            <option value="">— Unassigned —</option>
            <option
              v-for="pm in availablePartyMembers(member)"
              :key="pm.id"
              :value="pm.id"
            >
              {{ pm.name }}{{ pm.class ? ` · ${pm.class}` : '' }}{{ pm.level ? ` ${pm.level}` : '' }}
            </option>
          </select>
        </div>

        <!-- DM label -->
        <div v-else class="shrink-0">
          <p class="font-fell text-xs text-muted-foreground italic">Dungeon Master</p>
        </div>

        <!-- Remove button (can't remove DM — that's the campaign owner) -->
        <button
          v-if="member.role === 'player'"
          class="shrink-0 p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          title="Remove from campaign"
          :disabled="removeMember.isPending.value"
          @click="confirmRemove(member)"
        >
          <UserX class="h-4 w-4" />
        </button>
      </div>

      <!-- Empty -->
      <div
        v-if="members.length <= 1"
        class="rounded-lg border border-dashed border-border p-8 text-center"
      >
        <Users class="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
        <p class="font-fell text-muted-foreground italic text-sm">
          No players have joined yet. Share an invite link from the
          <button class="text-gold-400 hover:text-gold-300 underline" @click="$emit('switch-tab', 'invites')">
            Invite Links
          </button>
          tab.
        </p>
      </div>
    </template>

    <!-- Confirm remove dialog -->
    <div
      v-if="memberToRemove"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      @click.self="memberToRemove = null"
    >
      <div class="bg-card border border-border rounded-lg p-6 w-full max-w-sm space-y-4 shadow-gold-glow">
        <h3 class="font-cinzel text-lg font-semibold text-foreground">Remove Player?</h3>
        <p class="font-fell text-sm text-muted-foreground italic">
          Remove <strong class="text-foreground">{{ memberToRemove.display_name || 'this player' }}</strong>
          from the campaign? They can rejoin via a new invite link.
        </p>
        <div class="flex gap-2 justify-end">
          <button
            class="px-3 py-1.5 rounded-md border border-border text-sm font-fell text-muted-foreground hover:text-foreground transition-colors"
            @click="memberToRemove = null"
          >
            Cancel
          </button>
          <button
            class="px-3 py-1.5 rounded-md bg-destructive text-destructive-foreground text-sm font-fell hover:opacity-90 transition-opacity"
            :disabled="removeMember.isPending.value"
            @click="doRemove"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Users, UserX } from "lucide-vue-next";
import {
  useCampaignMembers,
  useUpdateCampaignMember,
  useRemoveCampaignMember,
} from "@/composables/useCampaignMembers";
import { useParty } from "@/composables/useParty";
import { useCampaignPresence } from "@/composables/useCampaignPresence";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import type { CampaignMember } from "@/types/campaign.types";

defineEmits<{ (e: "switch-tab", tab: string): void }>();

const membersQuery = useCampaignMembers();
const { isOnline } = useCampaignPresence();
const partyQuery = useParty();
const updateMember = useUpdateCampaignMember();
const removeMember = useRemoveCampaignMember();

const members = computed(() => membersQuery.data.value ?? []);
const partyMembers = computed(() => partyQuery.data.value ?? []);

// Only show party members not already assigned to another player
function availablePartyMembers(forMember: CampaignMember) {
  const takenIds = new Set(
    members.value
      .filter((m) => m.id !== forMember.id && m.party_member_id)
      .map((m) => m.party_member_id!)
  );
  return partyMembers.value.filter((pm) => !takenIds.has(pm.id));
}

function assignPartyMember(memberId: string, partyMemberId: string) {
  updateMember.mutate({
    id: memberId,
    update: { party_member_id: partyMemberId || null },
  });
}

const memberToRemove = ref<CampaignMember | null>(null);

function confirmRemove(member: CampaignMember) {
  memberToRemove.value = member;
}

function doRemove() {
  if (!memberToRemove.value) return;
  removeMember.mutate(memberToRemove.value.id, {
    onSuccess: () => { memberToRemove.value = null; },
  });
}
</script>
