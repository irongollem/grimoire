<template>
  <div class="loot-shell" :class="{ tarot }">
    <svg viewBox="0 0 200 280" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" style="position:absolute;inset:0;width:100%;height:100%;">
      <rect width="200" height="280" fill="#0e0b08"/>
      <radialGradient id="rg" cx="50%" cy="50%" r="55%">
        <stop offset="0%" stop-color="#3a2a10" stop-opacity=".7"/>
        <stop offset="100%" stop-color="#0e0b08" stop-opacity="0"/>
      </radialGradient>
      <rect width="200" height="280" fill="url(#rg)"/>
      <g stroke="#c8983a" stroke-width="1" fill="none" opacity=".45">
        <path d="M10 10 L10 22 M10 10 L22 10"/>
        <path d="M190 10 L190 22 M190 10 L178 10"/>
        <path d="M10 270 L10 258 M10 270 L22 270"/>
        <path d="M190 270 L190 258 M190 270 L178 270"/>
      </g>
      <rect x="7" y="7" width="186" height="266" rx="6" stroke="#c8983a" stroke-width=".6" fill="none" opacity=".3"/>
      <g transform="translate(70 90)" opacity=".6">
        <rect x="0" y="14" width="60" height="42" rx="3" fill="#2a1f0e" stroke="#c8983a" stroke-width="1.2"/>
        <rect x="0" y="0" width="60" height="18" rx="3" fill="#1f1608" stroke="#c8983a" stroke-width="1.2"/>
        <rect x="0" y="14" width="60" height="4" fill="#c8983a" opacity=".4"/>
        <rect x="20" y="22" width="20" height="14" rx="2" fill="#c8983a" opacity=".5"/>
        <circle cx="30" cy="29" r="3" fill="#0e0b08" stroke="#c8983a" stroke-width=".8"/>
      </g>
      <text x="100" y="190" text-anchor="middle" font-family="Cinzel,serif" font-size="8" font-weight="700" fill="#c8983a" opacity=".6" letter-spacing="3">LOOT</text>
      <text x="100" y="202" text-anchor="middle" font-family="Cinzel,serif" font-size="5.5" fill="#c8983a" opacity=".35" letter-spacing="2">CARD VAULT</text>
      <line x1="60" y1="212" x2="140" y2="212" stroke="#c8983a" stroke-width=".5" opacity=".3"/>
    </svg>
  </div>
</template>
<script setup lang="ts">
defineProps<{ tarot?: boolean }>();
</script>
<style scoped>
.loot-shell { position:relative; width:200px; height:280px; border-radius:10px; overflow:hidden; flex-shrink:0; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.loot-shell.tarot { height:343px; }
</style>