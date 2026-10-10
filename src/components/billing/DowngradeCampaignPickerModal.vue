<template>
  <!--
    `dismissable: false`, the only one of these that genuinely cannot be
    waved away. The account is already over its limit; until a campaign is
    chosen the app has more active campaigns than it allows, so there is
    no state to return to. Every other dialog in the app keeps Escape.
  -->
  <AppModal :open="show" size="md" :dismissable="false">
    <ModalHeader
      title="Choose your active campaign"
      :subtitle="subtitle"
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
        <!-- w-full on each line: under items-start a line sizes to its own text,
             so truncate had no width to cut at and a long campaign name ran out
             of its card on a phone. -->
        <div class="flex-1 min-w-0 flex flex-col items-start">
          <p class="w-full text-heading-xs font-semibold text-foreground truncate">
            {{ c.name }}
          </p>
          <p class="w-full text-caption text-muted-foreground italic truncate">
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
        :label="isArchiving ? 'Archiving…' : `Keep &quot;${selectedCampaign?.name ?? ''}&quot; and archive the rest`"
        @click="confirm"
      />
      <!-- Never offered to a young player's account: a direct exhortation to a
           child to buy (or to get a parent to) is banned (UCPD Annex I, 28). -->
      <AppButton
        v-if="!childAccount"
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
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { IconArchive } from '@/lib/icons'
import { useAllDmCampaigns, useArchiveCampaign } from '@/composables/campaign/useCampaigns'
import { useCampaignStore } from '@/stores/campaign'
import AppButton from '@/components/common/controls/AppButton.vue'
import AppModal from '@/components/common/overlays/AppModal.vue'
import ModalHeader from '@/components/common/overlays/ModalHeader.vue'

/** `childAccount`: a young player's account, which must never be shown wording
 *  about plans, Pro or upgrading (#928), so it gets neutral copy and no upgrade
 *  button. The limit itself comes from `check_quota`, not from a plan name. */
const { campaignLimit, childAccount = false } = defineProps<{
  show: boolean;
  campaignLimit: number;
  childAccount?: boolean;
}>()

const subtitle = computed(() => {
  const campaigns = `${campaignLimit} active ${campaignLimit === 1 ? 'campaign' : 'campaigns'}`
  if (childAccount) {
    return `Your account can have ${campaigns}. Choose which to keep. The rest are archived, not deleted.`
  }
  return `You're now on the free plan (${campaigns}). Select which campaign to keep. The rest will be archived and can be restored by upgrading.`
})

const router = useRouter()
const campaignStore = useCampaignStore()
const { data: campaignData } = useAllDmCampaigns()
const { mutateAsync: archiveCampaign, isPending: isArchiving } = useArchiveCampaign()

// The demo campaign (#912) is not on the plan's count, so it is neither offered
// as the one to keep nor archived with the rest.
const allCampaigns = computed(() => (campaignData.value ?? []).filter(c => c.demo_source === null))

/**
 * Which campaign the DM keeps. Seeded from the list rather than at setup: this
 * modal is mounted by `DefaultLayout` as soon as the campaign quota is known,
 * whether or not it is shown, so its setup can run before `useAllDmCampaigns`
 * resolves. Reading `allCampaigns.value[0]` there always saw an empty array and
 * left the picker permanently unselected, with the confirm button disabled
 * until the DM clicked a row by hand.
 *
 * `watch` rather than a `computed`, because this is a default the DM then
 * overrides; it fills only while nothing is chosen, and never moves a choice
 * they have already made.
 */
const selected = ref<string | null>(null)
watch(allCampaigns, (campaigns) => {
  if (selected.value === null) selected.value = campaigns[0]?.id ?? null
}, { immediate: true })
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
