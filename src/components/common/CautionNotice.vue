<template>
  <div
    v-bind="otherAttrs"
    :class="cn('rounded-md border border-tone-caution/40 bg-tone-caution/10 px-3 py-2 text-sm text-ink-caution', klass)"
    role="status"
  >
    <slot />
  </div>
</template>

<script setup lang="ts">
/**
 * The amber box for a short caution that sits inside a page: a bordered, tinted
 * block of text with the caution ink. Three surfaces had each typed the same
 * recipe (`RulesetReviewBanner`, `CharacterEditionNotice`,
 * `EmbedStaleContentBanner`), which is how a set of notices drifts apart.
 *
 * It owns the box only. Layout inside it (a flex row, an action button) and any
 * deliberate departure (a smaller text size) come from the caller's `class`,
 * merged with `cn` so an override replaces the default rather than competing.
 *
 * Not `NoticeCard`, which is a different thing on purpose: a titled neutral
 * card with an actions row that stands above a whole page. This is the inline,
 * untitled, amber one.
 */
import { computed, useAttrs } from "vue";
import { cn } from "@/lib/utils";

defineOptions({ inheritAttrs: false });

const attrs = useAttrs();
const klass = computed(() => attrs.class);
const otherAttrs = computed(() => {
  const { class: _class, ...rest } = attrs;
  return rest;
});
</script>
