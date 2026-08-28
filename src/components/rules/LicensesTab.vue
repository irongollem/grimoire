<template>
  <div class="space-y-8 overflow-y-auto h-full px-4 pt-4 pb-4 md:px-6 md:pt-6">
    <div class="max-w-3xl space-y-8">
      <p class="text-body text-foreground leading-relaxed">
        This Grimoire hosts open-licensed game content curated from several publishers,
        alongside content written for Grimoire directly. The sections below show what's
        here, who made it, and under which license. Content is used under the licenses
        shown; trademarks and product identity remain the property of their respective
        owners.
      </p>

      <div v-if="isLoading" class="flex justify-center py-12">
        <LoadingSpinner />
      </div>

      <p v-else-if="error" class="text-caption text-destructive italic">
        The attribution notices could not be loaded. They are still required reading —
        please retry rather than treating this page as empty.
      </p>

      <p v-else-if="!sources.length" class="text-caption text-muted-foreground italic">
        No content sources found.
      </p>

      <template v-else>
        <!-- Sources in this Grimoire -->
        <section class="space-y-5">
          <h2 class="text-heading-sm font-bold text-foreground">Sources in this Grimoire</h2>
          <div v-for="group in licenseGroups" :key="group.license.key" class="space-y-2">
            <div class="flex items-baseline gap-2">
              <span class="px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20 font-cinzel text-2xs text-primary whitespace-nowrap">
                {{ group.license.shortName }}
              </span>
              <span class="text-caption text-muted-foreground">{{ group.license.name }}</span>
            </div>
            <div class="space-y-2">
              <LicenseSourceCard v-for="source in group.sources" :key="source.key" :source="source" />
            </div>
          </div>
        </section>

        <!-- Grimoire original content -->
        <section v-if="unlicensed.length" class="space-y-2">
          <h2 class="text-heading-sm font-bold text-foreground">Grimoire original content</h2>
          <p class="text-caption text-muted-foreground italic">
            No third-party license is on record for this content — listed here for
            completeness, not because it carries one.
          </p>
          <div class="space-y-2">
            <LicenseSourceCard v-for="source in unlicensed" :key="source.key" :source="source" />
          </div>
        </section>

        <!-- Audio — a separate body of licensed work with its own credit shape:
             per-sound rather than per-document. The CC-BY groups genuinely
             require these credits to be published. -->
        <section v-if="audioGroups.length" class="space-y-2">
          <h2 class="text-heading-sm font-bold text-foreground">Audio</h2>
          <p class="text-caption text-muted-foreground italic">
            The soundboard ships {{ totalSounds.toLocaleString() }} sounds from open-licensed
            catalogues. Credits for the licences that require them are listed in full below.
          </p>
          <div class="space-y-2">
            <AudioLicenseCard v-for="group in audioGroups" :key="`${group.license}-${group.source}`" :group="group" />
          </div>
        </section>

        <!-- License texts -->
        <section class="space-y-6">
          <h2 class="text-heading-sm font-bold text-foreground">License texts</h2>
          <div v-for="license in presentLicenses" :key="license.key" class="space-y-2">
            <div class="flex items-baseline gap-2 flex-wrap">
              <h3 class="font-cinzel text-sm font-bold text-foreground">{{ license.name }}</h3>
              <a
                v-if="license.url"
                :href="license.url"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-1 text-caption text-primary hover:underline"
              >
                {{ license.url }}
                <IconExternalLink class="h-3 w-3" />
              </a>
            </div>
            <p class="text-body text-muted-foreground">{{ license.summary }}</p>

            <!-- A condition of the grant, not a footnote — rendered as a visible
                 quoted notice, e.g. the ORC License III(a) required statement. -->
            <blockquote
              v-if="license.requiredNotice"
              class="border-l-2 border-primary/50 pl-4 py-1 font-fell text-body text-foreground italic whitespace-pre-wrap"
            >
              {{ license.requiredNotice }}
            </blockquote>

            <!-- Full OGL 1.0a text — only when OGL content is actually present. -->
            <div
              v-if="license.key === 'ogl-10a' && section15Lines.length"
              class="mt-3 rounded-lg border border-border bg-card p-4 space-y-3 font-fell text-sm leading-relaxed text-foreground max-w-none"
            >
              <p class="font-cinzel text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {{ OGL_1_0A_TITLE }}
              </p>
              <p>{{ OGL_1_0A_PREAMBLE }}</p>
              <p v-for="(section, i) in oglSectionsToRender" :key="i" class="whitespace-pre-wrap">
                {{ i + 1 }}. {{ section }}
              </p>
              <div>
                <p class="font-semibold">15. COPYRIGHT NOTICE</p>
                <p v-for="(line, i) in section15Lines" :key="i" class="whitespace-pre-wrap">{{ line }}</p>
              </div>
            </div>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconExternalLink } from "@/lib/icons";
import { OGL_1_0A_TITLE, OGL_1_0A_PREAMBLE, OGL_1_0A_SECTIONS } from "@/data/ogl";
import { groupSourcesByLicense, unlicensedSources, oglSection15Chain } from "@/lib/library/contentLicenses";
import { useAudioLicenses, useContentLicenses } from "@/composables/library/useContentLicenses";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import LicenseSourceCard from "./LicenseSourceCard.vue";
import AudioLicenseCard from "./AudioLicenseCard.vue";

const { data, isLoading, error } = useContentLicenses();
const { data: audioData } = useAudioLicenses();

const sources = computed(() => data.value ?? []);
const audioGroups = computed(() => audioData.value ?? []);
const totalSounds = computed(() => audioGroups.value.reduce((sum, group) => sum + group.sound_count, 0));
const licenseGroups = computed(() => groupSourcesByLicense(sources.value));
const unlicensed = computed(() => unlicensedSources(sources.value));
const presentLicenses = computed(() => licenseGroups.value.map((g) => g.license));
const section15Lines = computed(() => oglSection15Chain(sources.value));

// Sections 1-14 verbatim. Section 15 (index 14) carries the license's own d20
// SRD chain — the app renders its own chain (section15Lines) in its place.
const oglSectionsToRender = OGL_1_0A_SECTIONS.slice(0, 14);
</script>
