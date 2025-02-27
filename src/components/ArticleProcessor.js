import React from "react";

/**
 * Process and optimize article content for display
 */
const ArticleProcessor = ({ content }) => {
  // Function to sanitize and optimize HTML content
  const processContent = (htmlContent) => {
    if (!htmlContent) return "";

    // Remove any potentially dangerous scripts
    const sanitized = htmlContent
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/on\w+="[^"]*"/g, ""); // Remove inline event handlers

    return sanitized;
  };

  return (
    <div
      className="processed-article"
      dangerouslySetInnerHTML={{ __html: processContent(content) }}
    />
  );
};

export default ArticleProcessor;
