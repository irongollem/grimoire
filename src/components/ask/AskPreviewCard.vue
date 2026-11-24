<template>
  <p v-if="item.phase === 'discarded'" class="text-caption text-muted-foreground" data-testid="ask-preview-discarded">Discarded. Nothing was saved.</p>

  <section
    v-else-if="item.phase !== 'saved'"
    class="flex flex-col gap-2.5 border border-border bg-card px-3 py-2.5"
    :aria-label="`${item.shown.title}, not saved yet`"
    data-testid="ask-preview"
  >
    <p class="text-eyebrow uppercase text-muted-foreground">Ready · not saved yet</p>
    <div class="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
      <h3 class="min-w-0 text-body font-bold leading-tight text-foreground" data-testid="ask-preview-title">{{ item.shown.title }}</h3>
      <AppButton v-if="item.shown.badge" as="span" variant="tinted" size="xs" tone="info" emphasis="outline" :label="item.shown.badge" data-testid="ask-preview-badge" />
    </div>

    <!-- Prose to read before the rows (a chronicle's draft): through the sanitized viewer, never as markup. -->
    <RichTextViewer v-if="item.shown.body" :content="item.shown.body" class="text-body" data-testid="ask-preview-body" />

    <div v-for="(section, i) in item.shown.sections" :key="section.heading ?? i" class="flex flex-col gap-1">
      <p v-if="section.heading" class="text-eyebrow uppercase text-muted-foreground">{{ section.heading }}</p>
      <p v-if="section.hint" class="text-caption italic text-muted-foreground">{{ section.hint }}</p>
      <dl class="flex flex-col gap-1 text-body">
        <div v-for="(row, r) in section.rows" :key="`${row.label}:${r}`" class="flex flex-col gap-1">
          <div class="flex items-baseline gap-2">
            <dt class="min-w-0 flex-1 text-muted-foreground">{{ row.label }}</dt>
            <dd class="min-w-0 max-w-[70%] text-right">{{ row.detail }}</dd>
          </div>
          <!-- A press on this row alone: runs once, then says what it did and where to go. The preview stays open. -->
          <div v-if="row.action" class="flex flex-wrap items-center justify-end gap-2" :data-testid="`ask-preview-row-${i}-${r}`">
            <template v-if="stateOf(i, r)?.phase === 'done'">
              <span class="inline-flex items-center gap-1 text-label-lg font-semibold text-ink-success" data-testid="ask-preview-row-done">
                <IconCheck class="size-3.5" />
                {{ stateOf(i, r)?.doneLabel }}
              </span>
              <AppButton v-for="link in stateOf(i, r)?.links ?? []" :key="link.route" variant="link" size="inline-caption" :label="link.label" :to="link.route" data-testid="ask-preview-row-link" />
              <span v-if="stateOf(i, r)?.error" class="w-full text-right text-caption text-ink-caution" data-testid="ask-preview-row-note">{{ stateOf(i, r)?.error }}</span>
            </template>
            <template v-else>
              <span v-if="stateOf(i, r)?.error" class="min-w-0 flex-1 text-caption text-destructive" role="alert" data-testid="ask-preview-row-error">{{ stateOf(i, r)?.error }}</span>
              <AppButton
                variant="outline"
                size="xs"
                :class="{ 'min-h-11': isMobile }"
                :loading="stateOf(i, r)?.phase === 'running'"
                :disabled="busy"
                :label="row.action.label"
                data-testid="ask-preview-row-action"
                @click="emit('act', i, r)"
              />
            </template>
          </div>
          <!-- A choice the DM may change before Create (which book's version of a creature); the adapter saves the pick. -->
          <div v-if="row.choice" class="flex items-center gap-1.5" :data-testid="`ask-preview-choice-${row.choice.key}`">
            <span class="shrink-0 text-label text-muted-foreground">{{ row.choice.label }}</span>
            <EntityCombobox
              :model-value="row.choice.value"
              :options="row.choice.options"
              :placeholder="`${row.choice.label}…`"
              @update:model-value="emit('pick', row.choice.key, $event)"
            />
          </div>
        </div>
      </dl>
    </div>

    <p v-if="item.shown.note" class="flex items-start gap-1.5 text-caption text-ink-caution" data-testid="ask-preview-note">
      <IconWarning class="mt-0.5 size-3 shrink-0" />
      <span>{{ item.shown.note }}</span>
    </p>
    <p v-if="item.error" class="text-caption text-destructive" role="alert" data-testid="ask-preview-error">{{ item.error }}</p>

    <div v-if="item.phase !== 'failed'" class="flex flex-wrap items-center gap-2" data-testid="ask-preview-foot">
      <AppButton
        variant="primary"
        size="sm"
        :class="{ 'min-h-11': isMobile }"
        :loading="item.phase === 'saving'"
        :disabled="busy"
        :label="item.phase === 'saving' ? 'Saving…' : action"
        data-testid="ask-preview-create"
        @click="emit('create')"
      />
      <AppButton
        v-if="again.price !== null"
        variant="subtle"
        size="sm"
        :class="{ 'min-h-11': isMobile }"
        :loading="item.phase === 'again'"
        :disabled="busy || again.blocked"
        :label="item.phase === 'again' ? 'Working…' : `Again · ${creditsText(again.price)}`"
        data-testid="ask-preview-again"
        @click="emit('again')"
      />
      <AppButton variant="ghost" size="sm" :class="{ 'min-h-11': isMobile }" :disabled="busy" label="Discard" data-testid="ask-preview-discard" @click="emit('discard')" />
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * A generation held for the DM's yes (#1270, canvas frame 17): what it made, drawn from plain data the adapter gave
 * (title, badge, prose, rows, a note), with Create (saves; costs nothing more), Again (a new generation, its price named)
 * and Discard (ends with nothing saved). It holds no state: the conversation owns the phase, and every press here
 * is an emit. Saved, it is gone: the result card follows it.
 */
import { computed } from "vue";
import { IconCheck, IconWarning } from "@/lib/icons";
import { creditsText } from "@/lib/ask/askCredits";
import { useIsMobile } from "@/composables/useBreakpoint";
import { previewRowKey, type AskItem } from "@/composables/ask/useAskConversation";
import AppButton from "@/components/common/controls/AppButton.vue";
import RichTextViewer from "@/components/common/richtext/RichTextViewer.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";

const { item, action, again } = defineProps<{
  item: Extract<AskItem, { kind: "preview" }>;
  /** The generator's own action ("Create encounter"): what the primary button says. */
  action: string;
  /** What another generation would cost now (null while the provider is not known), and whether a gate says no. */
  again: { price: number | null; blocked: boolean };
}>();
const emit = defineEmits<{ create: []; again: []; discard: []; pick: [key: string, value: string]; act: [section: number, row: number] }>();

const isMobile = useIsMobile();
/** A press is under way: nothing else on the card may be pressed. */
const busy = computed(() => item.phase === 'saving' || item.phase === 'again' || Object.values(item.rows).some((r) => r.phase === 'running'));

const stateOf = (section: number, row: number) => item.rows[previewRowKey(section, row)];
</script>
