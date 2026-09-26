/**
 * Whether an OpenAI image model accepts an arbitrary output size. Only the
 * `gpt-image-2.5` family does (per OpenAI's image-generation guide);
 * `gpt-image-2` and any other model an admin might configure via
 * `provider_config` are limited to a short fixed list of sizes instead.
 * `style-map/index.ts` uses this to reject a flexible-sized upload before it
 * reaches a model that would refuse it — the client always sends a
 * flexible-fitted image for the "openai" provider, since it has no way to
 * see which model the admin has actually configured.
 */
export function isFlexibleOpenAiModel(model: string): boolean {
  return model.startsWith("gpt-image-2.5");
}
