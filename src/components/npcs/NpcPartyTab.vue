<template>
  <!--
    What each player character knows about this NPC, in one place: whether they
    can see it, when they met, and the connection line they read as "Your
    connection". Sharing goes through useNpcReveal, the same adapter as the
    header's reveal popover, so a share here seeds fields and announces alike.
  -->
  <div class="space-y-3" data-testid="npc-party-tab">
    <div>
      <div class="flex items-baseline justify-between gap-3">
        <h3 class="text-heading-sm font-bold text-foreground">With the party</h3>
        <span v-if="members.length" class="text-caption text-muted-foreground">
          {{ sharedCount }} of {{ members.length }} shared
        </span>
      </div>
      <div class="gold-divider mt-1" />
    </div>

    <p v-if="!members.length" class="text-body italic text-muted-foreground">
      No characters in the party yet.
    </p>
    <div v-else class="flex flex-col gap-4 lg:flex-row lg:items-start">
      <aside class="flex flex-col gap-3 lg:order-2 lg:w-64 lg:shrink-0">
        <NpcDisguisePanel v-if="hasDisguise" :npc="npc" :revealed="isRevealed" @change="setRevealed" />
        <section class="rounded-lg border border-border bg-card p-3">
          <p class="mb-2 text-label font-semibold uppercase text-muted-foreground">When shared, they see</p>
          <RevealedFieldsPanel
            :model-value="fields"
            :fields="NPC_PLAYER_FIELDS"
            @update:model-value="setFields($event)"
          />
        </section>
      </aside>
      <ul class="flex min-w-0 flex-1 flex-col gap-2 lg:order-1">
        <NpcPartyRow
          v-for="member in members"
          :key="member.id"
          :npc="npc"
          :member="member"
          :shared="adapter.isMemberVisible(member.id)"
          :met-at="reveals?.get(member.id) ?? null"
          :connection="connectionsByMember.get(member.id)?.[0] ?? null"
          :others="connectionsByMember.get(member.id)?.slice(1) ?? []"
          @toggle="adapter.toggleMember(member.id)"
        />
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import RevealedFieldsPanel from "@/components/common/reveal/RevealedFieldsPanel.vue";
import NpcDisguisePanel from "@/components/npcs/NpcDisguisePanel.vue";
import NpcPartyRow from "@/components/npcs/NpcPartyRow.vue";
import { useConnections } from "@/composables/connections/useConnections";
import { useNpcReveal } from "@/composables/npcs/useNpcReveal";
import { useNpcReveals } from "@/composables/npcs/useNpcReveals";
import { useParty } from "@/composables/party/useParty";
import { NPC_PLAYER_FIELDS } from "@/lib/npcDisplay";
import type { Connection } from "@/types/connections.types";
import type { NpcListRow } from "@/types/npc.types";

const { npc } = defineProps<{ npc: NpcListRow }>();

const npcId = computed(() => npc.id);
const { data: party } = useParty();
const { data: connections } = useConnections("npc", npcId);
const { data: reveals } = useNpcReveals(npcId);
const { visibleTo, fields, isRevealed, hasDisguise, adapter, setFields, setRevealed } = useNpcReveal(() => npc);

const members = computed(() => party.value ?? []);
// Every link per character (a world link may hold several types between one NPC and one PC): the ties this
// NPC holds towards them, from the NPC's side. The first is the row's main connection, the rest its chips.
const connectionsByMember = computed(() => {
  const byMember = new Map<string, Connection[]>();
  for (const c of connections.value ?? []) {
    if (c.source !== "link" || c.other_kind !== "party_member") continue;
    byMember.set(c.other_id, [...(byMember.get(c.other_id) ?? []), c]);
  }
  return byMember;
});
const sharedCount = computed(() => members.value.filter((m) => visibleTo.value.includes(m.id)).length);
</script>
