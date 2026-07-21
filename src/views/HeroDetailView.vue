<template>
  <PageHeader :title="displayName" :description="hero ? subtitle : ''">
    <template v-if="hero" #actions>
      <RouterLink
        v-if="isAppAdmin"
        :to="`/hall-of-heroes/${hero.id}/edit`"
        class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
      >
        <IconEdit class="h-3.5 w-3.5" />
        Edit
      </RouterLink>
      <button
        type="button"
        :disabled="!hasCampaign || isImporting"
        :title="hasCampaign ? 'Add to current campaign' : 'No active campaign'"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 font-cinzel text-xs font-semibold tracking-wider text-primary-foreground hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        @click="handleImport"
      >
        <IconAdd class="h-3.5 w-3.5" />
        {{ isImporting ? "Adding…" : "Add to Campaign" }}
      </button>
    </template>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <template v-else-if="hero">
      <div class="grid grid-cols-1 gap-8 lg:grid-cols-[17.5rem_1fr]">
        <!-- Left column: portrait + identity -->
        <div class="space-y-4">
          <!-- Portrait -->
          <div class="overflow-hidden rounded-lg border border-border">
            <FocalImage
              v-if="hero.portrait_url"
              :src="hero.portrait_url"
              :focal-point="hero.portrait_focal_point"
              format="portrait"
              :alt="hero.name"
              class="w-full"
            />
            <div
              v-else
              class="flex aspect-2/3 w-full items-center justify-center bg-muted text-4xl font-cinzel font-bold text-muted-foreground/30"
            >
              {{ hero.name.charAt(0) }}
            </div>
          </div>

          <!-- Identity fields -->
          <dl class="space-y-2 text-sm">
            <div v-if="hero.race">
              <dt
                class="text-eyebrow font-semibold text-muted-foreground"
              >
                Species
              </dt>
              <dd class="font-fell">{{ hero.race }}</dd>
            </div>
            <div v-if="hero.alignment">
              <dt
                class="text-eyebrow font-semibold text-muted-foreground"
              >
                Alignment
              </dt>
              <dd class="font-fell">{{ hero.alignment }}</dd>
            </div>
            <div v-if="hero.occupation">
              <dt
                class="text-eyebrow font-semibold text-muted-foreground"
              >
                Occupation
              </dt>
              <dd class="font-fell">{{ hero.occupation }}</dd>
            </div>
            <div v-if="hero.age">
              <dt
                class="text-eyebrow font-semibold text-muted-foreground"
              >
                Age
              </dt>
              <dd class="font-fell">{{ hero.age }}</dd>
            </div>
            <div>
              <dt
                class="text-eyebrow font-semibold text-muted-foreground"
              >
                Status
              </dt>
              <dd
                class="font-fell capitalize"
                :style="{ color: STATUS_COLORS[hero.status] }"
              >
                {{ hero.status }}
              </dd>
            </div>
            <div>
              <dt
                class="text-eyebrow font-semibold text-muted-foreground"
              >
                Setting
              </dt>
              <dd class="font-fell">{{ settingLabel(hero.setting) }}</dd>
            </div>
          </dl>

          <!-- Tags -->
          <div v-if="hero.tags.length" class="flex flex-wrap gap-1">
            <span
              v-for="tag in hero.tags"
              :key="tag"
              class="rounded-full bg-muted px-2 py-0.5 font-fell text-xs text-muted-foreground"
              >{{ tag }}</span
            >
          </div>
        </div>

        <!-- Right column: lore -->
        <div class="space-y-6">
          <section v-if="hero.appearance">
            <h3
              class="mb-2 font-cinzel text-xs font-semibold tracking-wider text-muted-foreground uppercase"
            >
              Appearance
            </h3>
            <RichTextViewer :content="hero.appearance" />
          </section>

          <section v-if="hero.personality">
            <h3
              class="mb-2 font-cinzel text-xs font-semibold tracking-wider text-muted-foreground uppercase"
            >
              Personality
            </h3>
            <RichTextViewer :content="hero.personality" />
          </section>

          <section v-if="hero.backstory">
            <h3
              class="mb-2 font-cinzel text-xs font-semibold tracking-wider text-muted-foreground uppercase"
            >
              Backstory
            </h3>
            <RichTextViewer :content="hero.backstory" />
          </section>

          <section v-if="hero.notes && isAppAdmin">
            <h3
              class="mb-2 font-cinzel text-xs font-semibold tracking-wider text-muted-foreground uppercase"
            >
              DM Notes
            </h3>
            <RichTextViewer :content="hero.notes" />
          </section>

          <p
            v-if="!hero.appearance && !hero.personality && !hero.backstory"
            class="font-fell text-muted-foreground italic"
          >
            No lore recorded yet.
          </p>
        </div>
      </div>
    </template>
  </PageHeader>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { IconAdd, IconEdit } from '@/lib/icons';
import { useHallOfHero, useImportHero } from "@/composables/useHallOfHeroes";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import { DND_SETTINGS } from "@/data/dndSettings";

const STATUS_COLORS: Record<string, string> = {
  alive: "#22c55e",
  dead: "#ef4444",
  missing: "#f59e0b",
  unknown: "#6b7280",
};

const settingLabelMap = Object.fromEntries(
  DND_SETTINGS.map((s) => [s.value, s.label]),
);
function settingLabel(val: string) {
  return settingLabelMap[val] ?? val;
}

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const campaign = useCampaignStore();

const heroId = computed(() => route.params.id as string);
const isAppAdmin = computed(() => auth.isAppAdmin);
const hasCampaign = computed(() => !!campaign.activeCampaignId);

const { data: hero, isLoading } = useHallOfHero(heroId);
const { mutate: importHero } = useImportHero();
const isImporting = ref(false);

const displayName = computed(() => hero.value?.name ?? "Hero");
const subtitle = computed(() => {
  if (!hero.value) return "";
  return [hero.value.race, hero.value.occupation].filter(Boolean).join(" · ");
});

function handleImport() {
  if (!hero.value) return;
  isImporting.value = true;
  importHero(hero.value, {
    onSuccess: () => router.push("/npcs"),
    onError: () => {
      isImporting.value = false;
    },
  });
}
</script>
