<template>
  <!-- The party tracker's key-stats grid, shared by a hero's row and a
       companion's card so the two read as one table and cannot drift apart. -->
  <div class="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-0.5 text-label-lg">
    <slot />
  </div>
</template>
