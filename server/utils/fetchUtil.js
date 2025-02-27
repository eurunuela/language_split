const axios = require("axios");
const cheerio = require("cheerio");

// Common headers to mimic a browser
const getBrowserHeaders = () => ({
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  Referer: "https://www.google.com/",
  Connection: "keep-alive",
  "Upgrade-Insecure-Requests": "1",
  "Cache-Control": "max-age=0",
});

/**
 * Fetch article content from a URL
 */
const fetchArticle = async (url) => {
  console.log(`Fetching article from: ${url}`);

  try {
    // Try the regular fetch first
    const response = await axios.get(url, {
      headers: getBrowserHeaders(),
      timeout: 15000,
      maxRedirects: 5,
    });

    return extractContent(response.data);
  } catch (error) {
    console.error(`Error fetching article: ${error.message}`);
    throw error;
  }
};

/**
 * Extract content from HTML
 */
const extractContent = (html) => {
  const $ = cheerio.load(html);
  console.log(`Page title: ${$("title").text()}`);

  // Clean the HTML
  $("script, style, noscript, iframe, svg, form, button").remove();

  // Try different selectors for the article content
  const contentSelectors = [
    "article",
    ".article",
    ".post",
    ".content",
    "main",
    "#main",
    ".main",
    ".story",
    ".story-body",
    ".entry-content",
    ".post-content",
    '[itemprop="articleBody"]',
    ".news-item",
  ];

  let content = "";

  // Try to find the main content container
  for (const selector of contentSelectors) {
    if ($(selector).length > 0) {
      console.log(`Found content with selector: ${selector}`);
      content = $(selector).html();
      break;
    }
  }

  // If no dedicated content container found, extract paragraphs and headings
  if (!content) {
    content = $("p, h1, h2, h3, h4, h5, h6")
      .map((_, el) => {
        return $.html(el);
      })
      .get()
      .join("\n");
  }

  // Clean up the content
  content = content
    .replace(/\s+/g, " ")
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .trim();

  return content;
};

module.exports = {
  fetchArticle,
  extractContent,
  getBrowserHeaders,
};
