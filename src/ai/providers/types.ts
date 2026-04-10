export interface TextProvider {
  complete(systemPrompt: string, userPrompt: string): Promise<string>
}

export interface ImageProvider {
  generate(prompt: string, size: string): Promise<string>
  edit?(source: Blob, prompt: string, size: string): Promise<string>
}
