import React, { useState } from "react";
import { FaSpinner, FaGlobe } from "react-icons/fa";
import "./UrlBar.css";

const UrlBar = ({ onImport, isLoading }) => {
  const [url, setUrl] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (url.trim()) {
      onImport(url.trim());
    }
  };

  return (
    <div className="url-bar-container">
      <form onSubmit={handleSubmit} className="url-bar-form">
        <div className="input-container">
          <FaGlobe className="url-icon" />
          <input
            type="url"
            placeholder="Enter article URL..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={isLoading}
            required
            className="url-input"
          />
        </div>
        <button
          type="submit"
          className="import-button"
          disabled={isLoading || !url.trim()}
        >
          {isLoading ? (
            <>
              <FaSpinner className="spinner" /> Importing...
            </>
          ) : (
            "Import"
          )}
        </button>
      </form>
    </div>
  );
};

export default UrlBar;
