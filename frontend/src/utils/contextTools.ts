export function calculateTokensFromString(...texts: string[]): number {
  // Handle edge cases: no arguments, or empty array
  if (!texts || texts.length === 0) {
    return 0;
  }

  let totalTokens = 0;

  for (const text of texts) {
    // Skip null, undefined, or empty strings
    if (!text || text.trim().length === 0) {
      continue;
    }

    // Trim the text to remove leading/trailing whitespace
    const trimmedText = text.trim();

    // Split by whitespace to get words
    const words = trimmedText.split(/\s+/);
    const wordCount = words.length;

    // Estimate tokens using 1.33 tokens per word average
    const tokensFromWords = wordCount * 1.33;

    // Fallback: estimate based on characters (4 characters per token)
    const charCount = trimmedText.length;
    const tokensFromChars = charCount / 4;

    // Use the maximum of both estimates for a more accurate count
    // This handles cases with very long words or special characters
    const estimatedTokens = Math.max(tokensFromWords, tokensFromChars);

    // Add to total (using ceiling to ensure we don't underestimate)
    totalTokens += Math.ceil(estimatedTokens);
  }

  return totalTokens;
}
