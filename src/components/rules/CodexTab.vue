<template>
  <div class="flex flex-col gap-4">
    <!-- Section pills. The selected one used to be a `bg-card` chip in a
         `bg-muted` trough, which was a fourth rival "selected" treatment; the
         app has one, AppButton's gold `active` tint, and SegmentedControl is
         where it lives. Roving focus and arrow-key navigation come with it. -->
    <SegmentedControl
      :model-value="codexSection"
      :options="CODEX_SECTIONS"
      size="sm"
      @update:model-value="(v) => (codexSection = v)"
    />

    <!-- ── Species ── -->
    <div v-if="codexSection === 'species'">
      <p v-if="!allSpecies?.length" class="text-center text-body text-muted-foreground italic py-12">
        No species in the campaign yet.
      </p>
      <div v-else class="grid grid-cols-2 md:grid-cols-3 gap-2">
        <CodexCard
          v-for="species in allSpecies"
          :key="species.id"
          :image-url="species.image_url"
          :focal-point="species.focal_point ?? null"
          :fallback-icon="IconParty"
          :title="species.name"
          :badge="species.size ?? undefined"
          :count="species.subraces?.length ? `${species.subraces.length}v` : undefined"
          @click="selectedSpecies = species"
        />
      </div>

      <AppModal :open="!!selectedSpecies" size="lg" :labelled-by="speciesHeadingId" @close="selectedSpecies = null">
        <!-- Header. Hand-rolled rather than `ModalHeader`: the size/variant-count
             row is a set of pill badges, not a single subtitle string. -->
        <div v-if="selectedSpecies" class="flex shrink-0 items-start gap-3 px-5 py-4 border-b border-border">
          <div class="flex-1 min-w-0">
            <h2 :id="speciesHeadingId" class="text-heading font-bold text-foreground">{{ selectedSpecies.name }}</h2>
            <div class="flex flex-wrap gap-1.5 mt-1">
              <span v-if="selectedSpecies.size" class="px-1.5 py-0.5 rounded bg-muted font-cinzel text-2xs text-muted-foreground capitalize">{{ selectedSpecies.size }}</span>
              <span v-if="selectedSpecies.subraces?.length" class="px-1.5 py-0.5 rounded bg-muted font-cinzel text-2xs text-muted-foreground/60">{{ selectedSpecies.subraces.length }} variant{{ selectedSpecies.subraces.length > 1 ? "s" : "" }}</span>
            </div>
          </div>
          <AppButton variant="ghost" fill="muted" size="icon-sm" class="shrink-0" aria-label="Close" :icon="IconClose" icon-size="md" @click="selectedSpecies = null" />
        </div>
        <div v-if="selectedSpecies" class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <div class="grid grid-cols-1 md:grid-cols-2 md:divide-x md:divide-border">
                  <div class="flex flex-col gap-4 p-5">
                    <div v-if="selectedSpecies.image_url" class="rounded-lg overflow-hidden bg-muted">
                      <FocalImage :src="selectedSpecies.image_url" :alt="selectedSpecies.name" format="landscape" :focal-point="selectedSpecies.focal_point ?? null" lightbox />
                    </div>
                    <RichTextViewer v-if="isRichText(selectedSpecies.description)" :content="selectedSpecies.description!" />
                    <p v-else-if="selectedSpecies.description" class="text-body text-muted-foreground">{{ selectedSpecies.description }}</p>
                    <p v-else class="text-body text-muted-foreground italic">No description.</p>
                  </div>
                  <div class="flex flex-col gap-4 p-5 border-t border-border md:border-t-0">
                    <div v-if="selectedSpecies.speed">
                      <p class="text-eyebrow font-semibold text-muted-foreground mb-1.5">SPEED</p>
                      <div class="flex flex-wrap gap-2">
                        <span v-for="(val, mode) in selectedSpecies.speed" :key="mode" class="px-2 py-0.5 rounded bg-muted font-cinzel text-2xs text-muted-foreground capitalize">{{ mode }} {{ val }} ft</span>
                      </div>
                    </div>
                    <div v-if="selectedSpecies.ability_score_increases && Object.keys(selectedSpecies.ability_score_increases).length">
                      <p class="text-eyebrow font-semibold text-muted-foreground mb-1.5">ABILITY SCORE INCREASES</p>
                      <div class="flex flex-wrap gap-1.5">
                        <span v-for="(val, key) in selectedSpecies.ability_score_increases" :key="key" class="px-2 py-0.5 rounded bg-primary/10 border border-primary/20 font-cinzel text-xs text-primary uppercase">{{ typeof val === "number" ? `${key} +${val}` : val }}</span>
                      </div>
                    </div>
                    <div v-if="selectedSpecies.traits?.length">
                      <p class="text-eyebrow font-semibold text-muted-foreground mb-1.5">TRAITS</p>
                      <div class="flex flex-col gap-1">
                        <div v-for="trait in selectedSpecies.traits" :key="trait.name" class="rounded-md border border-border overflow-hidden">
                          <AppButton
                            variant="menu"
                            size="md"
                            block
                            :class="trait.description ? 'cursor-pointer' : 'cursor-default'"
                            @click="trait.description && toggle(`sp:${selectedSpecies!.id}:t:${trait.name}`)"
                          >
                            <IconChevronRight v-if="trait.description" class="h-3 w-3 shrink-0 text-muted-foreground/60 transition-transform" :class="open.has(`sp:${selectedSpecies.id}:t:${trait.name}`) ? 'rotate-90' : ''" />
                            <span class="text-body text-foreground">{{ trait.name }}</span>
                          </AppButton>
                          <div v-if="trait.description && open.has(`sp:${selectedSpecies.id}:t:${trait.name}`)" class="px-3 pb-3 border-t border-border">
                            <RichTextViewer v-if="isRichText(trait.description)" :content="trait.description" class="mt-2" />
                            <p v-else class="text-body text-muted-foreground mt-2">{{ trait.description }}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div v-if="selectedSpecies.languages?.length">
                      <p class="text-eyebrow font-semibold text-muted-foreground mb-1.5">LANGUAGES</p>
                      <div class="flex flex-wrap gap-1.5">
                        <span v-for="lang in selectedSpecies.languages" :key="lang" class="px-2 py-0.5 rounded bg-muted text-caption text-muted-foreground">{{ lang }}</span>
                      </div>
                    </div>
                    <div v-if="selectedSpecies.subraces?.length">
                      <p class="text-eyebrow font-semibold text-muted-foreground mb-1.5">VARIANTS</p>
                      <div class="flex flex-col gap-1.5">
                        <div v-for="sub in selectedSpecies.subraces" :key="sub.name" class="rounded-md border border-border overflow-hidden">
                          <AppButton variant="menu" size="md" block @click="toggle(`sp:${selectedSpecies!.id}:sr:${sub.name}`)">
                            <IconChevronRight class="h-3 w-3 shrink-0 text-muted-foreground/60 transition-transform" :class="open.has(`sp:${selectedSpecies.id}:sr:${sub.name}`) ? 'rotate-90' : ''" />
                            <span class="font-cinzel text-xs font-semibold text-foreground">{{ sub.name }}</span>
                          </AppButton>
                          <div v-if="open.has(`sp:${selectedSpecies.id}:sr:${sub.name}`)" class="px-3 pb-3 border-t border-border flex flex-col gap-2 pt-2">
                            <div v-if="sub.description" class="text-body text-muted-foreground">
                              <RichTextViewer v-if="isRichText(sub.description)" :content="sub.description" />
                              <p v-else class="italic">{{ sub.description }}</p>
                            </div>
                            <div v-if="sub.traits?.length" class="flex flex-col gap-1">
                              <div v-for="trait in sub.traits" :key="trait.name" class="rounded border border-border/60 overflow-hidden">
                                <AppButton
                                  variant="menu"
                                  size="sm"
                                  block
                                  :class="trait.description ? 'cursor-pointer' : 'cursor-default'"
                                  @click="trait.description && toggle(`sp:${selectedSpecies!.id}:sr:${sub.name}:t:${trait.name}`)"
                                >
                                  <IconChevronRight v-if="trait.description" class="h-2.5 w-2.5 shrink-0 text-muted-foreground/60 transition-transform" :class="open.has(`sp:${selectedSpecies.id}:sr:${sub.name}:t:${trait.name}`) ? 'rotate-90' : ''" />
                                  <span class="text-body text-foreground">{{ trait.name }}</span>
                                </AppButton>
                                <div v-if="trait.description && open.has(`sp:${selectedSpecies.id}:sr:${sub.name}:t:${trait.name}`)" class="px-2.5 pb-2.5 border-t border-border/60">
                                  <RichTextViewer v-if="isRichText(trait.description)" :content="trait.description" class="mt-2" />
                                  <p v-else class="text-body text-muted-foreground mt-2">{{ trait.description }}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
      </AppModal>
    </div>

    <!-- ── Backgrounds ── -->
    <div v-else-if="codexSection === 'backgrounds'">
      <p v-if="!allBackgrounds?.length" class="text-center text-body text-muted-foreground italic py-12">
        No backgrounds in the campaign yet.
      </p>
      <div v-else class="grid grid-cols-2 md:grid-cols-3 gap-2">
        <CodexCard
          v-for="bg in allBackgrounds"
          :key="bg.id"
          :image-url="bg.image_url"
          :focal-point="bg.focal_point ?? null"
          :fallback-icon="IconQuest"
          :title="bg.name"
          :meta="bg.source_title ?? undefined"
          @click="selectedBackground = bg"
        />
      </div>

      <AppModal :open="!!selectedBackground" size="lg" :labelled-by="backgroundHeadingId" @close="selectedBackground = null">
        <!-- Header. Hand-rolled rather than `ModalHeader` for consistency with
             the other three Codex dialogs in this file (species/classes/deities),
             whose header rows carry badges `ModalHeader`'s subtitle cannot. -->
        <div v-if="selectedBackground" class="flex shrink-0 items-start gap-3 px-5 py-4 border-b border-border">
          <div class="flex-1 min-w-0">
            <h2 :id="backgroundHeadingId" class="text-heading font-bold text-foreground">{{ selectedBackground.name }}</h2>
            <span v-if="selectedBackground.source_title" class="text-label text-muted-foreground">{{ selectedBackground.source_title }}</span>
          </div>
          <AppButton variant="ghost" fill="muted" size="icon-sm" class="shrink-0" aria-label="Close" :icon="IconClose" icon-size="md" @click="selectedBackground = null" />
        </div>
        <div v-if="selectedBackground" class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <div class="grid grid-cols-1 md:grid-cols-2 md:divide-x md:divide-border">
                  <div class="flex flex-col gap-4 p-5">
                    <div v-if="selectedBackground.image_url" class="rounded-lg overflow-hidden bg-muted">
                      <FocalImage :src="selectedBackground.image_url" :alt="selectedBackground.name" format="landscape" :focal-point="selectedBackground.focal_point ?? null" lightbox />
                    </div>
                    <RichTextViewer v-if="isRichText(selectedBackground.description)" :content="selectedBackground.description!" />
                    <p v-else-if="selectedBackground.description" class="text-body text-muted-foreground">{{ selectedBackground.description }}</p>
                    <p v-else class="text-body text-muted-foreground italic">No description.</p>
                  </div>
                  <div class="flex flex-col gap-4 p-5 border-t border-border md:border-t-0">
                    <!-- Ability score trio (2024 PHB) -->
                    <div v-if="selectedBackground.asi_ability_trio" class="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-1">
                      <div class="flex items-center gap-2">
                        <p class="text-eyebrow font-semibold text-primary">ABILITY SCORE INCREASE</p>
                        <span class="text-label text-primary/60">2024 PHB</span>
                      </div>
                      <div class="flex flex-wrap gap-1.5">
                        <span
                          v-for="key in selectedBackground.asi_ability_trio"
                          :key="key"
                          class="px-2 py-0.5 rounded bg-primary/10 border border-primary/20 font-cinzel text-xs text-primary capitalize"
                        >{{ key }}</span>
                      </div>
                    </div>

                    <!-- Feat grant (2024 PHB) -->
                    <BackgroundOriginFeatBadge v-if="selectedBackground.origin_feat" :origin-feat="selectedBackground.origin_feat">
                      <RichTextViewer v-if="selectedBackground.feat_grant_description" :content="selectedBackground.feat_grant_description" />
                    </BackgroundOriginFeatBadge>
                    <div v-else-if="selectedBackground.feat_grant_name"
                      class="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-1">
                      <div class="flex items-center gap-2">
                        <p class="text-eyebrow font-semibold text-amber-600 dark:text-amber-400">FEAT GRANT</p>
                        <span class="text-label text-amber-600/60 dark:text-amber-400/60">2024 PHB</span>
                      </div>
                      <p class="font-cinzel text-sm font-bold text-foreground">{{ selectedBackground.feat_grant_name }}</p>
                      <RichTextViewer v-if="selectedBackground.feat_grant_description" :content="selectedBackground.feat_grant_description" />
                    </div>
                    <div v-if="selectedBackground.skill_proficiencies?.length">
                      <p class="text-eyebrow font-semibold text-muted-foreground mb-1.5">SKILL PROFICIENCIES</p>
                      <div class="flex flex-wrap gap-1.5">
                        <span v-for="s in selectedBackground.skill_proficiencies" :key="s" class="px-2 py-0.5 rounded bg-primary/10 border border-primary/20 font-cinzel text-xs text-primary">{{ s }}</span>
                      </div>
                    </div>
                    <div v-if="selectedBackground.tool_proficiencies?.length">
                      <p class="text-eyebrow font-semibold text-muted-foreground mb-1.5">TOOL PROFICIENCIES</p>
                      <div class="flex flex-wrap gap-1.5">
                        <span v-for="t in selectedBackground.tool_proficiencies" :key="t" class="px-2 py-0.5 rounded bg-muted text-caption text-muted-foreground">{{ t }}</span>
                      </div>
                    </div>
                    <div v-if="selectedBackground.languages?.length">
                      <p class="text-eyebrow font-semibold text-muted-foreground mb-1.5">LANGUAGES</p>
                      <div class="flex flex-wrap gap-1.5">
                        <span v-for="l in selectedBackground.languages" :key="l" class="px-2 py-0.5 rounded bg-muted text-caption text-muted-foreground">{{ l }}</span>
                      </div>
                    </div>
                    <div v-if="selectedBackground.equipment">
                      <p class="text-eyebrow font-semibold text-muted-foreground mb-1.5">EQUIPMENT</p>
                      <p class="text-body text-muted-foreground">{{ selectedBackground.equipment }}</p>
                    </div>
                    <div v-if="selectedBackground.feature_name">
                      <p class="text-eyebrow font-semibold text-muted-foreground mb-1.5">FEATURE</p>
                      <p class="font-cinzel text-xs font-semibold text-foreground mb-1">{{ selectedBackground.feature_name }}</p>
                      <p v-if="selectedBackground.feature_description" class="text-body text-muted-foreground">{{ selectedBackground.feature_description }}</p>
                    </div>
                  </div>
                </div>
        </div>
      </AppModal>
    </div>

    <!-- ── Classes ── -->
    <div v-else-if="codexSection === 'classes'">
      <p v-if="!mergedClasses.length" class="text-center text-body text-muted-foreground italic py-12">
        No classes in the campaign yet.
      </p>
      <div v-else class="grid grid-cols-2 md:grid-cols-3 gap-2">
        <CodexCard
          v-for="cls in mergedClasses"
          :key="cls.class_name"
          :fallback-icon="IconPopulate"
          :title="cls.class_name"
          :badge="`d${cls.hit_die}`"
          :count="subclassesFor(cls.class_name).length ? `${subclassesFor(cls.class_name).length} subclass${subclassesFor(cls.class_name).length > 1 ? 'es' : ''}` : undefined"
          @click="selectedClass = cls"
        />
      </div>

      <AppModal :open="!!selectedClass" size="lg" :labelled-by="classHeadingId" @close="selectedClass = null">
        <!-- Header. Hand-rolled rather than `ModalHeader` for consistency with
             the other three Codex dialogs in this file — see the species header
             above. -->
        <div v-if="selectedClass" class="flex shrink-0 items-start gap-3 px-5 py-4 border-b border-border">
          <div class="flex-1 min-w-0">
            <h2 :id="classHeadingId" class="text-heading font-bold text-foreground">{{ selectedClass.class_name }}</h2>
            <div class="flex flex-wrap gap-1.5 mt-1">
              <span class="px-1.5 py-0.5 rounded bg-muted font-cinzel text-2xs text-muted-foreground">d{{ selectedClass.hit_die }}</span>
              <span v-if="subclassesFor(selectedClass.class_name).length" class="px-1.5 py-0.5 rounded bg-muted font-cinzel text-2xs text-muted-foreground/60">
                {{ subclassesFor(selectedClass.class_name).length }} subclass{{ subclassesFor(selectedClass.class_name).length > 1 ? "es" : "" }}
              </span>
            </div>
          </div>
          <AppButton variant="ghost" fill="muted" size="icon-sm" class="shrink-0" aria-label="Close" :icon="IconClose" icon-size="md" @click="selectedClass = null" />
        </div>
        <div v-if="selectedClass" class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <div class="grid grid-cols-1 md:grid-cols-2 md:divide-x md:divide-border">
                  <!-- Left: quick stats + subclasses -->
                  <div class="flex flex-col gap-4 p-5">
                    <div class="grid grid-cols-2 gap-3">
                      <div v-if="selectedClass.primary_ability">
                        <p class="text-eyebrow text-muted-foreground mb-0.5">PRIMARY</p>
                        <p class="text-body text-foreground">{{ selectedClass.primary_ability }}</p>
                      </div>
                      <div v-if="selectedClass.saving_throws?.length">
                        <p class="text-eyebrow text-muted-foreground mb-0.5">SAVING THROWS</p>
                        <p class="text-body text-foreground">{{ selectedClass.saving_throws.join(", ") }}</p>
                      </div>
                      <div v-if="selectedClass.armor_proficiencies?.length">
                        <p class="text-eyebrow text-muted-foreground mb-0.5">ARMOR</p>
                        <p class="text-body text-foreground">{{ selectedClass.armor_proficiencies.join(", ") }}</p>
                      </div>
                      <div v-if="selectedClass.weapon_proficiencies?.length">
                        <p class="text-eyebrow text-muted-foreground mb-0.5">WEAPONS</p>
                        <p class="text-body text-foreground">{{ selectedClass.weapon_proficiencies.join(", ") }}</p>
                      </div>
                      <div>
                        <p class="text-eyebrow text-muted-foreground mb-0.5">SUBCLASS AT</p>
                        <p class="text-body text-foreground">Level {{ selectedClass.subclass_level }}</p>
                      </div>
                    </div>
                    <div v-if="subclassesFor(selectedClass.class_name).length">
                      <p class="text-eyebrow font-semibold text-muted-foreground mb-1.5">SUBCLASSES</p>
                      <div class="flex flex-col gap-1.5">
                        <div v-for="sub in subclassesFor(selectedClass.class_name)" :key="sub.subclass_name" class="rounded-md border border-border overflow-hidden">
                          <AppButton variant="menu" size="md" block @click="toggle(`sub:${selectedClass!.class_name}:${sub.subclass_name}`)">
                            <IconChevronRight class="h-3 w-3 shrink-0 text-muted-foreground/60 transition-transform" :class="open.has(`sub:${selectedClass.class_name}:${sub.subclass_name}`) ? 'rotate-90' : ''" />
                            <span class="font-cinzel text-xs font-semibold text-foreground">{{ sub.subclass_name }}</span>
                          </AppButton>
                          <div v-if="open.has(`sub:${selectedClass.class_name}:${sub.subclass_name}`)" class="px-3 pb-3 border-t border-border pt-2">
                            <div v-if="Object.keys(sub.features ?? {}).length" class="flex flex-col gap-1">
                              <div v-for="lvl in sortedLevels(sub.features)" :key="lvl" class="flex gap-3 py-1">
                                <span class="text-label text-muted-foreground w-10 shrink-0 pt-0.5">Lv {{ lvl }}</span>
                                <div class="flex flex-wrap gap-1">
                                  <span v-for="name in resolveFeatures(sub.features[String(lvl)])" :key="name" class="inline-flex items-center rounded border bg-muted/50 border-border/60 px-1.5 py-0.5 text-caption text-foreground">{{ name }}</span>
                                </div>
                              </div>
                            </div>
                            <p v-else class="text-caption text-muted-foreground italic">No features defined.</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <!-- Right: class features by level -->
                  <div class="flex flex-col gap-4 p-5 border-t border-border md:border-t-0">
                    <div v-if="Object.keys(selectedClass.features ?? {}).length">
                      <p class="text-eyebrow font-semibold text-muted-foreground mb-1.5">CLASS FEATURES</p>
                      <div class="flex flex-col gap-1">
                        <div v-for="lvl in sortedLevels(selectedClass.features)" :key="lvl" class="flex gap-3 px-2 py-1.5 rounded bg-muted/30">
                          <span class="text-label text-muted-foreground w-10 shrink-0 pt-0.5">Lv {{ lvl }}</span>
                          <div class="flex flex-wrap gap-1">
                            <span v-for="name in resolveFeatures(selectedClass.features[String(lvl)])" :key="name" class="inline-flex items-center rounded border bg-card border-border px-1.5 py-0.5 text-caption text-foreground">{{ name }}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <p v-else class="text-body text-muted-foreground italic">No class features defined.</p>
                  </div>
                </div>
        </div>
      </AppModal>
    </div>

    <!-- ── Deities ── -->
    <div v-else-if="codexSection === 'deities'">
      <div v-if="deitiesLoading" class="flex justify-center py-16">
        <LoadingSpinner />
      </div>
      <p v-else-if="!visibleDeities.length" class="text-center text-body text-muted-foreground italic py-12">
        No deities have been revealed to you yet.
      </p>
      <template v-else>
        <AppInput
          v-model="deitySearch"
          type="search"
          placeholder="Filter deities…"
          tone="card"
          size="body"
          class="mb-3"
        />
        <p v-if="!filteredDeities.length" class="text-body text-muted-foreground italic text-center py-6">
          No deities match your filter.
        </p>
        <div v-else class="grid grid-cols-2 md:grid-cols-3 gap-2">
          <CodexCard
            v-for="deity in filteredDeities"
            :key="deity.id"
            :image-url="deity.portrait_url"
            :focal-point="deity.portrait_focal_point ?? null"
            :fallback-icon="IconSun"
            :title="deity.name"
            :subtitle="deity.titles ?? undefined"
            :meta="deity.pantheon?.name ?? undefined"
            @click="selectedDeity = deity"
          />
        </div>
      </template>

      <AppModal :open="!!selectedDeity" size="lg" :labelled-by="deityHeadingId" @close="selectedDeity = null">
        <!-- Header. Hand-rolled rather than `ModalHeader` for consistency with
             the other three Codex dialogs in this file — see the species header
             above. -->
        <div v-if="selectedDeity" class="flex shrink-0 items-start gap-3 px-5 py-4 border-b border-border">
          <div class="flex-1 min-w-0">
            <h2 :id="deityHeadingId" class="text-heading font-bold text-foreground">{{ selectedDeity.name }}</h2>
            <div class="flex flex-wrap items-center gap-2 mt-1">
              <span v-if="selectedDeity.titles" class="text-caption text-muted-foreground italic">{{ selectedDeity.titles }}</span>
              <span v-if="selectedDeity.pantheon?.name" class="px-1.5 py-0.5 rounded bg-muted text-label text-muted-foreground">{{ selectedDeity.pantheon.name }}</span>
            </div>
          </div>
          <AppButton variant="ghost" fill="muted" size="icon-sm" class="shrink-0" aria-label="Close" :icon="IconClose" icon-size="md" @click="selectedDeity = null" />
        </div>
        <div v-if="selectedDeity" class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <div class="grid grid-cols-1 md:grid-cols-2 md:divide-x md:divide-border">
                  <!-- Left: portrait + symbol + domains -->
                  <div class="flex flex-col gap-4 p-5">
                    <div v-if="selectedDeity.portrait_url" class="rounded-lg overflow-hidden bg-muted">
                      <FocalImage :src="selectedDeity.portrait_url" :alt="selectedDeity.name" format="landscape" :focal-point="selectedDeity.portrait_focal_point ?? null" lightbox />
                    </div>
                    <div v-if="selectedDeity.symbol_image_url" class="flex justify-center">
                      <img :src="selectedDeity.symbol_image_url" :alt="selectedDeity.name + ' symbol'" class="h-16 w-16 object-contain" />
                    </div>
                    <div v-if="selectedDeity.domains?.length">
                      <p class="text-eyebrow font-semibold text-muted-foreground mb-1.5">DOMAINS</p>
                      <div class="flex flex-wrap gap-1">
                        <span v-for="domain in selectedDeity.domains" :key="domain" class="px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20 text-label text-primary">{{ domain }}</span>
                      </div>
                    </div>
                    <div v-if="selectedDeity.alternate_names?.length">
                      <p class="text-eyebrow font-semibold text-muted-foreground mb-1">ALSO KNOWN AS</p>
                      <p class="text-body text-muted-foreground">{{ selectedDeity.alternate_names.join(", ") }}</p>
                    </div>
                  </div>
                  <!-- Right: meta + description -->
                  <div class="flex flex-col gap-4 p-5 border-t border-border md:border-t-0">
                    <div class="flex flex-col gap-3">
                      <div v-if="selectedDeity.alignment">
                        <p class="text-eyebrow text-muted-foreground mb-0.5">ALIGNMENT</p>
                        <p class="text-body text-foreground">{{ selectedDeity.alignment }}</p>
                      </div>
                      <div v-if="selectedDeity.symbol">
                        <p class="text-eyebrow text-muted-foreground mb-0.5">SYMBOL</p>
                        <p class="text-body text-foreground">{{ selectedDeity.symbol }}</p>
                      </div>
                      <div v-if="selectedDeity.portfolio">
                        <p class="text-eyebrow text-muted-foreground mb-0.5">PORTFOLIO</p>
                        <p class="text-body text-foreground">{{ selectedDeity.portfolio }}</p>
                      </div>
                    </div>
                    <RichTextViewer v-if="isRichText(selectedDeity.description)" :content="selectedDeity.description!" />
                    <p v-else-if="selectedDeity.description" class="text-body text-muted-foreground">{{ selectedDeity.description }}</p>
                  </div>
                </div>
        </div>
      </AppModal>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, shallowRef, useId } from "vue";
