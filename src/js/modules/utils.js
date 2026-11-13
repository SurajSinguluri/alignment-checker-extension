/**
 * Utility functions for the Alignment Checker extension
 */

/**
 * Check if an element is part of the tool itself
 * @param {Element} element - DOM element to check
 * @returns {boolean} True if the element is part of the extension UI
 */
export function isPartOfTool(element) {
  // Extension popup and its elements
  if (
    element.id?.includes("alignment-checker") ||
    element.classList?.contains("alignment-tooltip") ||
    element.classList?.contains("alignment-checker-popup") ||
    element.closest(".alignment-checker-popup") ||
    element.closest(".alignment-tooltip")
  ) {
    return true;
  }

  // Specifically protect radio buttons and their containers
  if (element.tagName === "INPUT" && element.type === "radio") {
    return true;
  }

  if (element.querySelector && element.querySelector('input[type="radio"]')) {
    return true;
  }

  return false;
}

/**
 * Checks if an element is visible in the DOM
 * @param {Element} element - DOM element to check
 * @returns {boolean} True if the element is visible
 */
export function isElementVisible(element) {
  if (!element) return false;

  // Check if element has dimensions
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;

  // Advanced check for actual visibility using computed style
  const style = window.getComputedStyle(element);
  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    style.opacity === "0" ||
    style.width === "0px" ||
    style.height === "0px"
  ) {
    return false;
  }

  return true;
}

/**
 * Calculate the trimmed median of an array of values
 * @param {number[]} values - Array of numeric values
 * @param {number} trim - Percentage (0-1) of values to trim from each end
 * @returns {number} The trimmed median value
 */
export function getTrimmedMedian(values, trim = 0.1) {
  const sorted = [...values].sort((a, b) => a - b);
  const trimCount = Math.floor(sorted.length * trim);
  return (
    sorted
      .slice(trimCount, sorted.length - trimCount)
      .reduce((a, b) => a + b, 0) /
    (sorted.length - 2 * trimCount)
  );
}

/**
 * Check if element is a layout container (flex, grid, or absolute positioned)
 * @param {Element} el - Element to check
 * @returns {boolean} True if the element is a layout container
 */
export function isLayoutContainer(el) {
  const style = getComputedStyle(el);
  return (
    ["flex", "grid"].includes(style.display) || style.position === "absolute"
  );
}

/**
 * Creates a friendly explanation for tooltips
 * @param {string} reasons - Semicolon-separated reasons for misalignment
 * @param {string} severity - Severity level (high, medium, low)
 * @returns {string} HTML for the tooltip content
 */
export function createFriendlyExplanation(reasons, severity) {
  const severityColors = {
    high: "#ef4444",
    medium: "#f97316",
    low: "#eab308",
  };

  const reasonTranslations = {
    "Vertical offset":
      "This element is positioned differently vertically compared to similar elements",
    "Horizontal offset":
      "This element is positioned differently horizontally compared to similar elements",
    "Height variance":
      "This element has a different height than others in its row",
    "Width variance":
      "This element has a different width than others in its column",
    "Spacing difference":
      "The spacing between this and adjacent elements is inconsistent",
    "Padding mismatch":
      "This element has different internal spacing compared to similar elements",
    "Margin mismatch":
      "This element has different external spacing compared to similar elements",
  };

  const listItems = reasons
    .split("; ")
    .map((reason) => {
      const [type, value] = reason.split(": ");
      const friendlyText = reasonTranslations[type] || type;
      return `<li class="tooltip-reason">${friendlyText} (${value})</li>`;
    })
    .join("");

  return `
    <div class="tooltip-header">
      <div class="tooltip-dot" style="background: ${
        severityColors[severity]
      }"></div>
      ${severity.charAt(0).toUpperCase() + severity.slice(1)} Severity Issue
    </div>
    <ul class="tooltip-reasons">${listItems}</ul>
  `;
}
