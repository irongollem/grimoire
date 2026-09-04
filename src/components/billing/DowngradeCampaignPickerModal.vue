<template>
  <!--
    `dismissable: false` — the only one of these that genuinely cannot be
    waved away. The account is already on the free plan; until a campaign is
    chosen the app has more active campaigns than the plan allows, so there is
    no state to return to. Every other dialog in the app keeps Escape.
  -->
  <AppModal :open="show" size="md" :dismissable="false">
    <ModalHeader
      title="Choose your active campaign"
      :subtitle="`You're now on the free plan (${campaignLimit} active campaign). Select which campaign to keep — the rest will be archived and can be restored by upgrading.`"
      subtitle-role="body"
      :icon="IconArchive"
      tone="caution"
      header-class="px-6 py-5"
    />

    <!-- Campaign list -->
    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4 space-y-2">
      <AppButton
        v-for="c in allCampaigns"
        :key="c.id"
        variant="subtle"
        fill="muted"
        size="md"
        block
        class="justify-start text-left"
        :active="selected === c.id"
        @click="selected = c.id"
      >
        <span
          class="h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors"
          :class="selected === c.id ? 'border-primary bg-primary' : 'border-muted-foreground'"
        >
          <span v-if="selected === c.id" class="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
        </span>
        <div class="flex-1 min-w-0 flex flex-col items-start">
          <p class="font-cinzel text-sm font-semibold text-foreground truncate">
            {{ c.name }}
          </p>
          <p class="text-caption text-muted-foreground italic truncate">
            {{ c.setting }} · last updated {{ formatDate(c.updated_at) }}
          </p>
        </div>
      </AppButton>
    </div>

    <!-- Footer -->
    <div class="shrink-0 px-6 py-4 border-t border-border flex flex-col gap-2">
      <AppButton
        variant="primary"
        size="md"
        block
        :disabled="!selected || isArchiving"
        :label="isArchiving ? 'Archiving…' : `Keep &quot;${selectedCampaign?.name ?? ''}&quot; — archive the rest`"
        @click="confirm"
      />
      <AppButton
        variant="tinted"
        tone="caution"
        emphasis="outline"
        size="md"
        block
        label="Upgrade to Pro instead"
        @click="goUpgrade"
      />
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { IconArchive } from '@/lib/icons'
import { useAllDmCampaigns, useArchiveCampaign } from '@/composables/campaign/useCampaigns'
import { useCampaignStore } from '@/stores/campaign'
import AppButton from '@/components/common/AppButton.vue'
import AppModal from '@/components/common/AppModal.vue'
import ModalHeader from '@/components/common/ModalHeader.vue'

defineProps<{ show: boolean; campaignLimit: number }>()

const router = useRouter()
const campaignStore = useCampaignStore()
const { data: campaignData } = useAllDmCampaigns()
const { mutateAsync: archiveCampaign, isPending: isArchiving } = useArchiveCampaign()

const allCampaigns = computed(() => campaignData.value ?? [])
const selected = ref<string | null>(allCampaigns.value[0]?.id ?? null)
const selectedCampaign = computed(() => allCampaigns.value.find(c => c.id === selected.value))

async function confirm() {
  if (!selected.value) return
  const toArchive = allCampaigns.value.filter(c => c.id !== selected.value)
  await Promise.all(toArchive.map(c => archiveCampaign(c.id)))
  // Switch to the kept campaign if the current active one was archived
  if (campaignStore.activeCampaignId !== selected.value) {
    const kept = allCampaigns.value.find(c => c.id === selected.value)
    if (kept) campaignStore.switchToCampaign(kept)
  }
}

function goUpgrade() {
  router.push('/billing')
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
</script>
