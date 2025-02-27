import React, { useState, useRef, useEffect } from "react";
import UrlBar from "./components/UrlBar";
import ArticleView from "./components/ArticleView";
import TranslationProgress from "./components/TranslationProgress";
import { prepareHtmlForDisplay } from "./utils/htmlCleaner";
import "./App.css";

function App() {
  const [originalContent, setOriginalContent] = useState("");
  const [translatedContent, setTranslatedContent] = useState("");
  const [translationChunks, setTranslationChunks] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [translationProgress, setTranslationProgress] = useState({
    current: 0,
    total: 0,
    isComplete: false,
  });
  const [translationId, setTranslationId] = useState(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationPollInterval, setTranslationPollInterval] = useState(null);

  const leftPanelRef = useRef(null);
  const rightPanelRef = useRef(null);

  // Test API connection on startup and find available port
  useEffect(() => {
    const findApiServer = async () => {
      for (let port = 5000; port <= 5005; port++) {
        try {
          const response = await fetch(`http://localhost:${port}/api/health`);
          if (response.ok) {
            setApiBaseUrl(`http://localhost:${port}`);
            console.log(`Connected to API server on port ${port}`);
            return;
          }
        } catch (e) {
          // Continue trying next port
        }
      }
      setError(
        "Could not connect to API server. Please ensure the server is running."
      );
    };

    findApiServer();
  }, []);

  // Clean up polling on unmount or when translation finishes
  useEffect(() => {
    return () => {
      if (translationPollInterval) {
        clearInterval(translationPollInterval);
      }
    };
  }, [translationPollInterval]);

  // Handle translation chunks updates with proper HTML handling
  useEffect(() => {
    if (translationChunks.length > 0) {
      const hasAnyChunks = translationChunks.some((chunk) => chunk !== null);

      if (hasAnyChunks) {
        // Create a visually distinct display for each chunk
        // Don't use HTML string concatenation, as it will be escaped in the output
        const combinedContent = translationChunks
          .map((chunk, index) =>
            chunk !== null
              ? `<div class="translation-chunk" data-chunk-index="${index}">${chunk}</div>`
              : `<div class="translating-placeholder" data-chunk-index="${index}">Part ${
                  index + 1
                }: [Translating...]</div>`
          )
          .join("");

        setTranslatedContent(combinedContent);
      }
    }
  }, [translationChunks]);

  const handleImport = async (url) => {
    try {
      // Reset states
      setIsLoading(true);
      setError(null);
      setTranslatedContent("");
      setTranslationChunks([]);
      setTranslationProgress({ current: 0, total: 0, isComplete: false });
      setTranslationId(null);
      setIsTranslating(false);

      // Clear any existing polling interval
      if (translationPollInterval) {
        clearInterval(translationPollInterval);
        setTranslationPollInterval(null);
      }

      // Validate API connection
      if (!apiBaseUrl) {
        throw new Error(
          "API server not connected. Please ensure the server is running."
        );
      }

      // Fetch article content
      console.log("Importing article from:", url);
      const response = await fetch(
        `${apiBaseUrl}/api/import?url=${encodeURIComponent(url)}`,
        {
          headers: { "Content-Type": "application/json" },
        }
      );

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: "Failed to import article" }));
        throw new Error(errorData.error || "Failed to import article");
      }

      const data = await response.json();

      if (!data.content || !data.content.trim()) {
        throw new Error("No content could be extracted from the URL");
      }

      // Display original content immediately
      setOriginalContent(data.content);
      console.log(`Fetched article content (${data.content.length} chars)`);

      // Show "starting translation" placeholder
      setTranslatedContent(
        '<div class="translation-pending">Starting translation...</div>'
      );

      // Begin translation process
      await startTranslation(data.content);
    } catch (err) {
      setError(err.message || "An unknown error occurred");
      console.error("Error during article import:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Start the translation process
  const startTranslation = async (content) => {
    try {
      setIsTranslating(true);

      // Send translation request
      const response = await fetch(`${apiBaseUrl}/api/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: content }),
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: "Translation failed" }));
        throw new Error(errorData.error || "Translation failed");
      }

      const data = await response.json();

      // Handle immediate translation response (small content)
      if (data.translatedText) {
        setTranslatedContent(data.translatedText);
        setTranslationProgress({ current: 1, total: 1, isComplete: true });
        setIsTranslating(false);
        return;
      }

      // Handle larger content that requires polling
      if (data.translationId) {
        setTranslationId(data.translationId);
        console.log(
          `Translation job started: ${data.translationId} (${data.totalChunks} chunks)`
        );

        // Initialize progress tracking
        if (data.totalChunks) {
          setTranslationProgress({
            current: 0,
            total: data.totalChunks,
            isComplete: false,
          });

          // Initialize chunks array
          setTranslationChunks(new Array(data.totalChunks).fill(null));

          // Start polling for updates
          startPolling(data.translationId);
        }
      } else {
        throw new Error("Invalid translation response from server");
      }
    } catch (error) {
      console.error("Translation error:", error);
      setError(`Translation error: ${error.message}`);
      setIsTranslating(false);
    }
  };

  // Set up polling for translation updates
  const startPolling = (id) => {
    // Clear any existing polling interval
    if (translationPollInterval) {
      clearInterval(translationPollInterval);
    }

    // Poll more frequently at the beginning, then slower
    let pollCount = 0;
    const maxPolls = 120; // Maximum number of polling attempts (10 minutes max)

    // Do an immediate first poll
    pollTranslation(id);

    // Set up regular polling with dynamic intervals
    const interval = setInterval(() => {
      pollCount++;

      // Increase polling interval over time
      if (pollCount > 20 && pollCount % 3 !== 0) {
        return; // Skip some polls as time goes on
      }

      if (pollCount >= maxPolls) {
        clearInterval(interval);
        setError(
          "Translation is taking too long. The server may be overloaded."
        );
        setIsTranslating(false);
        setTranslationPollInterval(null);
        return;
      }

      pollTranslation(id);
    }, 3000); // Poll every 3 seconds

    setTranslationPollInterval(interval);
  };

  // Perform a single poll for translation status
  const pollTranslation = async (id) => {
    if (!id || !apiBaseUrl) return;

    try {
      const response = await fetch(
        `${apiBaseUrl}/api/translation-status/${id}`
      );

      if (response.status === 404) {
        console.log(`Translation job ${id} not found`);
        clearInterval(translationPollInterval);
        setTranslationPollInterval(null);
        setError("Translation job was lost. Please try again.");
        setIsTranslating(false);
        return;
      }

      if (!response.ok) {
        console.error(
          `Failed to poll translation status: ${response.statusText}`
        );
        return;
      }

      const data = await response.json();

      // Update progress
      if (data.progress) {
        setTranslationProgress({
          current: data.progress.completed,
          total: data.progress.total,
          isComplete: data.status === "completed",
        });
      }

      // Process available chunks and clean HTML issues
      if (data.completedChunks && data.completedChunks.length > 0) {
        setTranslationChunks((prev) => {
          const newChunks = [...prev];

          data.completedChunks.forEach((chunk) => {
            if (
              chunk &&
              typeof chunk.index === "number" &&
              chunk.index >= 0 &&
              chunk.index < newChunks.length
            ) {
              // Store the cleaned chunk
              newChunks[chunk.index] = chunk.text;
            }
          });

          return newChunks;
        });
      }

      // Handle completion with HTML cleaning
      if (data.status === "completed") {
        console.log("Translation completed");

        if (data.translatedText) {
          // Final translation is already cleaned on the server side
          setTranslatedContent(data.translatedText);
        }

        // Clean up
        clearInterval(translationPollInterval);
        setTranslationPollInterval(null);
        setIsTranslating(false);
      }

      // Handle errors
      if (data.status === "error") {
        setError(`Translation error: ${data.error || "Unknown error"}`);
        clearInterval(translationPollInterval);
        setTranslationPollInterval(null);
        setIsTranslating(false);
      }
    } catch (error) {
      console.error("Error polling for translation:", error);
    }
  };

  // Sync scroll between panels
  useEffect(() => {
    const leftPanel = leftPanelRef.current;
    const rightPanel = rightPanelRef.current;

    if (!leftPanel || !rightPanel) return;

    const handleLeftScroll = () => {
      const scrollPercentage =
        leftPanel.scrollTop / (leftPanel.scrollHeight - leftPanel.clientHeight);
      rightPanel.scrollTop =
        scrollPercentage * (rightPanel.scrollHeight - rightPanel.clientHeight);
    };

    const handleRightScroll = () => {
      const scrollPercentage =
        rightPanel.scrollTop /
        (rightPanel.scrollHeight - rightPanel.clientHeight);
      leftPanel.scrollTop =
        scrollPercentage * (leftPanel.scrollHeight - leftPanel.clientHeight);
    };

    leftPanel.addEventListener("scroll", handleLeftScroll);
    rightPanel.addEventListener("scroll", handleRightScroll);

    return () => {
      leftPanel.removeEventListener("scroll", handleLeftScroll);
      rightPanel.removeEventListener("scroll", handleRightScroll);
    };
  }, [originalContent, translatedContent]);

  return (
    <div className="app">
      <header className="app-header">
        <UrlBar
          onImport={handleImport}
          isLoading={isLoading || isTranslating}
        />
        <div className="status-indicators">
          {apiBaseUrl ? (
            <div className="api-status connected">API: {apiBaseUrl}</div>
          ) : (
            <div className="api-status disconnected">API disconnected</div>
          )}

          {isTranslating && (
            <div className="translation-status active">
              Translation in progress
            </div>
          )}
        </div>
      </header>

      <main className="content-container">
        {error && <div className="error-message">{error}</div>}

        {translationProgress.total > 0 && (
          <TranslationProgress
            current={translationProgress.current}
            total={translationProgress.total}
            isComplete={translationProgress.isComplete}
          />
        )}

        <div className="panels-container">
          <ArticleView
            title="Original Article"
            content={originalContent}
            isLoading={isLoading}
            ref={leftPanelRef}
          />
          <ArticleView
            title="Translation"
            content={translatedContent}
            isLoading={false}
            ref={rightPanelRef}
          />
        </div>
      </main>
    </div>
  );
}

export default App;
