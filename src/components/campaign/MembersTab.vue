<template>
  <div class="space-y-4 max-w-3xl">
    <!-- Loading -->
    <div
      v-if="membersQuery.isPending.value || partyQuery.isPending.value"
      class="text-center py-12"
    >
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
              :class="
                member.role === 'dm'
                  ? 'bg-gold-500/20 text-gold-400'
                  : 'bg-primary/20 text-primary'
              "
            >
              {{
                (member.display_name || member.user_id)
                  .slice(0, 2)
                  .toUpperCase()
              }}
            </div>
            <!-- Online indicator -->
            <span
              class="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card"
              :class="
                isOnline(member.user_id)
                  ? 'bg-elven-green'
                  : 'bg-muted-foreground/30'
              "
              :title="isOnline(member.user_id) ? 'Online' : 'Offline'"
            />
          </div>
          <div class="min-w-0">
            <p
              class="font-cinzel text-sm font-semibold text-foreground truncate"
            >
              {{ member.display_name || "(unnamed player)" }}
            </p>
            <span
              class="inline-block text-2xs font-cinzel tracking-widest uppercase px-1.5 py-0.5 rounded"
              :class="
                member.role === 'dm'
                  ? 'bg-gold-500/15 text-gold-400'
                  : 'bg-primary/15 text-primary'
              "
            >
              {{ member.role }}
            </span>
          </div>
        </div>

        <!-- Party member assignment (players only) -->
        <div
          v-if="member.role === 'player'"
          class="flex items-center gap-2 shrink-0"
        >
          <label
            class="text-caption text-muted-foreground italic whitespace-nowrap"
          >
            Character:
          </label>
          <EntityCombobox
            :model-value="member.party_member_id ?? ''"
            :options="characterOptions(member)"
            placeholder="Assign character…"
            class="min-w-40"
            @update:model-value="assignPartyMember(member.id, $event)"
          />
        </div>

        <!-- DM label -->
        <div v-else class="shrink-0">
          <p class="text-caption text-muted-foreground italic">
            Dungeon Master
          </p>
        </div>

        <!-- Remove button (can't remove DM — that's the campaign owner) -->
        <AppButton
          v-if="member.role === 'player'"
          variant="ghost"
          tone="danger"
          fill="tone"
          size="icon-xs"
          icon-size="md"
          class="shrink-0"
          :icon="IconRemoveUser"
          tooltip="Remove from campaign"
          :disabled="removeMember.isPending.value"
          @click="confirmRemove(member)"
        />
      </div>

      <!-- Empty -->
      <div
        v-if="members.length <= 1"
        class="rounded-lg border border-dashed border-border p-8 text-center"
      >
        <IconParty class="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
        <p class="text-body text-muted-foreground italic">
          No players have joined yet — generate an invite link below to get started.
        </p>
      </div>

      <!-- Characters left behind by a removed player -->
      <div v-if="unattachedCharacters.length" class="space-y-2 pt-2">
        <h3 class="font-cinzel text-sm font-semibold text-foreground">
          Characters without a player
        </h3>
        <p class="text-caption text-muted-foreground italic">
          These still show on the dashboard and party tracker but aren't attached
          to anyone. Assign one to a player above, or detach/remove it.
        </p>
        <div
          v-for="pm in unattachedCharacters"
          :key="pm.id"
          class="rounded-lg border border-border bg-card p-3 flex items-center gap-3"
        >
          <div class="min-w-0 flex-1">
            <p class="font-cinzel text-sm font-semibold text-foreground truncate">
              {{ pm.name }}
            </p>
            <p class="text-caption text-muted-foreground italic truncate">
              {{ pm.class || "Adventurer" }}{{ pm.level ? ` · Level ${pm.level}` : "" }}
            </p>
          </div>
          <!-- Claimed characters (owner_user_id set) can only be detached — RLS
               no longer permits deleting them; unclaimed ones can still be removed. -->
          <AppButton
            v-if="pm.owner_user_id"
            variant="ghost"
            size="icon-xs"
            icon-size="md"
            class="shrink-0 hover:bg-accent"
            :icon="IconUndo"
            tooltip="Detach — return to owner's pool"
            :disabled="detachCharacter.isPending.value"
            @click="detachOrphan(pm)"
          />
          <AppButton
            v-else
            variant="ghost"
            tone="danger"
            fill="tone"
            size="icon-xs"
            icon-size="md"
            class="shrink-0"
            :icon="IconDelete"
            tooltip="Remove character"
            :disabled="deleteCharacter.isPending.value"
            @click="removeOrphan(pm)"
          />
        </div>
      </div>
    </template>

    <!-- Confirm remove dialog -->
    <div
      v-if="memberToRemove"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      @click.self="memberToRemove = null"
    >
      <div
        class="bg-card border border-border rounded-lg p-6 w-full max-w-sm space-y-4 shadow-gold-glow"
      >
        <h3 class="text-heading font-semibold text-foreground">
          Remove Player?
        </h3>
        <p class="text-body text-muted-foreground italic">
          Remove
          <strong class="text-foreground">{{
            memberToRemove.display_name || "this player"
          }}</strong>
          from the campaign? They can rejoin via a new invite link.
        </p>
        <p v-if="removedPlayerCharacters.length" class="text-body text-muted-foreground italic">
          Character<span v-if="removedPlayerCharacters.length > 1">s</span>
          <strong class="text-foreground">{{ removedCharacterNames }}</strong>
          <template v-if="removedPlayerCharacters.length > 1"> return</template><template v-else> returns</template>
          to the player's own pool automatically — nothing is deleted, and they can
          bring {{ removedPlayerCharacters.length > 1 ? "them" : "it" }} to another campaign.
        </p>
        <div class="flex gap-2 justify-end">
          <AppButton
            variant="subtle"
            size="body"
            label="Cancel"
            @click="memberToRemove = null"
          />
          <AppButton
            variant="tinted"
            tone="danger"
            emphasis="solid"
            size="body"
            label="Remove"
            :disabled="removeMember.isPending.value"
            @click="doRemove"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { IconParty, IconRemoveUser, IconDelete, IconUndo } from '@/lib/icons';
