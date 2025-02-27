import React, { forwardRef } from "react";
import { FaSpinner } from "react-icons/fa";
import DOMPurify from "dompurify";
import { prepareHtmlForDisplay } from "../utils/htmlCleaner";
import "./ArticleView.css";

const ArticleView = forwardRef(({ title, content, isLoading }, ref) => {
  // Safely render HTML content with sanitization and cleaning
  const createMarkup = (htmlContent) => {
    // First clean the HTML to remove tag name artifacts
    const cleanedHtml = prepareHtmlForDisplay(htmlContent);

    // Then sanitize with DOMPurify to prevent XSS attacks
    return { __html: DOMPurify.sanitize(cleanedHtml) };
  };

  return (
    <div className="article-container" ref={ref}>
      <h2 className="article-title">{title}</h2>

      {isLoading ? (
        <div className="loading-container">
          <FaSpinner className="spinner" />
          <p>Loading content...</p>
        </div>
      ) : content ? (
        <div
          className="article-content"
          dangerouslySetInnerHTML={createMarkup(content)}
        />
      ) : (
        <div className="empty-state">
          <p>No content to display. Import an article to get started.</p>
        </div>
      )}
    </div>
  );
});

// Add display name for React DevTools
ArticleView.displayName = "ArticleView";

export default ArticleView;
