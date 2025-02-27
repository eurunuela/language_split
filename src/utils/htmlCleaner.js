/**
 * Utility to clean HTML and fix common translation issues
 */

/**
 * Clean up translated HTML that has tag names appearing as text
 * @param {string} htmlContent - The HTML content to clean
 * @returns {string} - Cleaned HTML content
 */
export function cleanTranslatedHtml(htmlContent) {
  if (!htmlContent) return "";

  // List of common HTML tags that might appear as text
  const commonTags = [
    "div",
    "p",
    "span",
    "a",
    "ul",
    "ol",
    "li",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "section",
    "article",
    "header",
    "footer",
    "nav",
    "main",
    "aside",
    "figure",
    "figcaption",
    "blockquote",
    "cite",
    "img",
    "table",
    "tr",
    "td",
    "th",
  ];

  let cleaned = htmlContent;

  // Fix common patterns where tag names appear as text
  commonTags.forEach((tag) => {
    // Fix pattern: <tag>tag text</tag>
    const openTagRegex = new RegExp(`<${tag}[^>]*>\\s*${tag}\\s+`, "gi");
    cleaned = cleaned.replace(openTagRegex, `<${tag}>`);

    // Fix pattern: <tag>text tag</tag>
    const closeTagRegex = new RegExp(`\\s+${tag}\\s*</${tag}>`, "gi");
    cleaned = cleaned.replace(closeTagRegex, `</${tag}>`);

    // Fix pattern: text tag text - when it's just the word floating in text
    // This is trickier as we don't want to remove legitimate uses of these words
    // Only target single tag words with spaces or punctuation around them
    const standaloneRegex = new RegExp(
      `(\\s|^)${tag}(\\s|\\.|,|:|;|\\?|!|$)`,
      "gi"
    );
    cleaned = cleaned.replace(standaloneRegex, "$1$2");
  });

  // Fix trailing/leading spaces in tags
  cleaned = cleaned.replace(/>\s+</g, "><");

  return cleaned;
}

/**
 * Clean and prepare HTML content for display
 * @param {string} content - The HTML content to prepare
 * @returns {string} - Cleaned and prepared HTML
 */
export function prepareHtmlForDisplay(content) {
  if (!content) return "";

  // First clean any tag issues from the translation
  let prepared = cleanTranslatedHtml(content);

  // Add other HTML preprocessing here if needed

  return prepared;
}
