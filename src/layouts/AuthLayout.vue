<template>
  <div class="min-h-screen flex items-center justify-center bg-background px-4">
    <!-- Subtle parchment texture overlay -->
    <div class="absolute inset-0 pointer-events-none opacity-5"
         style="background-image: url(&quot;data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E&quot;);"></div>

    <div class="relative z-10 w-full max-w-md">
      <!-- Grimoire logo / title -->
      <div class="text-center mb-8">
        <h1 class="font-cinzel text-4xl font-bold text-gold-500 tracking-widest drop-shadow-lg">
          Grimoire
        </h1>
        <p class="font-fell text-muted-foreground mt-1 italic">
          Your campaign companion
        </p>
      </div>

      <!-- Auth card -->
      <div class="rounded-lg border border-border bg-card p-8 shadow-gold-glow">
        <slot />
      </div>
    </div>
  </div>
</template>
