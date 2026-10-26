<template>
  <li :class="inactive && 'opacity-60'" :data-source="connection.source">
    <ConnectionSlip
      :name="connection.other_name"
      :image="connection.other_image"
      :image-format="connection.other_kind === 'faction' ? 'token' : 'portrait'"
      :pc="connection.other_kind === 'party_member'"
      :to="to"
      :opens="connection.other_kind === 'npc'"
      :tags="statusTags"
      :meta="told"
      :notes="connection.note"
      @open="peek(connection.other_id)"
    >
      <template #tags>
        <ConnectionTypePicker
          v-if="choices.length > 1"
          :word="word"
          :color="color"
          :subject-name="subjectName"
          :other-name="connection.other_name"
          :choices="choices"
          :is-current="isCurrent"
          :replaces="replaces"
          @pick="retype"
        />
        <span v-else class="text-label font-semibold" :style="{ color }" data-testid="type-word-static">{{ word }}</span>

        <span
          v-if="connection.source !== 'link'"
          class="rounded-sm border border-dashed border-border px-1.5 py-0.5 text-label text-muted-foreground"
          data-testid="home-marker"
        >{{ HOME_LABEL[connection.source] }}</span>

        <AppSelect
          v-if="ends"
          :model-value="connection.role ?? 'Member'"
          tone="bare"
          size="caption"
          weight="normal"
          class="cursor-pointer"
          :aria-label="`Role of ${roleHolder}`"
          data-testid="role-select"
          @update:model-value="changeRole($event)"
        >
          <option v-for="r in roles" :key="r" :value="r">{{ r }}</option>
        </AppSelect>
      </template>

      <template #actions>
        <div class="flex items-center">
          <!-- The eye says who knows. A link starts with nobody; a record is known as its record already is. -->
          <AudienceRevealControl
            v-if="connection.source === 'link' && connection.player_visible_to"
            form="inline"
            :visible-to="connection.player_visible_to"
            :name="`${subjectName} and ${connection.other_name}`"
            @change="(next) => setWhoKnows(next)"
          />
          <OverflowMenu
            variant="ghost"
            :label="`More actions for ${connection.other_name}`"
            :items="menu"
            size="icon-sm"
            @select="onMenu"
          />
        </div>
      </template>

      <template v-if="editing && connection.source === 'link'" #footer>
        <ConnectionNotesEditor :connection="connection" @done="editing = false" />
      </template>
    </ConnectionSlip>
  </li>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import ConnectionNotesEditor from "@/components/connections/ConnectionNotesEditor.vue";
import ConnectionTypePicker from "@/components/connections/ConnectionTypePicker.vue";
import {
  connectionRoute,
  HOME_LABEL,
  homeRoute,
  isCurrentChoice,
  membershipEnds,
  offeredRoles,
} from "@/components/connections/connectionRows";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import AudienceRevealControl from "@/components/common/reveal/AudienceRevealControl.vue";
import ConnectionSlip, { type ConnectionTag } from "@/components/common/entity/ConnectionSlip.vue";
import OverflowMenu, { type OverflowMenuEntry } from "@/components/common/overlays/OverflowMenu.vue";
import { useRemoveConnection, useRetypeConnection, useUpdateLink } from "@/composables/connections/useConnections";
import {
  useFactionHeaded,
  useUpdateFactionNpcRole,
  useUpdateFactionPartyMemberRole,
} from "@/composables/factions/useFactions";
import { useOpenNpc } from "@/composables/npcs/useNpcPeek";
import { useToast } from "@/composables/useToast";
import { connectionFamily, connectionWord, typeChoices, type TypeChoice } from "@/lib/worldLinks/connections";
import { NPC_FACTION_STATUS_COLORS, type NpcFactionStatus } from "@/types/faction.types";
import type { Connection, WorldRef } from "@/types/connections.types";

const { connection, subject, subjectName, all } = defineProps<{
  connection: Connection;
  subject: WorldRef;
  subjectName: string;
  /** Every row of the block, to say what a one-valued record would replace. */
  all: readonly Connection[];
}>();

