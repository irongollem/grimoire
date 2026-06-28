<template>
  <div class="min-h-screen">
    <!-- Top nav -->
    <nav
      class="flex items-center justify-between px-6 py-4 border-b border-border/40 max-w-5xl mx-auto"
    >
      <span
        class="font-cinzel text-xl font-bold text-amber-400 tracking-widest"
      >
        Grimoire
      </span>
      <div class="flex items-center gap-3">
        <RouterLink
          to="/login"
          class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground hover:text-foreground transition-colors"
        >
          Sign In
        </RouterLink>
        <RouterLink
          to="/signup"
          class="font-cinzel text-xs font-semibold tracking-wider bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:opacity-90 transition-opacity"
        >
          Get Started
        </RouterLink>
      </div>
    </nav>

    <!-- Hero -->
    <section class="text-center pt-20 pb-14 px-4">
      <p
        class="font-cinzel text-[11px] font-semibold tracking-[0.25em] text-amber-400 uppercase mb-4"
      >
        The DM's Toolkit
      </p>
      <h1
        class="font-cinzel text-4xl md:text-6xl font-bold text-foreground mb-5 leading-tight"
      >
        Run better<br />campaigns.
      </h1>
      <p
        class="font-fell text-lg md:text-xl text-muted-foreground italic max-w-lg mx-auto leading-relaxed mb-10"
      >
        Every NPC, monster, encounter, and map — in one place. Your players join
        and play for free.
      </p>
      <div class="flex items-center justify-center gap-3 flex-wrap">
        <RouterLink
          to="/signup"
          class="font-cinzel text-xs font-semibold tracking-wider bg-amber-500 text-black px-6 py-2.5 rounded-md hover:bg-amber-400 transition-colors"
        >
          Start for free
        </RouterLink>
        <RouterLink
          to="/pricing"
          class="font-cinzel text-xs font-semibold tracking-wider border border-border text-muted-foreground px-6 py-2.5 rounded-md hover:text-foreground hover:border-foreground/30 transition-colors"
        >
          See pricing
        </RouterLink>
      </div>
    </section>

    <!-- Feature highlights -->
    <section class="max-w-4xl mx-auto px-4 pb-16">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="feature in features"
          :key="feature.title"
          class="rounded-xl border border-border bg-card p-6"
        >
          <div class="flex items-center gap-3 mb-3">
            <div
              class="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"
            >
              <component :is="feature.icon" class="h-4 w-4 text-primary" />
            </div>
            <h3
              class="font-cinzel text-sm font-bold text-foreground tracking-wide"
            >
              {{ feature.title }}
            </h3>
          </div>
          <p
            class="font-fell text-sm text-muted-foreground italic leading-relaxed"
          >
            {{ feature.description }}
          </p>
        </div>
      </div>
    </section>

    <!-- "Players play free" callout -->
    <section class="max-w-2xl mx-auto px-4 pb-16">
      <div
        class="rounded-xl border border-amber-500/25 bg-amber-500/5 p-8 text-center"
      >
        <p
          class="font-cinzel text-[11px] font-semibold tracking-[0.2em] text-amber-400 uppercase mb-3"
        >
          No hidden costs
        </p>
        <h2
          class="font-cinzel text-2xl md:text-3xl font-bold text-amber-400 mb-4"
        >
          Your whole table plays free.
        </h2>
        <p
          class="font-fell text-base text-muted-foreground italic leading-relaxed"
        >
          One DM subscription unlocks everything. Every player in your campaign
          gets the full player portal — character sheet, live encounter view,
          inventory, spell book, and more — at no cost. Share an invite link and
          they're in.
        </p>
      </div>
    </section>

    <!-- Pricing teaser -->
    <section class="max-w-2xl mx-auto px-4 pb-16">
      <h2
        class="font-cinzel text-center text-xl font-bold text-foreground mb-2"
      >
        Simple pricing
      </h2>
      <p
        class="font-fell text-center text-sm text-muted-foreground italic mb-8"
      >
        Start free. Upgrade only when your legend demands it.
      </p>

      <div class="grid grid-cols-2 gap-4">
        <!-- Free -->
        <div class="rounded-xl border border-border bg-card p-5 flex flex-col">
          <p
            class="font-cinzel text-[11px] font-semibold tracking-[0.15em] text-muted-foreground uppercase mb-1"
          >
            Free DM
          </p>
          <p class="font-cinzel text-2xl font-bold text-foreground mb-3">
            Free
          </p>
          <ul class="space-y-2 flex-1">
            <li
              v-for="item in freeHighlights"
              :key="item"
              class="flex items-start gap-2"
            >
              <span
                class="h-3.5 w-3.5 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0 mt-0.5 text-[8px] font-bold"
                >✓</span
              >
              <span
                class="font-fell text-xs text-muted-foreground italic leading-tight"
                >{{ item }}</span
              >
            </li>
          </ul>
          <RouterLink
            to="/signup"
            class="mt-5 block text-center font-cinzel text-[11px] font-semibold tracking-wider border border-border text-muted-foreground px-3 py-2 rounded-md hover:text-foreground hover:border-foreground/30 transition-colors"
          >
            Get started
          </RouterLink>
        </div>

        <!-- Pro -->
        <div
          class="rounded-xl border border-amber-500/30 bg-card p-5 flex flex-col relative overflow-hidden"
        >
          <div
            class="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-amber-400/50 to-transparent"
          />
          <p
            class="font-cinzel text-[11px] font-semibold tracking-[0.15em] text-amber-400 uppercase mb-1"
          >
            Pro DM
          </p>
          <p class="font-cinzel text-2xl font-bold text-amber-400 mb-3">
            Upgrade
          </p>
          <ul class="space-y-2 flex-1">
            <li
              v-for="item in proHighlights"
              :key="item"
              class="flex items-start gap-2"
            >
              <span
                class="h-3.5 w-3.5 rounded-full bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0 mt-0.5 text-[8px] font-bold"
                >✓</span
              >
              <span
                class="font-fell text-xs text-muted-foreground italic leading-tight"
                >{{ item }}</span
              >
            </li>
          </ul>
          <RouterLink
            to="/pricing"
            class="mt-5 block text-center font-cinzel text-[11px] font-semibold tracking-wider bg-amber-500 text-black px-3 py-2 rounded-md hover:bg-amber-400 transition-colors"
          >
            See full pricing
          </RouterLink>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer class="border-t border-border/40 py-8 text-center">
      <p
        class="font-cinzel text-[11px] font-semibold tracking-[0.2em] text-amber-400 mb-4"
      >
        Grimoire
      </p>
      <div class="flex items-center justify-center gap-6">
        <RouterLink
          to="/pricing"
          class="font-cinzel text-xs text-muted-foreground hover:text-foreground transition-colors tracking-wide"
        >
          Pricing
        </RouterLink>
        <RouterLink
          to="/login"
          class="font-cinzel text-xs text-muted-foreground hover:text-foreground transition-colors tracking-wide"
        >
          Sign In
        </RouterLink>
        <RouterLink
          to="/signup"
          class="font-cinzel text-xs text-muted-foreground hover:text-foreground transition-colors tracking-wide"
        >
          Sign Up
        </RouterLink>
        <LegalFooterLinks />
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { useHead } from "@unhead/vue";
import { IconEncounter, IconFaction, IconGamepad, IconParty, IconPrint, IconWand } from '@/lib/icons';
import LegalFooterLinks from "@/components/common/LegalFooterLinks.vue";