import { IconChevronRight, IconClose, IconParty, IconPopulate, IconQuest, IconSun } from '@/lib/icons';
import type { Species } from "@/types/species.types";
import FocalImage from "@/components/common/FocalImage.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppModal from "@/components/common/AppModal.vue";
import SegmentedControl, { type SegmentedOption } from "@/components/common/SegmentedControl.vue";
import CodexCard from "./CodexCard.vue";
import BackgroundOriginFeatBadge from "@/components/backgrounds/BackgroundOriginFeatBadge.vue";
import { useAllSpecies } from "@/composables/rules/useSpecies";
import { useBackgrounds } from "@/composables/rules/useBackgrounds";
import { useAllSystemClasses, useAllCustomClasses } from "@/composables/rules/useCustomClasses";
import { useAllCustomSubclasses } from "@/composables/rules/useCustomSubclasses";
import { useAllFeatures } from "@/composables/rules/useFeatures";
import type { CustomFeatures } from "@/levelup/customTypes";
import { useAllDeities } from "@/composables/deities/useDeities";
import { useAuthStore } from "@/stores/auth";
import type { Deity, Pantheon } from "@/types/deity.types";

const CODEX_SECTIONS = [
  { value: "species",     label: "Species" },
  { value: "backgrounds", label: "Backgrounds" },
  { value: "classes",     label: "Classes" },
  { value: "deities",     label: "Deities" },
] as const satisfies readonly SegmentedOption<string>[];
type CodexSection = (typeof CODEX_SECTIONS)[number]["value"];
const codexSection = ref<CodexSection>("species");

