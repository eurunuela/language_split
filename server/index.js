const express = require("express");
const cors = require("cors");
const axios = require("axios");
const cheerio = require("cheerio");
const OpenAI = require("openai");
const { fetchArticle, getBrowserHeaders } = require("./utils/fetchUtil");
const http = require("http");
require("dotenv").config();

const app = express();
const DEFAULT_PORT = 5000;
let PORT = process.env.PORT || DEFAULT_PORT;

// Configure CORS more explicitly
const corsOptions = {
  origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json());

// Add CORS headers manually as a backup
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "http://localhost:3000");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Credentials", "true");

  // Handle OPTIONS method
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  next();
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// In-memory storage for translations
const translationStore = new Map();

// Add a health check endpoint
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "Server is running",
  });
});

// Add endpoint for translation status polling (fallback when WebSocket fails)
app.get("/api/translation-status/:id", (req, res) => {
  const { id } = req.params;

  if (!id || !translationStore.has(id)) {
    return res.status(404).json({
      status: "not_found",
      message: "Translation not found",
    });
  }

  const translation = translationStore.get(id);

  // Return the current status of the translation
  res.json({
    id,
    status: translation.status,
    progress: {
      completed: translation.chunks.filter((c) => c !== null).length,
      total: translation.chunks.length,
    },
    completedChunks: translation.chunks
      .map((chunk, index) => (chunk ? { index, text: chunk } : null))
      .filter(Boolean),
    translatedText:
      translation.status === "completed" ? translation.result : null,
  });
});

// Create HTTP server
const server = http.createServer(app);

// Extract article content from URL
app.get("/api/import", async (req, res) => {
  try {
    const { url } = req.query;
    console.log("Importing article from URL:", url);

    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    try {
      // First try our utility function
      const content = await fetchArticle(url);

      if (content && content.trim().length > 0) {
        console.log("Content extracted successfully. Length:", content.length);
        return res.json({ content });
      }

      // If utility function fails, use our original approach as fallback
      console.log("Using fallback extraction method...");

      const response = await axios.get(url, {
        headers: getBrowserHeaders(),
        timeout: 10000,
      });

      const $ = cheerio.load(response.data);

      // Remove scripts, styles, and other non-content elements
      $("script, style, nav, footer, header").remove();

      // Try to extract main content
      let fallbackContent = "";

      // Take paragraphs and headers from the body as fallback
      fallbackContent = $(
        "body p, body h1, body h2, body h3, body h4, body h5, body h6"
      )
        .map((i, el) => $.html(el))
        .get()
        .join("");

      if (!fallbackContent || fallbackContent.trim().length === 0) {
        return res
          .status(404)
          .json({ error: "Could not extract content from the URL" });
      }

      console.log(
        "Fallback extraction successful. Length:",
        fallbackContent.length
      );
      return res.json({ content: fallbackContent });
    } catch (fetchError) {
      console.error("Error in content extraction:", fetchError);
      return res
        .status(500)
        .json({ error: `Failed to extract content: ${fetchError.message}` });
    }
  } catch (error) {
    console.error("Error importing article:", error.message);
    res
      .status(500)
      .json({ error: `Failed to import article: ${error.message}` });
  }
});

// Add HTML cleanup helper function at the top level
function cleanupHtmlTranslation(htmlContent) {
  // Remove text artifacts where tag names were added as text
  // This pattern matches patterns like ">div<", ">p<", etc. and removes the tag name text
  // First pass: fix ">tagname<" patterns
  let cleaned = htmlContent.replace(
    />(\s*)(div|p|span|a|h[1-6]|ul|li|section|article)(\s*)</gi,
    "><"
  );

  // Second pass: fix patterns like "div </div>" or "p </p>" where tag name is shown before closing tag
  cleaned = cleaned.replace(
    /(\s*)(div|p|span|a|h[1-6]|ul|li|section|article)(\s*)<\//gi,
    "</"
  );

  // Third pass: fix broken opening and closing tags
  cleaned = cleaned.replace(
    /(\s*)(div|p|span|a|h[1-6]|ul|li|section|article)(\s*)<([^\/])/gi,
    "<$4"
  );

  // Fix double spacing issues that may have been introduced
  cleaned = cleaned.replace(/\s{2,}/g, " ");

  return cleaned;
}

