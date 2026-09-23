/**
 * Whether the user already has a Stripe subscription that is still billing, so
 * a second subscription checkout must be refused: the webhook would overwrite
 * `stripe_subscription_id` and orphan the first one, which keeps charging.
 *
 * Keyed on `stripe_subscription_id`, never on `status` alone. `status` defaults
 * to 'active' for every `user_subscriptions` row, free users included, so a
 * status-only guard answered 409 `already_subscribed` to every buyer and no
 * upgrade ever reached Stripe (#905). The webhook clears the id when Stripe
 * deletes the subscription, so its presence is what "has a subscription" means.
 *
 * The excluded statuses are the ones that bill nothing: a canceled
 * subscription, and an incomplete one whose first payment never landed (Stripe
 * expires it on its own).
 */
export function hasLiveStripeSubscription(
  sub: { stripe_subscription_id: string | null; status: string } | null,
): boolean {
  if (!sub?.stripe_subscription_id) return false;
  return !["canceled", "incomplete", "incomplete_expired"].includes(sub.status);
}