// ── Species ──
const { data: allSpecies } = useAllSpecies();
const selectedSpecies = ref<Species | null>(null);
const speciesHeadingId = useId();

// ── Backgrounds ──
const { data: allBackgrounds } = useBackgrounds();
type BackgroundItem = NonNullable<typeof allBackgrounds.value>[number];
const selectedBackground = ref<BackgroundItem | null>(null);
const backgroundHeadingId = useId();

// ── Classes ──
const { data: systemClasses } = useAllSystemClasses();
const { data: customClasses } = useAllCustomClasses();
const { data: allCustomSubclasses } = useAllCustomSubclasses();
const { data: allFeatures } = useAllFeatures();

type ClassItem = {
  class_name: string;
  hit_die: number;
  primary_ability: string | null;
  saving_throws: string[];
  armor_proficiencies: string[];
  weapon_proficiencies: string[];
  subclass_level: number;
  features: CustomFeatures;
};
const selectedClass = ref<ClassItem | null>(null);
const classHeadingId = useId();

const mergedClasses = computed((): ClassItem[] => {
  const byName = new Map<string, ClassItem>();
  for (const c of systemClasses.value ?? []) byName.set(c.class_name, c);
  for (const c of customClasses.value ?? []) {
    if (!byName.has(c.class_name)) byName.set(c.class_name, c);
  }
  return [...byName.values()].sort((a, b) => a.class_name.localeCompare(b.class_name));
});