// Translate text using OpenAI with streaming updates
app.post("/api/translate", async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: "Text is required" });
    }

    console.log(`Starting translation of ${text.length} characters`);

    // Short translations - translate immediately
    if (text.length < 1000) {
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content: `You are a translator. Translate the following text to English.

VERY IMPORTANT INSTRUCTIONS:
1. The text contains HTML tags like <div>, <p>, etc.
2. DO NOT translate HTML tags or attributes
3. DO NOT add tag names as text content in your output
4. DO NOT add any text like 'div', 'p', 'span', etc. before or after tags
5. Only translate the actual text BETWEEN the HTML tags
6. Keep all HTML structure and formatting intact

For example:
Input: "<div>Hello world</div>"
Correct output: "<div>Hello world</div>"
INCORRECT output: "<div>div Hello world</div>" or "<div>Hello world div</div>"

Input: "<p>Bonjour le monde</p>"
Correct output: "<p>Hello world</p>"
INCORRECT output: "<p>p Hello world</p>" or "<p>Hello world p</p>"`,
            },
            { role: "user", content: text },
          ],
          max_tokens: 4000,
          temperature: 0.3,
        });

        let translatedText = completion.choices[0].message.content;

        // Clean up any mistakenly added tag names
        translatedText = cleanupHtmlTranslation(translatedText);

        return res.json({ translatedText });
      } catch (error) {
        console.error("Error in direct translation:", error);
        return res
          .status(500)
          .json({ error: `Translation failed: ${error.message}` });
      }
    }

    // For longer texts, create a translation job for polling
    const translationId = `translation-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 10)}`;

    // Split text into chunks
    const chunks = splitTextIntoChunks(text);

    // Initialize translation in store
    translationStore.set(translationId, {
      status: "processing",
      chunks: new Array(chunks.length).fill(null),
      result: null,
      text,
      createdAt: Date.now(),
    });

    console.log(
      `Created translation job ${translationId} with ${chunks.length} chunks`
    );

    // Start background translation
    processTranslationInBackground(translationId, chunks);

    // Return the translation ID for polling
    return res.json({
      translationId,
      status: "processing",
      message: "Translation started",
      totalChunks: chunks.length,
      pollUrl: `/api/translation-status/${translationId}`,
    });
  } catch (error) {
    console.error("Error in translation request:", error);
    res.status(500).json({
      error: `Failed to translate text: ${error.message}`,
    });
  }
});

// Background translation processor
async function processTranslationInBackground(translationId, chunks) {
  if (!translationStore.has(translationId)) {
    console.log(`Translation job ${translationId} no longer exists`);
    return;
  }

  const translation = translationStore.get(translationId);

  try {
    console.log(`Starting background translation for job ${translationId}`);

    // Process each chunk sequentially
    for (let i = 0; i < chunks.length; i++) {
      if (!translationStore.has(translationId)) {
        console.log(
          `Translation job ${translationId} was deleted, stopping processing`
        );
        return;
      }

      console.log(
        `Processing chunk ${i + 1}/${chunks.length} for job ${translationId}`
      );

      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content: `You are a translator. Translate the following HTML fragment to English.
                      This is part ${i + 1} of ${
                chunks.length
              } of a larger text.
                      
VERY IMPORTANT INSTRUCTIONS:
1. The text contains HTML tags like <div>, <p>, etc.
2. DO NOT translate HTML tags or attributes
3. DO NOT add tag names as text content in your output
4. DO NOT add any text like 'div', 'p', 'span', etc. before or after tags
5. Only translate the actual text BETWEEN the HTML tags
6. Keep all HTML structure and formatting intact

For example:
Input: "<div>Hello world</div>"
Correct output: "<div>Hello world</div>"
INCORRECT output: "<div>div Hello world</div>" or "<div>Hello world div</div>"

Input: "<p>Bonjour le monde</p>"
Correct output: "<p>Hello world</p>"
INCORRECT output: "<p>p Hello world</p>" or "<p>Hello world p</p>"`,
            },
            { role: "user", content: chunks[i] },
          ],
          max_tokens: 4000,
          temperature: 0.3,
        });

        let translatedChunk = completion.choices[0].message.content;

        // Clean up any mistakenly added tag names
        translatedChunk = cleanupHtmlTranslation(translatedChunk);

        // Update the chunk in the translation store
        if (translationStore.has(translationId)) {
          const currentTranslation = translationStore.get(translationId);
          currentTranslation.chunks[i] = translatedChunk;
          translationStore.set(translationId, currentTranslation);

          console.log(
            `Updated chunk ${i + 1}/${chunks.length} for job ${translationId}`
          );
        } else {
          console.log(
            `Translation job ${translationId} no longer exists, stopping processing`
          );
          return;
        }
      } catch (chunkError) {
        console.error(
          `Error translating chunk ${i + 1}/${
            chunks.length
          } for job ${translationId}:`,
          chunkError
        );

        // Mark the chunk as failed but continue processing
        if (translationStore.has(translationId)) {
          const currentTranslation = translationStore.get(translationId);
          currentTranslation.chunks[
            i
          ] = `<div class="translation-error">Translation error in part ${
            i + 1
          }: ${chunkError.message || "Unknown error"}</div>`;
          translationStore.set(translationId, currentTranslation);
        }
      }

      // Brief pause between chunks to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Combine all chunks for the final result
    if (translationStore.has(translationId)) {
      const finalTranslation = translationStore.get(translationId);

      // Join chunks and perform final cleanup
      const combinedResult = finalTranslation.chunks.join("");
      finalTranslation.result = cleanupHtmlTranslation(combinedResult);

      finalTranslation.status = "completed";
      finalTranslation.completedAt = Date.now();
      translationStore.set(translationId, finalTranslation);

      console.log(`Translation job ${translationId} completed successfully`);

      // Schedule cleanup
      setTimeout(() => {
        if (translationStore.has(translationId)) {
          translationStore.delete(translationId);
          console.log(`Cleaned up translation job ${translationId}`);
        }
      }, 30 * 60 * 1000); // Clean up after 30 minutes
    }
  } catch (error) {
    console.error(
      `Error in background translation job ${translationId}:`,
      error
    );

    if (translationStore.has(translationId)) {
      const failedTranslation = translationStore.get(translationId);
      failedTranslation.status = "error";
      failedTranslation.error = error.message || "Unknown error";
      translationStore.set(translationId, failedTranslation);
    }
  }
}

