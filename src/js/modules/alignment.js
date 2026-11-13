/**
 * Alignment Checker module for detecting and highlighting misaligned elements
 */

import {
  isPartOfTool,
  isElementVisible,
  getTrimmedMedian,
  isLayoutContainer,
} from "./utils.js";
import {
  createTooltip,
  updateStatus,
  updateCounts,
  resetCounts,
} from "./popup.js";
import {
  clearHighlights,
  applySeverityHighlights,
  setupTooltip,
} from "./highlights.js";

// Store misaligned elements by severity
let misalignedMap = {
  high: new Set(),
  medium: new Set(),
  low: new Set(),
};

// Track original reasons by severity
let reasonsBySeverity = {
  high: new Map(),
  medium: new Map(),
  low: new Map(),
};

/**
 * Get all visible elements in the document
 * @returns {Element[]} Array of visible elements
 */
function getVisibleElements() {
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_ELEMENT,
    {
      acceptNode(node) {
        // Specifically skip radio buttons and their containers
        if (node.tagName === "INPUT" && node.type === "radio") {
          return NodeFilter.FILTER_REJECT;
        }

        // Skip labels or divs containing radio buttons
        if (node.querySelector && node.querySelector('input[type="radio"]')) {
          return NodeFilter.FILTER_REJECT;
        }

        // Skip if part of the extension itself
        if (isPartOfTool(node)) return NodeFilter.FILTER_REJECT;

        const style = getComputedStyle(node);
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          style.opacity === "0"
        )
          return NodeFilter.FILTER_REJECT;
        const rect = node.getBoundingClientRect();
        return rect.width >= 4 && rect.height >= 4
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    }
  );
  const elements = [];
  while (walker.nextNode()) elements.push(walker.currentNode);
  return elements;
}

/**
 * Cluster elements based on position
 * @param {Element[]} elements - Elements to cluster
 * @param {string} dimension - Dimension to use for clustering ('top' or 'left')
 * @returns {Element[][]} Array of element clusters
 */
function clusterElements(elements, dimension) {
  const viewportSize =
    dimension === "top" ? window.innerHeight : window.innerWidth;
  const baseThreshold = viewportSize * 0.015;

  elements.sort((a, b) => {
    const aVal = a.getBoundingClientRect()[dimension];
    const bVal = b.getBoundingClientRect()[dimension];
    return aVal - bVal;
  });

  // Calculate adaptive threshold
  const spacings = [];
  for (let i = 1; i < elements.length; i++) {
    const prev = elements[i - 1].getBoundingClientRect()[dimension];
    const curr = elements[i].getBoundingClientRect()[dimension];
    spacings.push(Math.abs(curr - prev));
  }
  const medianSpacing =
    spacings.sort((a, b) => a - b)[Math.floor(spacings.length / 2)] || 0;
  const threshold = Math.max(baseThreshold, medianSpacing * 0.7);

  let clusters = [],
    current = [],
    lastPos = null;
  elements.forEach((el) => {
    const pos = el.getBoundingClientRect()[dimension];
    if (lastPos === null || Math.abs(pos - lastPos) <= threshold) {
      current.push(el);
    } else {
      if (current.length >= 3) clusters.push(current);
      current = [el];
    }
    lastPos = pos;
  });
  if (current.length >= 3) clusters.push(current);
  return clusters;
}

/**
 * Store element issues by severity level
 * @param {Element} el - The element with issues
 * @param {number} score - Issue score
 * @param {string[]} reasons - Array of reason strings
 */
function recordElementIssue(el, score, reasons) {
  // Determine severity based on score
  let severity;
  if (score >= 8) severity = "high";
  else if (score >= 5) severity = "medium";
  else if (score >= 3) severity = "low";
  else return; // Not significant enough

  // Store the element in the appropriate set
  misalignedMap[severity].add(el);

  // Store the reasons for this severity
  const existingReasons = reasonsBySeverity[severity].get(el) || "";
  const updatedReasons = existingReasons
    ? `${existingReasons}; ${reasons.join("; ")}`
    : reasons.join("; ");

  reasonsBySeverity[severity].set(el, updatedReasons);
}

/**
 * Main function to detect misaligned elements
 * @param {string} initialSeverity - Severity level to highlight initially
 */
