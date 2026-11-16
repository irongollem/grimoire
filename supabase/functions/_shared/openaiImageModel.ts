/**
 * Whether an OpenAI image model accepts an arbitrary output size. Only the
 * `gpt-image-2.5` and `gpt-image-2.6` families do (per OpenAI's
 * image-generation guide: multiples of 16, 1:3 to 3:1, at most 3840 a side);
 * `gpt-image-2` and any other model an admin might configure via
 * `provider_config` are limited to a short fixed list of sizes instead.
 * `style-map/index.ts` uses this to reject a flexible-sized upload before it
 * reaches a model that would refuse it — the client always sends a
 * flexible-fitted image for the "openai" provider, since it has no way to
 * see which model the admin has actually configured.
 */
const FLEXIBLE_FAMILIES = ["gpt-image-2.5", "gpt-image-2.6"];

export function isFlexibleOpenAiModel(model: string): boolean {
  return FLEXIBLE_FAMILIES.some((family) => model.startsWith(family));
}