// Separate function for splitting text into chunks
function splitTextIntoChunks(text) {
  const maxChunkLength = 10000;
  const chunks = [];
  let currentChunk = "";

  // Split by HTML tags that likely represent paragraph boundaries
  const htmlTags = [
    "p",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "div",
    "section",
    "article",
  ];
  const tagPattern = new RegExp(`</(${htmlTags.join("|")})>`, "g");

  // First try splitting by tags
  const elements = text.split(tagPattern);

  for (let i = 0; i < elements.length; i++) {
    let element = elements[i];

    // Add closing tag back if needed
    if (i < elements.length - 1 && !element.endsWith(">")) {
      const match = elements[i + 1].match(/^(\s*[a-z0-9]+)/i);
      if (match) {
        element += `</${match[1]}>`;
      }
    }

    // If adding this element would exceed chunk size, start a new chunk
    if (
      currentChunk.length + element.length > maxChunkLength &&
      currentChunk.length > 0
    ) {
      chunks.push(currentChunk);
      currentChunk = element;
    } else {
      currentChunk += element;
    }
  }

  // Don't forget the last chunk
  if (currentChunk) {
    chunks.push(currentChunk);
  }

  // If we couldn't split by tags or ended up with very large chunks, split by length
  const finalChunks = [];
  for (const chunk of chunks) {
    if (chunk.length > maxChunkLength) {
      // Split large chunks further by trying to find sentence boundaries
      let remainingText = chunk;
      while (remainingText.length > 0) {
        const splitPoint = findSafeSplitPoint(remainingText, maxChunkLength);
        finalChunks.push(remainingText.substring(0, splitPoint));
        remainingText = remainingText.substring(splitPoint);
      }
    } else {
      finalChunks.push(chunk);
    }
  }

  return finalChunks.length > 0 ? finalChunks : [text];
}

// Helper to find a safe place to split text
function findSafeSplitPoint(text, maxLength) {
  if (text.length <= maxLength) return text.length;

  // Try to split at paragraph, then sentence, then word boundaries
  const safePoint = Math.min(maxLength, text.length);

  // Look backward from max length for a safe split point
  for (let i = safePoint; i > safePoint - 100 && i > 0; i--) {
    // Check for paragraph end
    if (text.substring(i - 4, i) === "</p>") return i;

    // Check for sentence end with following space
    if (text[i - 1] === "." && text[i] === " ") return i;
  }

  // If no good break found, just split at a space
  for (let i = safePoint; i > safePoint - 50 && i > 0; i--) {
    if (text[i] === " ") return i;
  }

  // Last resort: just split at max length
  return Math.min(maxLength, text.length);
}

// Regular cleanup task for old translations
setInterval(() => {
  const now = Date.now();
  const maxAge = 60 * 60 * 1000; // 1 hour

  let cleanupCount = 0;
  translationStore.forEach((translation, id) => {
    if (now - translation.createdAt > maxAge) {
      translationStore.delete(id);
      cleanupCount++;
    }
  });

  if (cleanupCount > 0) {
    console.log(`Cleaned up ${cleanupCount} old translation jobs`);
  }
}, 15 * 60 * 1000); // Run every 15 minutes

// Handle port conflicts by trying different ports
const startServer = () => {
  try {
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`CORS enabled for origins: ${corsOptions.origin.join(", ")}`);
    });

    server.on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        console.log(`Port ${PORT} is busy, trying with port ${PORT + 1}`);
        PORT += 1;
        server.close();
        startServer();
      } else {
        console.error("Server error:", error);
      }
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

// Try to kill any existing process on port 5000 (Unix systems only)
const tryToKillExistingProcess = () => {
  try {
    if (process.platform !== "win32") {
      const { execSync } = require("child_process");
      console.log(`Attempting to free up port ${DEFAULT_PORT}...`);
      execSync(
        `lsof -i :${DEFAULT_PORT} | grep LISTEN | awk '{print $2}' | xargs kill -9`,
        {
          stdio: "ignore",
        }
      );
    }
  } catch (e) {
    // Ignore errors, just an attempt
  }
};

// Try to free the port and then start server
tryToKillExistingProcess();
startServer();
