<template>
  <div class="min-h-screen bg-background relative">
    <div
      class="fixed inset-0 pointer-events-none opacity-[0.04]"
      style="background-image: url(&quot;data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E&quot;);"
    />
    <div class="relative z-10">
      <slot />
    </div>
  </div>
</template>
