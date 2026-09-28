import { computed } from "vue";
import { useRoute } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useSubscription } from "@/composables/billing/useSubscription";
import { useChildAccount } from "@/composables/account/useChildAccount";
import { shouldShowTermsGate } from "@/components/account/termsGate";

/**
 * Whether the Terms gate (#919) is on screen, and whether that is known yet.
 *
 * Shared because the gate is not the only thing that opens a dialog after
 * sign-in: the AI-use notice opens as soon as its own data lands, which is
 * usually before the subscription row this gate keys off, so it would take the
 * top of the modal stack and bury a gate that must be answered first. Other
 * sign-in dialogs wait for `settled` and stay closed while `visible`.
 */
export function useTermsGate() {
  const route = useRoute();
  const auth = useAuthStore();
  const { subscription, isLoading: subscriptionLoading } = useSubscription();
  const { isChild, isLoading: childLoading } = useChildAccount();

  const settled = computed(() => !auth.isAuthenticated || (!subscriptionLoading.value && !childLoading.value));

  const visible = computed(() =>
    shouldShowTermsGate({
      isAuthenticated: auth.isAuthenticated,
      subscriptionLoading: subscriptionLoading.value,
      childLoading: childLoading.value,
      isActiveChild: isChild.value,
      termsVersion: subscription.value?.terms_version,
      currentPath: route.path,
    }),
  );

  return { visible, settled };
}
