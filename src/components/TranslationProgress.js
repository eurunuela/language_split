import React from "react";
import { FaSpinner } from "react-icons/fa";
import "./TranslationProgress.css";

const TranslationProgress = ({ current, total, isComplete }) => {
  if (!total) return null;

  const percentage = Math.round((current / total) * 100);

  return (
    <div className="translation-progress">
      <div className="progress-bar-container">
        <div
          className="progress-bar-fill"
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
      <div className="progress-text">
        {isComplete ? (
          <span className="complete">Translation complete!</span>
        ) : (
          <>
            <FaSpinner className="spinner" />
            <span>
              Translating: {current} of {total} chunks ({percentage}%)
            </span>
          </>
        )}
      </div>
    </div>
  );
};

export default TranslationProgress;