const router = useRouter();
const toast = useToast();
const peek = useOpenNpc();
const retypeMutation = useRetypeConnection();
const removeMutation = useRemoveConnection();
const updateLink = useUpdateLink();
const updateNpcRole = useUpdateFactionNpcRole();
const updatePcRole = useUpdateFactionPartyMemberRole();

const editing = ref(false);

const word = computed(() => connectionWord(connection, subject.kind));
const color = computed(() => `var(--link-${connectionFamily(connection, subject.kind)})`);
const to = computed(() => connectionRoute(connection.other_kind, connection.other_id));
const told = computed(() => (connection.told ? `Told: “${connection.told}”` : null));

/** A quest's ties are written on the quest, so its word is not a picker. */
const choices = computed(() => (connection.other_kind === "quest" ? [] : typeChoices(subject.kind, connection.other_kind)));
const isCurrent = (choice: TypeChoice) => isCurrentChoice(connection, choice, word.value);

function replaces(choice: TypeChoice): string | null {
  if (!choice.subjectIsFrom) return null;
  const existing = all.find((c) => c !== connection && c.source === choice.home);
  return existing ? `Replaces ${existing.other_name}` : null;
}

async function retype(choice: TypeChoice) {
  try {
    await retypeMutation.mutateAsync({ connection, subject, choice });
    if (choice.home === "kin") toast.success(`${connection.other_name} is now kin, under Family.`);
  } catch (e) {
    toast.error(toast.fromError(e, "Could not change the connection. Please try again."));
  }
}

// ── Membership: the role is edited in place, as on the faction roster ──────────
const ends = computed(() => membershipEnds(connection, subject));
const headed = useFactionHeaded(() => ends.value?.factionId ?? "");
const roles = computed(() => offeredRoles(headed.value, connection.role));
const roleHolder = computed(() => (subject.kind === "faction" ? connection.other_name : subjectName));

async function changeRole(role: string) {
  const e = ends.value;
  if (!e) return;
  try {
    if (e.personKind === "npc") {
      await updateNpcRole.mutateAsync({ id: connection.row_id, role, faction_id: e.factionId, npc_id: e.personId });
    } else {
      await updatePcRole.mutateAsync({ id: connection.row_id, role, faction_id: e.factionId, party_member_id: e.personId });
    }
  } catch (err) {
    toast.error(toast.fromError(err, "Could not change the role. Please try again."));
  }
}

const inactive = computed(() => connection.source === "membership" && connection.status !== null && connection.status !== "Active");
/** A membership that is not Active says so, in the status's own colour. */
const statusTags = computed<ConnectionTag[]>(() =>
  inactive.value && connection.status !== null
    ? [{ label: connection.status, color: NPC_FACTION_STATUS_COLORS[connection.status as NpcFactionStatus] }]
    : [],
);

// ── Who knows, the menu ────────────────────────────────────────────────────────
async function setWhoKnows(next: string[]) {
  try {
    await updateLink.mutateAsync({ id: connection.row_id, playerVisibleTo: next });
  } catch (e) {
    toast.error(toast.fromError(e, "Could not change who knows. Please try again."));
  }
}

const home = computed(() => homeRoute(connection, subject));
const menu = computed<OverflowMenuEntry[]>(() => {
  const items: OverflowMenuEntry[] = [];
  if (connection.source === "link") items.push({ key: "edit", label: "Edit note and told" });
  else if (home.value) items.push({ key: "home", label: `Open the ${HOME_LABEL[connection.source]} record` });
  items.push({ key: "remove", label: "Remove connection", danger: true });
  return items;
});

async function onMenu(key: string) {
  if (key === "edit") editing.value = true;
  else if (key === "home" && home.value) void router.push(home.value);
  else if (key === "remove") {
    try {
      await removeMutation.mutateAsync({ connection, subject });
    } catch (e) {
      toast.error(toast.fromError(e, "Could not remove the connection. Please try again."));
    }
  }
}
</script>
