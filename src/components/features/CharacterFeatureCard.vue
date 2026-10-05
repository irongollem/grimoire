<template>
  <article class="px-4 py-3 space-y-2" :class="isSubclass ? 'bg-primary/3' : ''">
    <!-- Title row. A spellcasting feature has no text of its own: it leads to the Spells page. -->
    <button
      type="button"
      class="w-full min-w-0 text-left flex items-start gap-2 cursor-pointer"
      :aria-expanded="canExpand ? expanded : undefined"
      @click="onHeaderClick"
    >
      <span class="flex-1 min-w-0 text-body font-semibold text-foreground wrap-break-word">{{ title }}</span>
      <IconGenerate v-if="isSpellcasting" class="h-3 w-3 mt-1.5 text-primary/60 shrink-0" />
      <IconChevronDown
        v-else-if="canExpand"
        class="h-3 w-3 mt-1.5 text-muted-foreground/60 transition-transform shrink-0"
        :class="expanded ? 'rotate-180' : ''"
      />
    </button>

    <!-- What it is and where it came from -->
    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
      <AppButton
        v-if="activationLabel"
        as="span"
        variant="tinted"
        tone="info"
        emphasis="soft"
        size="xs"
        :label="activationLabel"
      />
      <AppButton
        v-if="categoryLabel"
        as="span"
        variant="tinted"
        tone="neutral"
        emphasis="soft"
        size="xs"
        :label="categoryLabel"
      />
      <span v-if="isSubclass" class="text-label text-primary/70">{{ grantedBy.subclass }}</span>
      <span v-if="levelText" class="text-label text-muted-foreground">{{ levelText }}</span>
      <span v-if="spendsText" class="text-label text-muted-foreground">{{ spendsText }}</span>
    </div>

    <FeatureUsesControl
      v-if="usesView"
      :label="usesView.label"
      :remaining="usesView.remaining"
      :max="usesView.max"
      :recharge="usesView.recharge"
      :pool="usesView.pool"
      :readonly="readonly"
      @spend="(amount: number) => emit('spend', usesView!.key, amount)"
      @restore="(amount: number) => emit('restore', usesView!.key, amount)"
    />

    <!-- Picks already made for this feature's choices -->
    <dl v-if="picks.length > 0" class="space-y-1">
      <div v-for="pick in picks" :key="pick.key" class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <dt class="text-label text-muted-foreground">{{ pick.label }}</dt>
        <dd class="flex flex-wrap gap-1.5">
          <AppButton
            v-for="value in pick.values"
            :key="value"
            as="span"
            variant="tinted"
            tone="primary"
            emphasis="soft"
            size="xs"
            :label="value"
          />
        </dd>
      </div>
    </dl>

    <div v-if="canExpand && expanded" class="rounded-md bg-muted/30 border border-border/60 px-3 py-2">
      <RichTextViewer :content="description!" />
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { IconChevronDown, IconGenerate } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import FeatureUsesControl from "@/components/features/FeatureUsesControl.vue";
import type { FeaturePick } from "@/components/features/featurePicks";
import type { GrantedFeature, ResourcePool } from "@/rules/features/characterFeatures";
import { costsOf } from "@/rules/features/resolve";
import type { Activation, FeatCategory, Recharge } from "@/rules/features/mechanics.types";
import type { Remaining } from "@/rules/features/uses";

/**
 * One feature or feat on the Features tab (#976): its name with the current
 * scaling value, how it is used, where it came from, what it spends, its uses,
 * the picks made for it and its text. The DM and the player read the same card.
 */
const { granted, pools, remaining, picks = [], variant = null, readonly = false } = defineProps<{
  granted: GrantedFeature;
  pools: readonly ResourcePool[];
  /** What is left in a pool, as `useFeatureUses.remaining` answers. */
  remaining: (key: string) => Remaining;
  picks?: FeaturePick[];
  /** An origin feat's variant ("Wizard" for Magic Initiate), shown with its name. */
  variant?: string | null;
  readonly?: boolean;
}>();

const emit = defineEmits<{
  spend: [key: string, amount: number];
  restore: [key: string, amount: number];
  "navigate-spells": [];
}>();

const ACTIVATION_LABEL: Record<Activation, string> = {
  action: "Action",
  bonus_action: "Bonus Action",
  reaction: "Reaction",
  special: "Special",
};

const CATEGORY_LABEL: Record<FeatCategory, string> = {
  origin: "Origin",
  general: "General",
  fighting_style: "Fighting Style",
  epic_boon: "Epic Boon",
};

const feature = computed(() => granted.feature);
const description = computed(() => feature.value.description);

const title = computed(() => {
  const name = variant === null ? feature.value.name : `${feature.value.name} (${variant})`;
  return granted.scalingValue === null ? name : `${name} · ${granted.scalingValue}`;
});

const activationLabel = computed(() =>
  granted.mechanics.activation ? ACTIVATION_LABEL[granted.mechanics.activation] : null,
);

const categoryLabel = computed(() =>
  granted.grant.kind === "feat" && feature.value.feat_category ? CATEGORY_LABEL[feature.value.feat_category] : null,
);

const isSubclass = computed(() => granted.grant.kind === "subclass");
const grantedBy = computed(() => ({
  subclass: granted.grant.kind === "subclass" && granted.grant.subclassName ? granted.grant.subclassName : "Subclass",
}));

const levelText = computed(() => {
  const grant = granted.grant;
  if (grant.kind === "feat") {
    if (grant.via === "origin") return "Origin feat";
    return grant.atLevel === null ? null : `Level ${grant.atLevel}`;
  }
  if (grant.levelsGained.length === 0) return null;
  return grant.levelsGained.length === 1
    ? `Level ${grant.levelsGained[0]}`
    : `Levels ${grant.levelsGained.join(", ")}`;
});

function poolLabel(key: string): string {
  return pools.find((p) => p.key === key)?.label ?? key.replace(/_/g, " ");
}

const spendsText = computed(() => {
  const costs = costsOf(granted.mechanics);
  if (costs.length === 0) return null;
  return `Spends ${costs.map((c) => `${c.amount} ${poolLabel(c.key)}`).join(", ")}`;
});

/** The pool this feature's own `uses` feeds; a shared pool shows on every feature that grants it. */
const usesView = computed(() => {
  const uses = granted.mechanics.uses;
  if (!uses) return null;
  const pool = pools.find((p) => p.key === uses.key);
  if (!pool) return null;
  const left = remaining(pool.key);
  // A pool the rest handler has not written yet is full, as reconcile will make it.
  return {
    key: pool.key,
    label: pool.label,
    remaining: left === null ? pool.max : left,
    max: pool.max,
    recharge: pool.recharge,
    pool: pool.pool,
  } satisfies { key: string; label: string; remaining: number | "unlimited"; max: number | "unlimited"; recharge: Recharge; pool: boolean };
});

const isSpellcasting = computed(() => {
  if (granted.grant.kind === "feat") return false;
  const name = feature.value.name.toLowerCase();
  return name.includes("spellcasting") || name === "pact magic";
});

const canExpand = computed(() => !isSpellcasting.value && !!description.value);
const expanded = ref(false);

function onHeaderClick() {
  if (isSpellcasting.value) emit("navigate-spells");
  else if (canExpand.value) expanded.value = !expanded.value;
}
</script>
