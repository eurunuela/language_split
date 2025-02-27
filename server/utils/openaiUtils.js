/**
 * Utility functions for interacting with OpenAI API
 */

/**
 * Simple text truncation to fit within OpenAI token limits
 * @param {string} text - The text to truncate
 * @param {number} maxTokens - Approximate maximum tokens allowed
 * @returns {string} - Truncated text
 */
const truncateText = (text, maxTokens = 3000) => {
  // Very rough estimate: 1 token ≈ 4 characters in English
  const maxChars = maxTokens * 4;

  if (text.length <= maxChars) {
    return text;
  }

  // Try to truncate at a sensible boundary like a paragraph or sentence
  const truncatePoint = text.lastIndexOf("</p>", maxChars);
  if (truncatePoint > maxChars * 0.75) {
    return text.substring(0, truncatePoint) + "</p>";
  }

  const sentenceEnd = text.lastIndexOf(".", maxChars);
  if (sentenceEnd > maxChars * 0.75) {
    return text.substring(0, sentenceEnd + 1);
  }

  // Last resort: hard truncate
  return text.substring(0, maxChars) + "...";
};

/**
 * Checks if the OpenAI API key is valid
 */
const validateApiKey = (apiKey) => {
  if (!apiKey) {
    return false;
  }

  // OpenAI API keys have a specific format
  const validFormat = apiKey.startsWith("sk-") && apiKey.length > 20;
  return validFormat;
};

/**
 * Splits HTML content into smaller chunks while preserving HTML structure
 */
const splitHtmlContent = (html, maxChunkSize = 3000) => {
  if (!html || html.length <= maxChunkSize) {
    return [html];
  }

  const chunks = [];
  let currentChunk = "";

  // Try to split at paragraph boundaries
  const paragraphs = html.split(/(<\/p>|<\/h[1-6]>)/);

  for (let i = 0; i < paragraphs.length; i += 2) {
    const paragraph = paragraphs[i] + (paragraphs[i + 1] || "");

    if (currentChunk.length + paragraph.length > maxChunkSize) {
      chunks.push(currentChunk);
      currentChunk = paragraph;
    } else {
      currentChunk += paragraph;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
};

module.exports = {
  truncateText,
  validateApiKey,
  splitHtmlContent,
};
