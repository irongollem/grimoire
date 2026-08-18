<template>
  <!--
    The contents of a reveal control, identical in the popover and the sheet.
    Kept separate from `RevealControl` for exactly that reason: the moment the
    two presentations own their own markup they start to differ, which is how
    the app ended up with four reveal UIs in the first place.

    Order is deliberate — "who" first, then "what". Choosing fields for an
    entity nobody can see is meaningless, so the audience decision comes first
    and gates the rest.
  -->
  <div class="flex flex-col">
    <div class="px-3 pt-3">
      <p class="mb-2 font-cinzel text-2xs font-semibold tracking-widest text-muted-foreground">
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
      <p class="mb-1 font-cinzel text-2xs tracking-widest text-muted-foreground">OR SPECIFIC</p>
      <RevealOption
        v-for="member in party"
        :key="member.id"
        :label="member.name"
        :checked="adapter.isMemberVisible(member.id)"
        @toggle="adapter.toggleMember(member.id)"
      />
    </div>

    <p v-else class="px-3 pb-3 text-caption text-muted-foreground italic">
      No party members yet — add some to share with.
    </p>

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
import AppButton from "@/components/common/AppButton.vue";
import RevealOption from "@/components/common/RevealOption.vue";
import { IconParty } from "@/lib/icons";
import type { RevealAdapter, RevealState } from "@/lib/reveal";
import type { PartyMember } from "@/types/party.types";

const { adapter } = defineProps<{
  party: PartyMember[];
  adapter: RevealAdapter;
  state: RevealState;
}>();

const emit = defineEmits<{ close: [] }>();

function hideAll() {
  adapter.unshare();
  emit("close");
}
</script>