import {
  useCampaignMembers,
  useUpdateCampaignMember,
  useRemoveCampaignMember,
} from "@/composables/useCampaignMembers";
import { useParty, useDeletePartyMember } from "@/composables/useParty";
import { useDetachCharacter } from "@/composables/useCharacterPool";
import { useCampaignPresence } from "@/composables/useCampaignPresence";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import AppButton from "@/components/common/AppButton.vue";
import type { CampaignMember } from "@/types/campaign.types";
import type { PartyMember } from "@/types/party.types";


const membersQuery = useCampaignMembers();
const { isOnline } = useCampaignPresence();
const partyQuery = useParty();
const updateMember = useUpdateCampaignMember();
const removeMember = useRemoveCampaignMember();
const deleteCharacter = useDeletePartyMember();
const detachCharacter = useDetachCharacter();
const { confirm } = useConfirm();
const toast = useToast();

const members = computed(() => membersQuery.data.value ?? []);
const partyMembers = computed(() => partyQuery.data.value ?? []);

// Characters that render on the dashboard/party tracker but aren't attached to
// any player — a player was removed (or a link cleared) and the character was
// left behind. Excludes DM-managed offered characters (an intentional pool) and
// bench characters owned by a player who is still a member.
const unattachedCharacters = computed<PartyMember[]>(() => {
  const memberUserIds = new Set(members.value.map((m) => m.user_id));
  const linkedIds = new Set(
    members.value.map((m) => m.party_member_id).filter((id): id is string => !!id),
  );
  return partyMembers.value.filter(
    (pm) =>
      !pm.is_dm_managed &&
      !linkedIds.has(pm.id) &&
      (pm.owner_user_id === null || !memberUserIds.has(pm.owner_user_id)),
  );
});

async function removeOrphan(pm: PartyMember) {
  const ok = await confirm(`Delete "${pm.name}" from the party? This can't be undone.`, {
    title: "Remove character?",
    confirmLabel: "Remove",
  });
  if (!ok) return;
  await deleteCharacter.mutateAsync(pm);
}

// Claimed characters (owner_user_id set) can no longer be deleted here — RLS
// only allows the owner to destroy their own character. Detach is the durable
// replacement: it returns to the owner's pool with progress intact.
async function detachOrphan(pm: PartyMember) {
  const ok = await confirm(`Return "${pm.name}" to its owner's pool? It leaves this campaign, but nothing is deleted.`, {
    title: "Detach character?",
    confirmLabel: "Detach",
    danger: false,
  });
  if (!ok) return;
  try {
    await detachCharacter.mutateAsync(pm.id);
  } catch (error) {
    toast.error(toast.fromError(error));
  }
}

// Only show party members not already assigned to another player
function availablePartyMembers(forMember: CampaignMember) {
  const takenIds = new Set(
    members.value
      .filter((m) => m.id !== forMember.id && m.party_member_id)
      .map((m) => m.party_member_id!),
  );
  return partyMembers.value.filter((pm) => !takenIds.has(pm.id));
}

// EntityCombobox options: composed "Name · Class Level" label, searchable by name.
function characterOptions(forMember: CampaignMember): { id: string; name: string }[] {
  return availablePartyMembers(forMember).map((pm) => ({
    id: pm.id,
    name: `${pm.name}${pm.class ? ` · ${pm.class}` : ""}${pm.level ? ` ${pm.level}` : ""}`,
  }));
}

function assignPartyMember(memberId: string, partyMemberId: string) {
  updateMember.mutate({
    id: memberId,
    update: { party_member_id: partyMemberId || null },
  });
}

const memberToRemove = ref<CampaignMember | null>(null);

// Match detach_characters_on_membership_delete exactly: only characters owned
// by the removed user detach. A linked DM-managed character stays in the
// campaign and must not be promised as returning to the player's pool.
const removedPlayerCharacters = computed<PartyMember[]>(() => {
  const member = memberToRemove.value;
  if (!member) return [];
  return partyMembers.value.filter((pm) => pm.owner_user_id === member.user_id);
});
const removedCharacterNames = computed(() =>
  removedPlayerCharacters.value.map((pm) => pm.name).join(", "),
);

function confirmRemove(member: CampaignMember) {
  memberToRemove.value = member;
}

// Detach-never-delete (#730): the server-side removal trigger returns the
// player's characters to their own pool. No client-side deletion needed.
async function doRemove() {
  const member = memberToRemove.value;
  if (!member) return;
  removeMember.mutate(member.id, {
    onSuccess: () => {
      memberToRemove.value = null;
    },
  });
}
</script>
