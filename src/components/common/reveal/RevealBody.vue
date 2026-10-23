<template>
  <!--
    The contents of a reveal control, identical in the popover and the sheet.
    Kept separate from `RevealControl` for exactly that reason: the moment the
    two presentations own their own markup they start to differ, which is how
    the app ended up with four reveal UIs in the first place.

    Order is now identity → who → what. Identity comes first because it
    decides *which* entity the rest of the popover is about — an NPC's alter
    ego toggle picks the face before "who can see it" has any meaning to pick
    a face for. Then "who", then "what": choosing fields for an entity nobody
    can see is meaningless, so the audience decision comes before that.
  -->
  <div class="flex flex-col">
    <!--
      "Identity" — which face of the entity the rest of this popover is about
      (an NPC's alter ego vs. true form). Deliberately NOT dimmed with the
      "what" slot below: "what" decides how much of a *shared* thing to show,
      which is meaningless while nothing is shared, but which face an NPC is
      wearing changes what the DM's own grid and header render right now,
      whether or not any player can see this NPC at all. So it stays live even
      at `state === 'private'`.
    -->
    <div v-if="$slots.identity" class="border-b border-border px-3 py-3">
      <slot name="identity" />
    </div>

    <div class="px-3 pt-3">
      <p class="mb-2 text-label font-semibold text-muted-foreground">
        VISIBLE TO
      </p>

      <AppButton
        variant="tinted"
        tone="primary"
        :emphasis="state === 'everyone' ? 'strong' : 'soft'"
        size="sm"
        block
        class="justify-start gap-2"
        :icon="IconParty"
        label="Whole party"
        :active="state === 'everyone'"
        @click="adapter.setWholeParty()"
      />
    </div>

    <div v-if="party.length" class="flex flex-col gap-0.5 px-3 pt-2 pb-2">
      <p class="mb-1 text-label text-muted-foreground">OR SPECIFIC</p>
      <RevealOption
        v-for="member in party"
        :key="member.id"
        :label="member.name"
        :checked="adapter.isMemberVisible(member.id)"
        @toggle="adapter.toggleMember(member.id)"
      />
    </div>

    <p v-else class="px-3 pb-3 text-caption text-muted-foreground italic">
      No party members yet. Add some to share with.
    </p>

    <!--
      "Beyond the table" (#1085) — the Open Book. Only for the campaign's owner
      and only once it has a book, so `book.available` is false for co-DMs,
      players and every kind of entry that cannot be bookable. It is between
      "who" and "what" because it is a wider "who": the switch is live only
      once the whole party can see the entry, and the caption says whom to add
      when it cannot.
    -->
    <div v-if="book?.available" class="border-t border-border px-3 py-3">
      <p class="mb-2 text-label font-semibold text-muted-foreground">
        AND BEYOND THE TABLE
      </p>
      <div class="flex items-center justify-between gap-3 px-2">
        <span class="flex items-center gap-2 text-label-lg">
          <IconOpenBook class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          In the Open Book
        </span>
        <ToggleSwitch
          aria-label="In the Open Book"
          :model-value="book.inBook"
          :disabled="!book.eligible"
          @update:model-value="emit('toggleBook')"
        />
      </div>
      <p class="mt-1.5 px-2 text-caption text-muted-foreground">
        {{ book.eligible ? "From the next release" : book.blockedCaption }}
      </p>
    </div>

    <!--
      "What" — the per-entity half. An NPC's fields, a monster's stat block, a
      location's description / NPCs / inventory. Disabled-looking while nothing
      is shared, because deciding how much of a hidden thing to show is a
      decision with no effect.
    -->
    <div
      v-if="$slots.default"
      class="border-t border-border px-3 py-3"
      :class="state === 'private' && 'pointer-events-none opacity-40'"
    >
      <slot />
    </div>

    <div v-if="state !== 'private'" class="border-t border-border px-3 py-2">
      <AppButton
        variant="ghost"
        size="inline-xs"
        class="text-destructive hover:opacity-80"
        label="Hide from all players"
        @click="hideAll"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/controls/AppButton.vue";
import ToggleSwitch from "@/components/common/controls/ToggleSwitch.vue";
import RevealOption from "@/components/common/reveal/RevealOption.vue";
import { IconOpenBook, IconParty } from "@/lib/icons";
import type { RevealAdapter, PartyRevealState } from "@/lib/reveal";
import type { PartyMember } from "@/types/party.types";

const { adapter } = defineProps<{
  party: PartyMember[];
  adapter: RevealAdapter;
  state: PartyRevealState;
  /** The Open Book section; absent or `available: false` leaves the popover as it was. */
  book?: {
    available: boolean;
    eligible: boolean;
    inBook: boolean;
    blockedCaption: string;
  };
}>();

const emit = defineEmits<{ close: []; toggleBook: [] }>();

function hideAll() {
  adapter.unshare();
  emit("close");
}
</script>
