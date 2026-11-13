/**
 * Highlight management module for the Alignment Checker extension
 */

import { isPartOfTool } from "./utils.js";
import { createTooltip, updateStatus, resetCounts } from "./popup.js";

// Keep track of broken images
let brokenImages = new Set();

/**
 * Define tooltip event handlers
 * @param {Map} reasonsBySeverity - Map containing reasons for each element's issues
 */
let showTooltipHandler;
let hideTooltipHandler;

function setupTooltipHandlers(reasonsBySeverity) {
  // Define the show tooltip handler if not already defined
  showTooltipHandler = function (e) {
    const tooltip = createTooltip();
    const element = this;
    const severity = element.classList.contains("alignment-checker-high")
      ? "high"
      : element.classList.contains("alignment-checker-medium")
      ? "medium"
      : "low";

    // Use severity-specific reasons
    const reasons = reasonsBySeverity[severity].get(element);
    if (!reasons) return;

    // Import the createFriendlyExplanation function dynamically to avoid circular dependencies
    import("./utils.js").then((utils) => {
      tooltip.innerHTML = utils.createFriendlyExplanation(reasons, severity);
      tooltip.style.opacity = "1";

      const rect = element.getBoundingClientRect();
      tooltip.style.left = `${rect.left + window.scrollX + 10}px`;
      tooltip.style.top = `${rect.top + window.scrollY + rect.height + 5}px`;

      // Ensure tooltip stays within viewport
      const tooltipRect = tooltip.getBoundingClientRect();
      if (tooltipRect.right > window.innerWidth) {
        tooltip.style.left = `${window.innerWidth - tooltipRect.width - 10}px`;
      }
      if (tooltipRect.bottom > window.innerHeight) {
        tooltip.style.top = `${
          rect.top + window.scrollY - tooltipRect.height - 5
        }px`;
      }
    });
  };

  // Define the hide tooltip handler if not already defined
  hideTooltipHandler = function () {
    const tooltip = createTooltip();
    tooltip.style.opacity = "0";

    const originalTitle = this.dataset.originalTitle;
    if (originalTitle) {
      this.setAttribute("title", originalTitle);
    }
  };
}

/**
 * Set up tooltip for an element
 * @param {Element} element - The element to attach tooltip to
 * @param {string} severity - Severity level
 * @param {Map} reasonsBySeverity - Map containing reasons for each element's issues
 */
export function setupTooltip(element, severity, reasonsBySeverity) {
  // Make sure the tooltip handlers are defined
  if (!showTooltipHandler || !hideTooltipHandler) {
    setupTooltipHandlers(reasonsBySeverity);
  }

  const tooltip = createTooltip();
  const originalTitle = element.getAttribute("title") || "";
  element.removeAttribute("title");

  // Add event listeners
  element.addEventListener("mouseenter", showTooltipHandler);
  element.addEventListener("mouseleave", hideTooltipHandler);
}

/**
 * Apply highlights for selected severity
 * @param {string} severity - Severity level to highlight
 * @param {Object} misalignedMap - Map of misaligned elements by severity
 * @param {Object} reasonsBySeverity - Map of reasons by severity
 */
export function applySeverityHighlights(
  severity,
  misalignedMap,
  reasonsBySeverity
) {
  // Clear only alignment highlights, not broken image highlights
  const alignmentHighlights = document.querySelectorAll(
    ".alignment-checker-high, .alignment-checker-medium, .alignment-checker-low"
  );

  alignmentHighlights.forEach((el) => {
    // Remove alignment classes only
    el.classList.remove(
      "alignment-checker-high",
      "alignment-checker-medium",
      "alignment-checker-low"
    );

    // Restore original title if not a broken image
    if (!el.classList.contains("alignment-checker-broken-image")) {
      if (el.dataset.originalTitle) {
        el.setAttribute("title", el.dataset.originalTitle);
        delete el.dataset.originalTitle;
      } else {
        el.removeAttribute("title");
      }

      // Remove tooltip event listeners
      el.removeEventListener("mouseenter", showTooltipHandler);
      el.removeEventListener("mouseleave", hideTooltipHandler);
    }
  });

  const elements = misalignedMap[severity];

  // Update display in popup
  updateStatus(
    elements.size === 0
      ? `No ${severity} severity issues found`
      : `Found ${elements.size} ${severity} severity issues`,
    elements.size === 0 ? "success" : severity === "high" ? "error" : "warning"
  );

  if (elements.size === 0) {
    return;
  }

  elements.forEach((el) => {
    if (!isPartOfTool(el)) {
      el.classList.add(`alignment-checker-${severity}`);
      el.dataset.originalTitle = el.getAttribute("title") || "";
      setupTooltip(el, severity, reasonsBySeverity);
    }
  });
}

/**
 * Clear all highlights
 */
