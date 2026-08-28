<template>
  <div class="flex flex-col gap-4">
    <p class="text-body text-muted-foreground">
      Toggle which classes are available when creating party members. Disabled classes are hidden from the class picker.
      Custom classes are always available.
    </p>

    <div v-if="systemClasses" class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-4 py-3 border-b border-border bg-muted/20">
        <span class="text-label-lg font-semibold text-muted-foreground">Reference Classes</span>
      </div>
      <div class="divide-y divide-border">
        <AppCheckbox
          v-for="cls in systemClasses"
          :key="cls.class_name"
          :model-value="!disabled.has(cls.class_name)"
          class="gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors"
          label-layout="row"
          @update:model-value="toggle(cls.class_name)"
        >
          <span class="flex-1">{{ cls.class_name }}</span>
          <span
            v-if="disabled.has(cls.class_name)"
            class="text-label text-muted-foreground/60 shrink-0"
          >hidden</span>
        </AppCheckbox>
      </div>
    </div>

    <div v-if="disabled.size > 0" class="flex items-center justify-between">
      <p class="text-caption text-muted-foreground italic">
        {{ disabled.size }} class{{ disabled.size === 1 ? '' : 'es' }} hidden from party member picker.
      </p>
      <AppButton
        variant="ghost"
        tone="primary"
        size="inline-xs"
        label="Enable all"
        class="text-primary/70"
        @click="enableAll"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import { useCampaignStore } from "@/stores/campaign";
import { useUpdateCampaign } from "@/composables/campaign/useCampaigns";
import { useAllSystemClasses } from "@/composables/rules/useCustomClasses";

const campaign = useCampaignStore();
const { mutate: updateCampaign } = useUpdateCampaign();
const { data: systemClasses } = useAllSystemClasses();

const disabled = ref(new Set<string>(campaign.activeCampaign?.disabled_class_names ?? []));

watch(
  () => campaign.activeCampaign?.disabled_class_names,
  (val) => { disabled.value = new Set(val ?? []); },
);

function persist() {
  if (!campaign.activeCampaignId) return;
  updateCampaign({ id: campaign.activeCampaignId, update: { disabled_class_names: [...disabled.value] } });
}

function toggle(className: string) {
  if (disabled.value.has(className)) disabled.value.delete(className);
  else disabled.value.add(className);
  disabled.value = new Set(disabled.value); // trigger reactivity
  persist();
}

function enableAll() {
  disabled.value = new Set();
  persist();
}
</script>
