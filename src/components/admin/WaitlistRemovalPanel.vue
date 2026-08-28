<template>
  <SettingsSection
    title="Pro waitlist removal"
    description="Art. 7(3) — for someone who wrote to info@ instead of using the unsubscribe link. Removal is immediate and cannot be undone."
  >
    <div class="space-y-3">
      <AppInput
        v-model="email"
        type="email"
        size="body"
        tone="muted"
        placeholder="Address to remove"
        @keyup.enter="submit"
      />
      <div class="flex flex-wrap items-center gap-3">
        <AppButton
          variant="destructive"
          size="sm"
          label="Remove from waitlist"
          :loading="removeEmail.isPending.value"
          :disabled="!email.trim()"
          @click="submit"
        />
        <p v-if="result" class="text-caption" :class="resultClass">{{ result }}</p>
      </div>
      <p class="text-caption text-muted-foreground italic">
        This is not a withdrawal under the Art. 12(3) clock, so it is not recorded above —
        consent withdrawal is immediate and logging each one would rebuild the address the
        removal just deleted. The audit log records that you acted, with a count and no address.
      </p>
    </div>
  </SettingsSection>
</template>

<script setup lang="ts">
/**
 * Admin → Requests. The operator half of #638.
 *
 * There is deliberately no list of waitlist addresses to pick from — see
 * `useProWaitlist`. The operator types the address they were written to from,
 * and the RPC matches it case-insensitively, the same way the unique index does.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import SettingsSection from "@/components/common/SettingsSection.vue";
import { useRemoveWaitlistEmail } from "@/composables/admin/useProWaitlist";

const removeEmail = useRemoveWaitlistEmail();

const email = ref("");
const result = ref<string | null>(null);
const failed = ref(false);

const resultClass = computed(() =>
  failed.value ? "text-destructive" : "text-muted-foreground",
);

async function submit() {
  const address = email.value.trim();
  if (!address || removeEmail.isPending.value) return;

  result.value = null;
  failed.value = false;
  try {
    const removed = await removeEmail.mutateAsync(address);
    // Zero is reported as its own outcome rather than as success: "removed" for
    // an address that was never on the list is the answer that would send an
    // operator back to the requester with the wrong reassurance.
    result.value = removed > 0
      ? `Removed ${removed} address${removed === 1 ? "" : "es"} from the waitlist.`
      : "That address was not on the waitlist — nothing to remove.";
    email.value = "";
  } catch (err) {
    failed.value = true;
    result.value = err instanceof Error ? err.message : String(err);
  }
}
</script>
