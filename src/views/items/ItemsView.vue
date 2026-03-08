<template>
  <div>
    <PageHeader
      title="Vault"
      description="Your mundane equipment and magic items"
    >
      <template #actions>
        <RouterLink
          to="/vault/new"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
        >
          + New Item
        </RouterLink>
      </template>
    </PageHeader>

    <ItemList />
  </div>
</template>

<script setup lang="ts">
import PageHeader from "@/components/common/PageHeader.vue";
import ItemList from "@/components/items/ItemList.vue";
</script>