export function detectMisalignedElements(initialSeverity = "high") {
  // Reset tracking
  clearHighlights();
  misalignedMap.high.clear();
  misalignedMap.medium.clear();
  misalignedMap.low.clear();
  reasonsBySeverity.high.clear();
  reasonsBySeverity.medium.clear();
  reasonsBySeverity.low.clear();

  const elements = getVisibleElements();

  // Update status in popup
  updateStatus("Scanning...", "scanning");
  resetCounts();

  // Process rows
  const rows = clusterElements(elements, "top");
  rows.forEach((row) => {
    const rects = row.map((el) => ({
      el,
      rect: el.getBoundingClientRect(),
      isLayout: isLayoutContainer(el.parentElement),
    }));

    const tops = rects.map((r) => r.rect.top);
    const heights = rects.map((r) => r.rect.height);
    const medianTop = getTrimmedMedian(tops);
    const medianHeight = getTrimmedMedian(heights);

    rects.forEach(({ el, rect, isLayout }) => {
      let score = 0,
        reasons = [];

      // Vertical checks
      const topDiff = Math.abs(rect.top - medianTop);
      const topThreshold = isLayout ? 8 : 4;
      if (topDiff > topThreshold) {
        const issueScore = topDiff > 10 ? 3 : topDiff > 6 ? 2 : 1;
        score += issueScore;
        reasons.push(`Vertical offset: ${Math.round(topDiff)}px`);
      }

      const heightDiff = Math.abs(rect.height - medianHeight);
      const heightThreshold = rect.height * 0.1;
      if (heightDiff > heightThreshold) {
        const issueScore =
          heightDiff > heightThreshold * 2
            ? 3
            : heightDiff > heightThreshold * 1.5
            ? 2
            : 1;
        score += issueScore;
        reasons.push(`Height variance: ${Math.round(heightDiff)}px`);
      }

      if (score > 0) recordElementIssue(el, score, reasons);
    });
  });

  // Process columns
  const columns = clusterElements(elements, "left");
  columns.forEach((col) => {
    const rects = col.map((el) => ({
      el,
      rect: el.getBoundingClientRect(),
      isLayout: isLayoutContainer(el.parentElement),
    }));

    const lefts = rects.map((r) => r.rect.left);
    const widths = rects.map((r) => r.rect.width);
    const medianLeft = getTrimmedMedian(lefts);
    const medianWidth = getTrimmedMedian(widths);

    rects.forEach(({ el, rect, isLayout }) => {
      let score = 0,
        reasons = [];

      // Horizontal checks
      const leftDiff = Math.abs(rect.left - medianLeft);
      const leftThreshold = isLayout ? 8 : 4;
      if (leftDiff > leftThreshold) {
        const issueScore = leftDiff > 10 ? 3 : leftDiff > 6 ? 2 : 1;
        score += issueScore;
        reasons.push(`Horizontal offset: ${Math.round(leftDiff)}px`);
      }

      const widthDiff = Math.abs(rect.width - medianWidth);
      const widthThreshold = rect.width * 0.1;
      if (widthDiff > widthThreshold) {
        const issueScore =
          widthDiff > widthThreshold * 2
            ? 3
            : widthDiff > widthThreshold * 1.5
            ? 2
            : 1;
        score += issueScore;
        reasons.push(`Width variance: ${Math.round(widthDiff)}px`);
      }

      if (score > 0) recordElementIssue(el, score, reasons);
    });
  });

  // Update counts in popup
  const counts = {
    high: misalignedMap.high.size,
    medium: misalignedMap.medium.size,
    low: misalignedMap.low.size,
  };
  updateCounts(counts);

  // Apply highlights for selected severity
  applySeverityHighlights(initialSeverity, misalignedMap, reasonsBySeverity);
}

/**
 * Get the misaligned elements map for sharing with other modules
 * @returns {Object} Map of misaligned elements by severity
 */
export function getMisalignedMap() {
  return misalignedMap;
}

/**
 * Get the reasons by severity map for sharing with other modules
 * @returns {Object} Map of reasons by severity
 */
export function getReasonsBySeverity() {
  return reasonsBySeverity;
}
