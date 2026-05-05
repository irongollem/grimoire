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
}

export interface TextProvider {
  complete(systemPrompt: string, userPrompt: string): Promise<{ content: string; usage: TextUsage }>;
}

export interface ImageProvider {
  generate(prompt: string, size: string): Promise<{ b64: string; usage: ImageUsage }>;
  edit?(source: Blob, prompt: string, size: string): Promise<{ b64: string; usage: ImageUsage }>;
}
