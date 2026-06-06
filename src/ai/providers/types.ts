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
  // flat-priced providers (fal.ai) and older responses omit them.
  input_tokens?: number;       // text-prompt tokens (text-input rate)
  input_image_tokens?: number; // reference/seed-image tokens on edits (image-input rate)
  output_tokens?: number;      // generated-image tokens (image-output rate, dominant)
}

export interface TextProvider {
  complete(systemPrompt: string, userPrompt: string): Promise<{ content: string; usage: TextUsage }>;
}

export interface ImageProvider {
  generate(prompt: string, size: string): Promise<{ b64: string; usage: ImageUsage }>;
  edit?(source: Blob, prompt: string, size: string): Promise<{ b64: string; usage: ImageUsage }>;
}
