<template>
  <!--
    What a flagged choice actually is (#943, wave 4). A DM cannot read a
    player's own content any other way, and approving homebrew copies it into
    the table's content, so they get to read it first.
  -->
  <AppModal :open="open" size="md" @close="emit('close')">
    <ModalHeader
      :title="title"
      :subtitle="subtitle"
      closeable
      @close="emit('close')"
    />

    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">
      <div v-if="itemQuery.isPending.value" class="text-center py-8">
        <LoadingSpinner />
      </div>

      <div v-else-if="itemQuery.isError.value" class="space-y-3" data-testid="item-error">
        <p class="text-body text-destructive">This could not be loaded.</p>
        <AppButton variant="subtle" size="sm" label="Try again" @click="itemQuery.refetch()" />
      </div>

      <p v-else-if="rows.length === 0" class="text-body text-muted-foreground italic" data-testid="item-empty">
        There is nothing more to show for this one.
      </p>

      <dl v-else class="space-y-3">
        <div v-for="row in rows" :key="row.label" data-testid="item-row">
          <dt class="text-label-lg font-semibold text-muted-foreground uppercase">{{ row.label }}</dt>
          <dd class="mt-0.5 text-body text-foreground">
            <RichTextViewer v-if="row.kind === 'rich'" :content="row.text" />
            <p v-else-if="row.kind === 'text'">{{ row.text }}</p>
            <ul v-else-if="row.kind === 'list'" class="flex flex-wrap gap-1.5">
              <li
                v-for="entry in row.entries"
                :key="entry"
                class="rounded-full border border-border px-2 py-0.5 text-caption"
              >
                {{ entry }}
              </li>
            </ul>
            <ul v-else-if="row.kind === 'traits'" class="space-y-2">
              <li v-for="trait in row.traits" :key="trait.name">
                <p class="font-semibold">{{ trait.name }}</p>
                <RichTextViewer v-if="trait.description" :content="trait.description" />
              </li>
            </ul>
          </dd>
        </div>
      </dl>
    </div>

    <div class="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3">
      <AppButton variant="ghost" size="md" label="Close" @click="emit('close')" />
      <AppButton
        v-for="option in options"
        :key="option.scope"
        :variant="option.scope === 'table' ? 'subtle' : 'primary'"
        size="md"
        :label="option.label"
        :disabled="!canApprove"
        @click="emit('approve', option.scope, seenUpdatedAt)"
      />
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppModal from "@/components/common/AppModal.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import ModalHeader from "@/components/common/ModalHeader.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import {
  approvalOptions,
  contentKindLabel,
  reviewReasonText,
  useCharacterContentItem,
  type ApprovalScope,
  type CharacterContentReview,
} from "@/composables/party/useCharacterContentReviews";
import { contentName, contentRows, type ContentRow } from "@/composables/party/characterContentRows";

const { open, review } = defineProps<{
  open: boolean;
  review: CharacterContentReview | null;
}>();

// `seenUpdatedAt` travels with an approval made from here: it is what the DM
// was actually shown, and the database refuses the approval if the player has
// edited the row since.
const emit = defineEmits<{ close: []; approve: [scope: ApprovalScope, seenUpdatedAt: string | undefined] }>();

const itemQuery = useCharacterContentItem(() => (open ? review?.id : null));

// `seen_at` is the newest change to anything shown here: the row, and the
// features and spells an approval would copy with it.
const seenUpdatedAt = computed(() => {
  const at = itemQuery.data.value?.seen_at;
  return typeof at === "string" ? at : undefined;
});

const item = computed(() => itemQuery.data.value ?? null);

// An approval from here says "I looked". While the item is loading, or failed
// to load, nothing was looked at and there is no `seen_at` to send, and the
// database reads a missing one as "approved without looking", which skips the
// very check this dialog exists for. Approving unseen is still possible, from the queue, where
// that is what the button says.
const canApprove = computed(() => item.value !== null);

const rows = computed<ContentRow[]>(() => (review && item.value ? contentRows(review.kind, item.value) : []));

const title = computed(() => (item.value && contentName(item.value)) ?? review?.label ?? "");

const subtitle = computed(() =>
  review ? `${contentKindLabel(review.kind)}. ${reviewReasonText(review)}` : undefined,
);

const options = computed(() => (review ? approvalOptions(review) : []));
</script>