export function clearHighlights() {
  // Find all highlighted elements
  const highlightedElements = document.querySelectorAll(
    ".alignment-checker-high, .alignment-checker-medium, .alignment-checker-low, .alignment-checker-broken-image"
  );

  // Process each highlighted element
  highlightedElements.forEach((el) => {
    // Remove all highlight classes
    el.classList.remove(
      "alignment-checker-high",
      "alignment-checker-medium",
      "alignment-checker-low",
      "alignment-checker-broken-image"
    );

    // Restore original title
    if (el.dataset.originalTitle) {
      el.setAttribute("title", el.dataset.originalTitle);
      delete el.dataset.originalTitle;
    } else {
      el.removeAttribute("title");
    }

    // Remove tooltip event listeners
    el.removeEventListener("mouseenter", showTooltipHandler);
    el.removeEventListener("mouseleave", hideTooltipHandler);
  });

  // Remove any additional elements that might have been created
  document
    .querySelectorAll(".broken-image-overlay, .broken-image-icon")
    .forEach((el) => {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    });

  // Hide tooltip if visible
  const tooltip = createTooltip();
  if (tooltip) {
    tooltip.style.opacity = "0";
  }

  // Clear tracking sets for broken images
  brokenImages.clear();

  // Reset only broken images count, not alignment counts
  const brokenImagesCount = document.getElementById(
    "alignment-checker-broken-count"
  );
  if (brokenImagesCount) {
    brokenImagesCount.textContent = "0";
    brokenImagesCount.setAttribute("data-count", "0");
    brokenImagesCount.style.color = "";
  }

  // Reset broken images status message
  const statusMessage = document.querySelector(
    ".alignment-checker-broken-status"
  );
  if (statusMessage) {
    statusMessage.textContent = "Run scan to find broken images";
    statusMessage.style.color = "#64748b";
  }

  // Update status
  updateStatus("Highlights cleared", "success");
}

/**
 * Mark an image as broken with appropriate UI indicators
 * @param {Element} img - The broken image element
 * @param {string} reason - Reason why the image is broken
 */
export function markBrokenImage(img, reason = "Unable to load") {
  // Skip if already marked
  if (img.classList.contains("alignment-checker-broken-image")) {
    return;
  }

  // Store original title
  if (img.title) {
    img.dataset.originalTitle = img.title;
  }

  // Add class for styling (this applies the outline via CSS)
  img.classList.add("alignment-checker-broken-image");

  // Set a title with the reason
  img.title = `Broken image: ${reason}`;

  // Add to global set of broken images
  brokenImages.add(img);
}

/**
 * Clear broken image highlights
 */
export function clearBrokenImageHighlights() {
  // Find all broken image elements
  const brokenImageElements = document.querySelectorAll(
    ".alignment-checker-broken-image"
  );

  // Remove the highlighting class
  brokenImageElements.forEach((el) => {
    el.classList.remove("alignment-checker-broken-image");

    // Restore original title
    if (el.dataset.originalTitle) {
      el.title = el.dataset.originalTitle;
      delete el.dataset.originalTitle;
    } else {
      el.removeAttribute("title");
    }
  });

  // Clear the tracking set
  brokenImages.clear();

  // Reset only broken images count
  const brokenImagesCount = document.getElementById(
    "alignment-checker-broken-count"
  );
  if (brokenImagesCount) {
    brokenImagesCount.textContent = "0";
    brokenImagesCount.setAttribute("data-count", "0");
    brokenImagesCount.style.color = "";
  }

  // Update status message
  const statusMessage = document.querySelector(
    ".alignment-checker-broken-status"
  );
  if (statusMessage) {
    statusMessage.textContent = "Run scan to find broken images";
    statusMessage.style.color = "#64748b";
  }

  // Update status
  updateStatus("Broken image highlights cleared", "success");
}

/**
 * Get the broken images set for sharing with other modules
 * @returns {Set} Set of broken image elements
 */
export function getBrokenImages() {
  return brokenImages;
}

/**
 * Clear only alignment-related highlights
 */
export function clearAlignmentHighlights() {
  // Find all alignment highlighted elements
  const alignmentHighlights = document.querySelectorAll(
    ".alignment-checker-high, .alignment-checker-medium, .alignment-checker-low"
  );

  // Process each highlighted element
  alignmentHighlights.forEach((el) => {
    // Remove alignment classes only
    el.classList.remove(
      "alignment-checker-high",
      "alignment-checker-medium",
      "alignment-checker-low"
    );

    // Restore original title if not also a broken image
    if (!el.classList.contains("alignment-checker-broken-image")) {
      if (el.dataset.originalTitle) {
        el.setAttribute("title", el.dataset.originalTitle);
        delete el.dataset.originalTitle;
      } else {
        el.removeAttribute("title");
      }

      // Remove tooltip event listeners
      el.removeEventListener("mouseenter", showTooltipHandler);
      el.removeEventListener("mouseleave", hideTooltipHandler);
    }
  });

  // Hide tooltip if visible
  const tooltip = createTooltip();
  if (tooltip) {
    tooltip.style.opacity = "0";
  }

  // Update status
  updateStatus("Alignment highlights cleared", "success");
}
