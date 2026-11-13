/**
 * Paltech Alignment Checker - Content Script
 * Main entry point for the extension
 */

import {
  detectMisalignedElements,
  getMisalignedMap,
  getReasonsBySeverity,
} from "./modules/alignment.js";
import { detectBrokenImages } from "./modules/brokenImages.js";
import {
  showPopup,
  hidePopup,
  createPopup,
  updateStatus,
  resetCounts,
} from "./modules/popup.js";
import {
  clearHighlights,
  clearBrokenImageHighlights,
  clearAlignmentHighlights,
  applySeverityHighlights,
} from "./modules/highlights.js";
import { initialize as initializeSpellChecker } from "./modules/spellChecker.js";

/**
 * Initialize the extension
 */
function initialize() {
  console.log("Initializing Paltech UI Checker extension");

  // Set up event listeners for custom events
  document.addEventListener("alignment-checker-check", (e) => {
    detectMisalignedElements(e.detail.severity);
  });

  document.addEventListener("alignment-checker-severity-change", (e) => {
    applySeverityHighlights(
      e.detail.severity,
      getMisalignedMap(),
      getReasonsBySeverity()
    );
  });

  // Clear all highlights
  document.addEventListener("alignment-checker-clear", () => {
    clearHighlights();
  });

  // Clear only alignment highlights
  document.addEventListener("alignment-checker-clear-alignment", () => {
    clearAlignmentHighlights();
  });

  // Clear only broken image highlights
  document.addEventListener("alignment-checker-clear-images", () => {
    clearBrokenImageHighlights();
  });

  document.addEventListener("alignment-checker-check-images", () => {
    detectBrokenImages();
  });

  // Initialize the spell checker
  console.log("Initializing spell checker module");
  try {
    initializeSpellChecker();
    console.log("Spell checker module initialized successfully");
  } catch (error) {
    console.error("Error initializing spell checker:", error);
  }

  // Setup listener for Chrome extension messages
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Received message:", message);

    if (message.action === "showPopup") {
      showPopup(message.tab || "alignment");
      sendResponse({ success: true });
    } else if (message.action === "hidePopup") {
      hidePopup();
      sendResponse({ success: true });
    } else if (message.action === "checkAlignment") {
      showPopup("alignment");
      detectMisalignedElements(message.severity || "high");
      sendResponse({ success: true });
    } else if (message.action === "clearHighlights") {
      clearHighlights();
      sendResponse({ success: true });
    } else if (message.action === "changeSeverity") {
      applySeverityHighlights(
        message.severity,
        getMisalignedMap(),
        getReasonsBySeverity()
      );
      sendResponse({ success: true });
    } else if (message.action === "checkBrokenImages") {
      showPopup("images");
      detectBrokenImages();
      sendResponse({ success: true });
    } else if (message.action === "checkSpelling") {
      console.log("Opening spell checker tab");
      showPopup("spellchecker");
      // The event listener will handle this
      document.dispatchEvent(new CustomEvent("spell-checker-check"));
      sendResponse({ success: true });
    } else if (message.action === "openPopup") {
      showPopup(message.tab || "alignment");
      sendResponse({ success: true });
    }
    return true; // Required for async response
  });

  // Set up resize handler
  window.addEventListener("resize", () => {
    // Refresh tooltips if needed
    const tooltip = document.querySelector(".alignment-tooltip");
    if (tooltip && tooltip.style.opacity === "1") {
      // Force reposition of visible tooltips
      const highlightedElement = document.querySelector(
        ".alignment-checker-high, .alignment-checker-medium, .alignment-checker-low, .alignment-checker-broken-image"
      );
      if (highlightedElement) {
        const mouseoutEvent = new MouseEvent("mouseleave");
        const mouseenterEvent = new MouseEvent("mouseenter");
        highlightedElement.dispatchEvent(mouseoutEvent);
        highlightedElement.dispatchEvent(mouseenterEvent);
      }
    }
  });
}

console.log("Content script loaded");

// Call initialize when the page is loaded
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}
