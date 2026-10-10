<template>
  <CautionNotice v-if="pending.length" class="flex flex-col gap-2" data-testid="approval-notice">
    <p>{{ member.name }} is waiting for the DM's approval, so they cannot be made active yet.</p>
    <ul class="flex flex-col gap-2">
      <li
        v-for="review in pending"
        :key="review.id"
        data-testid="approval-item"
      >
        <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="font-semibold">{{ contentKindLabel(review.kind) }}: {{ review.label }}</p>
          <p class="text-caption">{{ reviewReasonText(review) }}</p>
        </div>
        <template v-if="canChange">
          <template v-for="offer in [changeOffer(review.kind, member.level, review.reason)]" :key="review.id">
            <AppButton
              v-if="offer.type === 'link'"
              variant="link"
              size="inline"
              :label="offer.label"
              class="shrink-0"
              :to="changeRoute(review.kind, member.id)"
            />
            <AppButton
              v-else-if="offer.type === 'remove'"
              variant="subtle"
              size="xs"
              label="Remove"
              class="shrink-0"
              :loading="removing === review.id"
              @click="remove(review)"
            />
          </template>
        </template>
        </div>
        <template v-if="canChange">
          <template v-for="offer in [changeOffer(review.kind, member.level, review.reason)]" :key="review.id">
            <p v-if="offer.type === 'note'" class="text-caption mt-1" data-testid="approval-note">{{ offer.text }}</p>
          </template>
        </template>
      </li>
    </ul>
    <p class="text-caption">Once nothing is waiting, {{ member.name }} can be made active.</p>
  </CautionNotice>
</template>

<script lang="ts">
import type { RouteLocationRaw } from "vue-router";
import type { ContentKind, ContentReviewReason } from "@/composables/party/useCharacterContentReviews";

/**
 * Where a choice is changed, for a character that is not the active one.
 * Species, background and spells have pickers that take `?memberId=`. A class,
 * subclass or feat is only ever undone through the level history (reversing the
 * level that took it), which is the level-up page; the edit page shows the class
 * read-only and has no feat editor.
 */
export type ChangeOffer =
  | { type: "link"; label: "Change" | "Level down to change" }
  | { type: "remove" }
  | { type: "note"; text: string };

/**
 * What a player can honestly be offered for a flagged choice. Species,
 * background and spells have pickers. A subclass or feat is only undone by
 * reversing the level that took it, and a class is fixed once the character is
 * made: at level 2 or higher the same level-down applies, at level 1 nothing can
 * change it. Something that no longer exists can only be removed.
 */
export function changeOffer(kind: ContentKind, level: number, reason: ContentReviewReason): ChangeOffer {
  if (reason === "missing") return { type: "remove" };
  switch (kind) {
    case "species":
    case "background":
    case "spell":
      return { type: "link", label: "Change" };
    case "subclass":
    case "feat":
      return { type: "link", label: "Level down to change" };
    case "class":
      if (level >= 2) return { type: "link", label: "Level down to change" };
      return {
        type: "note",
        text: reason === "foreign"
          ? "A class cannot be changed once a character is made, and this one cannot be approved here. This character cannot sit at this table as it is."
          : "A class cannot be changed once a character is made. Your DM can approve it, or you can build a new character.",
      };
  }
}

export function changeRoute(kind: ContentKind, memberId: string): RouteLocationRaw {
  const query = { memberId };
  switch (kind) {
    case "species":
      return { name: "play-species", query };
    case "background":
      return { name: "play-background", query };
    case "spell":
      return { name: "play-spells", query };
    case "class":
    case "subclass":
    case "feat":
      return { name: "play-character-levelup", query };
  }
}
</script>

<script setup lang="ts">
/**
 * Tells a player that a character at the table is benched (#943): which choices
 * the table has not approved, why, and where to change each. Shows nothing for a
 * character with no pending flag. The sentences come from
 * `useCharacterContentReviews` so the DM's queue reads the same.
 *
 * Only the owner (or, for a character nobody owns, whoever made it) gets the
 * Change links: the DM looking at the same sheet decides in the approval queue.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import CautionNotice from "@/components/common/feedback/CautionNotice.vue";
import {
  contentKindLabel,
  pendingReviews,
  reviewReasonText,
  useCharacterContentReviews,
  useRemoveMissingContent,
  type CharacterContentReview,
} from "@/composables/party/useCharacterContentReviews";
import { useToast } from "@/composables/useToast";
import { useAuthStore } from "@/stores/auth";
import type { PartyMember } from "@/types/party.types";

const { member } = defineProps<{ member: PartyMember }>();

const auth = useAuthStore();
const toast = useToast();
const { mutateAsync: removeContent } = useRemoveMissingContent();
const removing = ref<string | null>(null);

// Nothing is lost by removing something that no longer exists, so no confirmation.
async function remove(review: CharacterContentReview) {
  removing.value = review.id;
  try {
    await removeContent(review.id);
    toast.success(`Removed from ${member.name}.`);
  } catch (e) {
    toast.error(toast.fromError(e));
  } finally {
    removing.value = null;
  }
}
const { data: reviews } = useCharacterContentReviews(() => member.id);
const pending = computed(() => pendingReviews(reviews.value));

const canChange = computed(() => {
  const userId = auth.user?.id;
  if (!userId) return false;
  return member.owner_user_id !== null ? member.owner_user_id === userId : member.user_id === userId;
});
</script>