function subclassesFor(className: string) {
  return (allCustomSubclasses.value ?? []).filter((s) => s.class_name === className);
}

const featureMap = computed(() => {
  const m = new Map<string, string>();
  for (const f of allFeatures.value ?? []) m.set(f.id, f.name);
  return m;
});

function resolveFeatures(ids: string[]): string[] {
  return ids.map((id) => featureMap.value.get(id) ?? id);
}

function sortedLevels(features: CustomFeatures): number[] {
  return Object.keys(features)
    .map(Number)
    .filter((n) => !isNaN(n) && features[String(n)].length > 0)
    .sort((a, b) => a - b);
}

// ── Deities ──
const auth = useAuthStore();
const { data: allDeities, isLoading: deitiesLoading } = useAllDeities();
const deitySearch = ref("");
const selectedDeity = ref<(Deity & { pantheon: Pick<Pantheon, "id" | "name"> | null }) | null>(null);
const deityHeadingId = useId();
const myMemberId = computed(() => auth.linkedPartyMemberId ?? "");
const visibleDeities = computed(() =>
  (allDeities.value ?? []).filter((d) =>
    !!myMemberId.value && (d.player_visible_to ?? []).includes(myMemberId.value),
  ),
);
const filteredDeities = computed(() => {
  const q = deitySearch.value.trim().toLowerCase();
  if (!q) return visibleDeities.value;
  return visibleDeities.value.filter((d) => {
    const haystack = [d.name, d.titles, d.portfolio, ...(d.alternate_names ?? []), ...(d.tags ?? [])]
      .filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(q);
  });
});

// ── Shared utilities ──
function isRichText(value: string | null | undefined): boolean {
  if (!value) return false;
  try { JSON.parse(value); return true; } catch { return false; }
}

const open = shallowRef(new Set<string>());
function toggle(key: string) {
  const next = new Set(open.value);
  if (next.has(key)) { next.delete(key); } else { next.add(key); }
  open.value = next;
}
</script>
