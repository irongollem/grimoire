<!--
  A list of linked entities with a remove control per row and an add-picker under
  it — the shape shared by every "Associated X" / "Patron Y" block in the app
  (#749).

  Seven components had written this independently: the faction sheet's deities,
  locations, items, members and party members, the deity sheet's factions, and the
  NPC sheet's factions. 769 lines between them, differing only in which entity they
  link, which composable they call, and where a row navigates to. The #648 control
  sweep is what made it obvious — converting them put the add button and the remove
  chip on identical `AppButton` spellings, so the remaining duplication stopped
  being disguised by drift.

  ## What this owns, and what the caller owns

  This owns the SHELL: the heading, the list container, the per-entry container,
  the remove button, the empty state, and the add row. The caller owns the BODY of
  an entry, via the `entry` scoped slot — the icon, the RouterLink and whatever
  trailing metadata that entity has. That split is deliberate: the body is the only
  part that is genuinely different per entity, and a prop-per-field API would have
  needed an icon, a route builder, a name path and a meta path, which is harder to
  read than the markup it replaces.

  ## Two layouts, because there are genuinely two

  `chip` is a wrapping row of pills (deities, factions) and `row` is a stack of
  bordered full-width rows (items, locations). They are not a styling preference:
  a chip list holds short names and reads as a set, a row list holds a name plus
  metadata and reads as a table. Callers that want neither should not use this.

  ## Deliberately NOT covering everything

  FactionMembersSection and FactionPartyMembersSection use only `#add` here. They
  partition into active/former, hang a disclosure over the former group and edit a
  role and status per row, and they already delegate their row to
  `FactionMemberRow`. Forcing them through the `entry` slot would mean the slot
  supplied the whole body and this component contributed a wrapper — which is not
  extraction, just indirection.
-->
<template>
  <div class="flex flex-col" :class="layout === 'chip' ? 'gap-2' : 'gap-3'">
    <h2 v-if="heading" class="text-label-lg font-semibold text-muted-foreground uppercase">
      {{ heading }}
    </h2>

    <div
      v-if="entries.length"
      :class="layout === 'chip' ? 'flex flex-wrap gap-1.5' : 'flex flex-col gap-1.5'"
    >
      <div
        v-for="entry in entries"
        :key="entry.id"
        :class="[
          layout === 'chip'
            ? 'inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1'
            : 'flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2',
          entryClass?.(entry),
        ]"
      >
        <slot name="entry" :entry="entry" />
        <AppButton
          variant="ghost"
          tone="danger"
          size="inline-xs"
          class="shrink-0"
          label="×"
          :aria-label="`Remove ${removeLabel}`"
          @click="emit('remove', entry)"
        />
      </div>
    </div>
    <p v-else-if="empty" class="text-caption text-muted-foreground italic">{{ empty }}</p>

    <!-- For anything that sits between the list and the picker — the members
         sections' "Former members" disclosure is the only user so far. -->
    <slot name="extra" />

    <div class="flex items-center gap-2" :class="layout === 'chip' && 'mt-1'">
      <EntityCombobox v-model="model" :options="options" :placeholder="placeholder" />
      <AppButton
        variant="primary"
        size="sm"
        :icon="IconAdd"
        icon-size="xs"
        label="Add"
        class="shrink-0"
        :disabled="!model || adding"
        @click="emit('add')"
      />
    </div>
  </div>
</template>

<script setup lang="ts" generic="TEntry extends { id: string }, TOption extends { id: string; name: string }">
import { IconAdd } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";

/** The id currently chosen in the picker. Owned by the caller so it can clear it after a successful add. */
const model = defineModel<string>({ required: true });

const {
  entries,
  options,
  layout = "row",
  heading,
  empty,
  placeholder = "Search…",
  adding = false,
  removeLabel = "link",
  entryClass,
} = defineProps<{
  /** Already-linked rows. Only `id` is read here; the rest goes through the `entry` slot. */
  entries: TEntry[];
  /** Candidates for the picker — the caller filters out what is already linked. */
  options: TOption[];
  layout?: "chip" | "row";
  /** Omit where the surrounding card already supplies a title. */
  heading?: string;
  /** Omit to render nothing when the list is empty, which is what the row-layout sections do. */
  empty?: string;
  placeholder?: string;
  /** Disables Add while a mutation is in flight. */
  adding?: boolean;
  /** Names the thing being removed, for the remove button's accessible name. */
  removeLabel?: string;
  /** Per-entry classes — NpcFactionsSection dims a chip whose membership is not Active. */
  entryClass?: (entry: TEntry) => string | undefined;
}>();

const emit = defineEmits<{ add: []; remove: [entry: TEntry] }>();
</script>
