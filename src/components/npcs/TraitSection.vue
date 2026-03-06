<template>
  <div>
    <p class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-2">
      {{ label.toUpperCase() }}
    </p>
    <div v-for="(entry, i) in props.modelValue ?? []" :key="i" class="flex gap-2 mb-2 items-start">
      <div class="flex-1 space-y-1">
        <input
          :value="entry.name"
          placeholder="Name"
          class="w-full bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          @input="update(i, 'name', ($event.target as HTMLInputElement).value)"
        />
        <textarea
          :value="entry.description"
          placeholder="Description…"
          rows="2"
          class="w-full bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          @input="update(i, 'description', ($event.target as HTMLTextAreaElement).value)"
        />
      </div>
      <button
        type="button"
        class="text-muted-foreground hover:text-destructive transition-colors shrink-0 mt-1 text-lg leading-none"
        @click="remove(i)"
      >
        ✕
      </button>
    </div>
    <button
      type="button"
      class="font-cinzel text-xs font-semibold text-primary hover:opacity-80 transition-opacity"
      @click="add"
    >
      + Add {{ label }}
    </button>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  modelValue: Array<{ name: string; description: string }> | undefined
  label: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: Array<{ name: string; description: string }>]
}>()

function add() {
  emit('update:modelValue', [...(props.modelValue ?? []), { name: '', description: '' }])
}

function remove(i: number) {
  const arr = [...(props.modelValue ?? [])]
  arr.splice(i, 1)
  emit('update:modelValue', arr)
}

function update(i: number, key: 'name' | 'description', value: string) {
  const arr = (props.modelValue ?? []).map((e, idx) => idx === i ? { ...e, [key]: value } : e)
  emit('update:modelValue', arr)
}
</script>
