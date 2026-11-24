<template>
  <ul class="m-0 flex list-none flex-col gap-3 p-0">
    <li v-for="(group, index) in groups" :key="index" class="flex flex-col gap-1.5" data-testid="tonight-group">
      <span v-if="group.at === null" class="text-eyebrow text-muted-foreground">Not placed anywhere yet</span>
      <span v-else class="flex items-center gap-2 text-eyebrow text-muted-foreground">
        Where
        <template v-for="where in [named(group.at)]" :key="'w'">
          <CanonRef v-if="where !== null && where.name !== null" :kind="where.kind" :name="where.name" />
        </template>
      </span>
      <ul class="m-0 flex list-none flex-col gap-1 p-0">
        <li v-for="item in group.items" :key="itemKey(item)" class="flex min-w-0 flex-col" data-testid="tonight-item">
          <slot :item="item" />
        </li>
      </ul>
    </li>
  </ul>
</template>

<script setup lang="ts" generic="T">
/** Items grouped by where they lie or come out: the place, person or beat named by its chip, "Not placed anywhere yet" last. */
import CanonRef from "@/components/canon/CanonRef.vue";
import { useClueWhere } from "@/composables/canon/useClueWhere";
import type { TonightGroup, TonightWhere } from "@/lib/canon/canonTonight";

const { groups, itemKey } = defineProps<{ groups: readonly TonightGroup<T>[]; itemKey: (item: T) => string }>();

const whereOf = useClueWhere();
const named = (at: TonightWhere) => whereOf.value(at);
</script>
