export interface TextUsage {
  input_tokens: number;
  output_tokens: number;
  model: string;
  provider: string;
}

export interface ImageUsage {
  model: string;
  provider: string;
  image_count: number;
  // Token usage for token-priced image models (OpenAI gpt-image). Optional —
  // flat-priced providers and older responses omit them.
  input_tokens?: number;       // text-prompt tokens (text-input rate)
  input_image_tokens?: number; // reference/seed-image tokens on edits (image-input rate)
  output_tokens?: number;      // generated-image tokens (image-output rate, dominant)
}

export interface TextProvider {
  complete(systemPrompt: string, userPrompt: string): Promise<{ content: string; usage: TextUsage }>;
}

export interface ImageProvider {
  generate(prompt: string, size: string): Promise<{ b64: string; usage: ImageUsage }>;
  /**
   * Compose one or more reference images into a new image (e.g. character
   * portraits into a scene). Providers that support only a single reference use
   * the first blob; generate-only providers omit `edit` entirely.
   */
  edit?(sources: Blob[], prompt: string, size: string): Promise<{ b64: string; usage: ImageUsage }>;
}
