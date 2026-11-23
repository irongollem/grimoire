/**
 * Bytes to base64, in chunks: `String.fromCharCode(...bytes)` on a multi-megabyte buffer overflows the call stack.
 * btoa adds no line breaks, which is what `DocumentPart.data` and the MCP image blocks require.
 */
export function base64FromBytes(bytes: Uint8Array): string {
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}