useHead({
  title: "Grimoire — D&D Campaign Manager for Dungeon Masters",
  meta: [
    {
      name: "description",
      content:
        "Grimoire is a free D&D campaign management tool for Dungeon Masters. Track NPCs, monsters, encounters, quests, and maps. Players join and play for free.",
    },
    { property: "og:title", content: "Grimoire — D&D Campaign Manager" },
    {
      property: "og:description",
      content:
        "All your monsters, NPCs, encounters, and lore in one place. Players join and play for free.",
    },
    { property: "og:type", content: "website" },
    { property: "og:url", content: "https://dungeongrimoire.com" },
    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: "Grimoire — D&D Campaign Manager" },
    {
      name: "twitter:description",
      content:
        "All your monsters, NPCs, encounters, and lore in one place. Players join and play for free.",
    },
  ],
  link: [{ rel: "canonical", href: "https://dungeongrimoire.com" }],
  script: [
    {
      type: "application/ld+json",
      innerHTML: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "Grimoire",
        applicationCategory: "GameApplication",
        operatingSystem: "Web",
        description:
          "D&D campaign management for Dungeon Masters. Track NPCs, monsters, encounters, quests, and maps. Players always free.",
        url: "https://dungeongrimoire.com",
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
          description: "Free tier available for Dungeon Masters",
        },
      }),
    },
  ],
});

const features = [
  {
    icon: IconFaction,
    title: "A living world",
    description:
      "17 location types in a hierarchical atlas. Quest log with kanban board. Factions with directional relations and secret memberships. Map pins, store inventories, travel tracking.",
  },
  {
    icon: IconParty,
    title: "Every face, every bond",
    description:
      "Full D&D 5e character sheets with Wild Shape and multiclass slots. NPC profiles with stat blocks, inventory, and lore tabs. Force-directed relationship web with 13 relation types.",
  },
  {
    icon: IconEncounter,
    title: "Combat, fully realised",
    description:
      "Build encounters from your bestiary, assign factions, add scripted events and boss mechanics. Run it live: HP syncs bidirectionally, players see combatants revealed in real time.",
  },
  {
    icon: IconWand,
    title: "Gear, spells & craft",
    description:
      "Item vault with dual identification portraits. Paper doll inventory with 11 anatomical slots, attunement tracker, and carry weight. Spellbook, multiclass slot calculator, and crafting workshop.",
  },
  {
    icon: IconPrint,
    title: "Print-quality output",
    description:
      "Scriptorium exports PHB-styled PDFs. Card Forge prints playing cards and Tarot cards from your monsters, items, and NPCs. The Mint creates VTT tokens. Illuminator processes artwork.",
  },
  {
    icon: IconGamepad,
    title: "Players, fully equipped",
    description:
      "Invite link → players get their own portal: character sheet, live encounter view with turn notifications, inventory, spellbook, journal, and crafting. Always free for your whole table.",
  },
];

const freeHighlights = [
  "All DM tools included",
  "1 campaign, limited content",
  "Full player portal",
  "No player fees — ever",
];

const proHighlights = [
  "Unlimited campaigns & content",
  "AI generation (NPCs, monsters, artwork…)",
  "Full player portal",
  "No player fees — ever",
];
</script>
