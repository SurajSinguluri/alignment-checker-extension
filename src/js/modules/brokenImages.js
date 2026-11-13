/**
 * Broken Image Detection module for the Alignment Checker extension
 */

import { isPartOfTool, isElementVisible } from "./utils.js";
import {
  updateStatus,
  updateBrokenImagesUI,
  resetCheckImagesButton,
} from "./popup.js";
import {
  markBrokenImage,
  clearBrokenImageHighlights,
  getBrokenImages,
} from "./highlights.js";

// Mutation observer for detecting new images
let observer;
let rescanTimeout;

/**
 * Get the image source from various attributes and CSS properties
 * @param {Element} img - The image element to check
 * @returns {string|null} The image source URL or null if not found
 */
function getImageSource(img) {
  // Base sources - direct attributes
  const mainSrc = img.src || img.currentSrc || null;

  // Handle data attributes - expanded list of common lazy-loading patterns
  const dataSources = [
    "src",
    "original",
    "lazySrc",
    "srcLazy",
    "imgSrc",
    "lazyload",
    "lazySrcset",
    "srcset",
    "original-src",
    "load-src",
    "data-src",
    "img",
    "large",
    "medium",
    "small",
    "thumbnail",
    "bg",
    "retina",
    "lazy",
    "placeholder",
    "origin",
    "main-src",
    "delayed",
    "postponed",
    "url",
    "defer-src",
    "async-src",
    "low-src",
    "hi-res",
    "full",
  ];

  // Check all possible data attributes
  for (const attr of dataSources) {
    if (img.dataset && img.dataset[attr]) {
      return img.dataset[attr];
    }
  }

  // Check for srcset first value
  if (img.srcset) {
    const firstSrcSet = img.srcset.split(",")[0];
    if (firstSrcSet) {
      const srcValue = firstSrcSet.trim().split(" ")[0];
      if (srcValue) return srcValue;
    }
  }

  // Check for background image in style
  if (img.style && img.style.backgroundImage) {
    const bgMatch = img.style.backgroundImage.match(
      /url\(['"]?([^'"]+)['"]?\)/i
    );
    if (bgMatch && bgMatch[1]) return bgMatch[1];
  }

  // Check for inline style background image attribute
  const inlineStyle = img.getAttribute("style");
  if (inlineStyle) {
    const bgInlineMatch = inlineStyle.match(
      /background(-image)?:\s*url\(['"]?([^'"]+)['"]?\)/i
    );
    if (bgInlineMatch && bgInlineMatch[2]) return bgInlineMatch[2];
  }

  // Check for CSS computed styles as a last resort
  const computedStyle = getComputedStyle(img);
  if (
    computedStyle.backgroundImage &&
    computedStyle.backgroundImage !== "none"
  ) {
    const bgCompMatch = computedStyle.backgroundImage.match(
      /url\(['"]?([^'"]+)['"]?\)/i
    );
    if (bgCompMatch && bgCompMatch[1]) return bgCompMatch[1];
  }

  // For elements with role="img", try to find an image inside or a background
  if (img.getAttribute("role") === "img") {
    // Check for nested img
    const nestedImg = img.querySelector("img");
    if (nestedImg) return getImageSource(nestedImg);

    // Check for aria-label as fallback
    if (img.hasAttribute("aria-label")) {
      return null; // Has a label but no visual - not broken
    }
  }

  // Return the main source or null if nothing found
  return mainSrc;
}

/**
 * Test if an image loads successfully
 * @param {string} src - Image source URL
 * @param {string|null} srcset - Optional srcset attribute
 * @param {string|null} sizes - Optional sizes attribute
 * @returns {Promise<Object>} Result object with success flag and reason
 */
async function testImageLoading(src, srcset = null, sizes = null) {
  return new Promise((resolve) => {
    if (!src && !srcset) {
      resolve({ success: false, reason: "No image source found" });
      return;
    }

    // Handle relative URLs
    if (src && !src.match(/^(https?:\/\/|data:|blob:|\/)/i)) {
      // Convert relative URL to absolute
      src = new URL(src, window.location.href).href;
    }

    // Improved handling of data URLs
    if (src && src.startsWith("data:")) {
      // Skip data URLs that aren't images
      if (!src.startsWith("data:image/")) {
        resolve({
          success: false,
          reason: "Non-image data URL or invalid format",
        });
        return;
      }

      // Handle empty or malformed data URLs
      if (
        src === "data:image/png;base64," ||
        src === "data:image/jpeg;base64," ||
        src.split(",").length < 2
      ) {
        resolve({ success: false, reason: "Empty or invalid data URL" });
        return;
      }
    }

    // Better detection of problematic URLs
    if (src) {
      // Check for obviously invalid URLs
      if (
        src === "about:blank" ||
        src === "javascript:void(0)" ||
        src.startsWith("file:")
      ) {
        resolve({ success: false, reason: "Invalid image URL format" });
        return;
      }

      // Additional check for cross-origin restrictions
      if (src.startsWith("http:") && window.location.protocol === "https:") {
        resolve({
          success: false,
          reason: "Mixed content (HTTP image on HTTPS page)",
        });
        return;
      }
    }

    const testImage = new Image();

    // Add CORS attribute for external images to avoid tainted canvas
    testImage.crossOrigin = "anonymous";

    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      resolve({ success: false, reason: "Image load timeout (8s)" });
    }, 8000); // Increased timeout for slower connections

    // Success handler with additional checks
    testImage.addEventListener(
      "load",
      () => {
        clearTimeout(timeoutId);

        // Additional validation for actual image content
        // Check if image has real dimensions (not a 1x1 transparent pixel)
        const hasSufficientDimensions =
          testImage.naturalWidth > 1 && testImage.naturalHeight > 1;

        // Check for tiny images that might be placeholders
        const isTooSmall =
          testImage.naturalWidth < 5 && testImage.naturalHeight < 5;

        // Success only if dimensions are sufficient and not too small
        if (hasSufficientDimensions && !isTooSmall) {
          resolve({ success: true, reason: "" });
        } else if (isTooSmall) {
          resolve({
            success: false,
            reason: `Likely placeholder (${testImage.naturalWidth}x${testImage.naturalHeight}px)`,
          });
        } else {
          resolve({
            success: false,
            reason: "Missing dimensions",
          });
        }
      },
      { signal: controller.signal }
    );

    // Error handler with more detailed error reporting
    testImage.addEventListener(
      "error",
      (e) => {
        clearTimeout(timeoutId);

        // Try to get more specific error information
        let errorReason = "Failed to load image";

        // Check for common error scenarios
        if (e.target && e.target.error) {
          errorReason = e.target.error.message || errorReason;
        }

        // For network errors, try to be more specific
        if (src) {
          if (
            src.startsWith("http:") &&
            window.location.protocol === "https:"
          ) {
            errorReason = "Mixed content error (HTTP image on HTTPS page)";
          } else if (!src.match(/^(https?:|data:|blob:)/)) {
            errorReason = "Invalid URL format";
          } else if (src.includes("nonexistent") || src.includes("missing")) {
            errorReason = "File not found (404)";
          }
        }

        resolve({ success: false, reason: errorReason });
      },
      { signal: controller.signal }
    );

    // Add additional abort handler
    testImage.addEventListener(
      "abort",
      () => {
        clearTimeout(timeoutId);
        resolve({ success: false, reason: "Image loading aborted" });
      },
      { signal: controller.signal }
    );

    // Set srcset and sizes if provided
    if (srcset) testImage.srcset = srcset;
    if (sizes) testImage.sizes = sizes;

    // Special handling for empty sources
    if (!src && !srcset) {
      resolve({ success: false, reason: "Empty source" });
      return;
    }

    // Set src last to trigger loading
    try {
      testImage.src = src;
    } catch (e) {
      // Catch any exceptions during URL assignment
      resolve({ success: false, reason: `Invalid URL: ${e.message}` });
    }
  });
}

/**
 * Check if an image is broken
 * @param {Element} img - The image element to check
 * @returns {Promise<boolean>} True if the image is broken
 */
async function checkImage(img) {
  const brokenImages = getBrokenImages();

  // Skip if already processed or part of the tool
  if (brokenImages.has(img) || isPartOfTool(img)) {
    return false;
  }

  // Skip invisible images
  if (!isElementVisible(img)) {
    return false;
  }

  // Handle img elements as a special fast path
  if (img.tagName === "IMG") {
    // If image is complete and has valid dimensions, it's not broken
    if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
      return false;
    }

    // If image is complete but has zero dimensions, it's broken
    if (img.complete && (img.naturalWidth === 0 || img.naturalHeight === 0)) {
      markBrokenImage(img, "Failed to load (zero dimensions)");
      return true;
    }
  }

  // Enhanced source detection
  const src = getImageSource(img);
  const hasSrcset = img.srcset && img.srcset.trim().length > 0;

  // Skip SVG data URIs - they're typically fine
  if (src && typeof src === "string" && src.startsWith("data:image/svg+xml")) {
    return false;
  }

  // Case 1: If no src or srcset available, mark as broken
  if (!src && !hasSrcset) {
    markBrokenImage(img, "Missing image source");
    return true;
  }

  // Case 2: For data URIs, check validity
  if (src && typeof src === "string" && src.startsWith("data:")) {
    if (
      src === "data:" ||
      src === "data:," ||
      src === "data:image/," ||
      src === "data:image/png;base64," ||
      src === "data:image/jpeg;base64," ||
      !src.includes(",")
    ) {
      markBrokenImage(img, "Invalid data URI format");
      return true;
    }
  }

  // Case 3: Use Promise.race to timeout image testing after 5 seconds
  try {
    const result = await Promise.race([
      testImageLoading(
        src,
        hasSrcset ? img.srcset : null,
        hasSrcset ? img.sizes : null
      ),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Image test timeout")), 5000)
      ),
    ]);

    if (!result.success) {
      markBrokenImage(img, result.reason);
      return true;
    }
    return false;
  } catch (error) {
    // Handle timeout or other errors
    markBrokenImage(img, `Error: ${error.message || "Unknown error"}`);
    return true;
  }
}

/**
 * Process a batch of images to check if they're broken
 * @param {Element[]} images - Array of image elements to check
 * @param {number} concurrency - Number of parallel checks
 * @returns {Promise<number>} Number of broken images found
 */
async function processImages(images, concurrency = 5) {
  if (images.length === 0) {
    return 0;
  }

  const brokenImages = getBrokenImages();
  const totalImages = images.length;
  let checkedCount = 0;
  let brokenCount = brokenImages.size; // Start with already detected broken images

  // Show initial status
  updateBrokenImagesUI(
    brokenCount,
    `Starting scan of ${totalImages} images...`
  );

  // Process images in smaller batches with proper concurrency control
  // Smaller batches ensure progress is made even if not all images are processed
  const batchSize = Math.min(concurrency, 5); // Keep batches small for better progress updates

  // Create batches of images
  const batches = [];
  for (let i = 0; i < images.length; i += batchSize) {
    batches.push(images.slice(i, i + batchSize));
  }

  // Create a simple progress indicator in the UI
  const progressContainer = document.createElement("div");
  progressContainer.id = "image-scan-progress";
  progressContainer.style.cssText = `
    width: 100%;
    height: 4px;
    background-color: #e2e8f0;
    border-radius: 2px;
    margin-top: 8px;
    overflow: hidden;
  `;

  const progressBar = document.createElement("div");
  progressBar.style.cssText = `
    height: 100%;
    width: 0%;
    background-color: #2563eb;
    transition: width 0.3s ease;
  `;

  progressContainer.appendChild(progressBar);

  // Add to status container if possible
  const statusElement = document.getElementById("alignment-checker-status");
  if (statusElement && statusElement.parentNode) {
    statusElement.parentNode.insertBefore(
      progressContainer,
      statusElement.nextSibling
    );
  }

  try {
    // Process each batch sequentially with a short timeout between batches
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];

      // Process this batch in parallel
      const batchPromises = batch.map((img) =>
        checkImage(img)
          .then((isBroken) => {
            checkedCount++;

            if (isBroken) {
              brokenCount++;
              // Use the updateBrokenImagesCount function from the popup module
              const brokenImages = getBrokenImages();
              updateBrokenImagesUI(brokenImages.size);
            }

            // Update progress bar
            if (progressBar && progressBar.parentNode) {
              const progress = Math.min(
                100,
                Math.round((checkedCount / totalImages) * 100)
              );
              progressBar.style.width = `${progress}%`;
            }

            // Update status regularly
            if (checkedCount % 5 === 0 || checkedCount === totalImages) {
              const statusMessage = document.querySelector(
                ".alignment-checker-broken-status"
              );
              if (statusMessage) {
                statusMessage.textContent = `Scanning: ${checkedCount}/${totalImages} images (${brokenCount} broken)`;
                statusMessage.style.color = "#2563eb";
              }
            }

            return isBroken;
          })
          .catch((err) => {
            console.error(`Error checking image:`, err);
            checkedCount++;
            return false;
          })
      );

      // Use Promise.allSettled to continue even if some promises reject
      await Promise.allSettled(batchPromises);

      // Report progress after each batch
      updateBrokenImagesUI(
        brokenCount,
        `Scanning: ${checkedCount}/${totalImages} images (${brokenCount} broken)`
      );

      // Small delay between batches to keep UI responsive
      if (batchIndex < batches.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
  } finally {
    // Always clean up progress bar when done
    if (progressContainer && progressContainer.parentNode) {
      progressContainer.parentNode.removeChild(progressContainer);
    }
  }

  // Return the count of broken images
  return brokenCount;
}

/**
 * Set up the mutation observer to detect new images
 */
function setupMutationObserver() {
  if (observer) {
    observer.disconnect();
  }

  observer = new MutationObserver((mutations) => {
    // Look for new images in mutations
    let hasNewImages = false;

    mutations.forEach((mutation) => {
      // Check for added nodes
      if (mutation.addedNodes && mutation.addedNodes.length) {
        for (let i = 0; i < mutation.addedNodes.length; i++) {
          const node = mutation.addedNodes[i];

          // If it's an element node
          if (node.nodeType === Node.ELEMENT_NODE) {
            // If it's an image
            if (node.tagName === "IMG") {
              hasNewImages = true;
              break;
            }

            // Or if it might contain images
            if (node.querySelector("img")) {
              hasNewImages = true;
              break;
            }
          }
        }
      }

      // Check for changed attributes on images
      if (
        !hasNewImages &&
        mutation.type === "attributes" &&
        mutation.target.tagName === "IMG"
      ) {
        if (
          mutation.attributeName === "src" ||
          mutation.attributeName === "srcset"
        ) {
          hasNewImages = true;
        }
      }
    });

    // Only re-scan if we found new images
    if (hasNewImages) {
      // Debounce the call to avoid too many scans
      clearTimeout(rescanTimeout);
      rescanTimeout = setTimeout(() => {
        console.log("New images detected, rescanning...");
        detectBrokenImages();
      }, 2000);
    }
  });

  // Start observing with better config
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src", "srcset", "style", "data-src"],
  });
}

/**
 * Main function to detect broken images
 */
export async function detectBrokenImages() {
  // Set up mutation observer if not already done
  setupMutationObserver();

  // Start timing for performance measurements
  const startTime = performance.now();

  // Update UI to show scanning has started
  const checkImagesButton = document.getElementById(
    "alignment-checker-check-images"
  );
  if (checkImagesButton) {
    checkImagesButton.classList.add("scanning");
    checkImagesButton.textContent = "Scanning Images...";
    checkImagesButton.disabled = true; // Prevent multiple clicks
  }

  const statusMessage = document.querySelector(
    ".alignment-checker-broken-status"
  );
  if (statusMessage) {
    statusMessage.textContent = "Preparing to scan images...";
    statusMessage.style.color = "#2563eb";
  }

  // Clear any existing broken image highlights
  clearBrokenImageHighlights();

  // Update status
  updateStatus("Scanning for broken images...", "scanning image-scan");

  try {
    // Enhanced image selector to find more image types:
    // 1. Standard img tags
    // 2. Role="img" elements
    // 3. Elements with background images
    // 4. Common lazy-loading patterns
    // 5. SVG images (though these rarely break)
    // 6. Picture elements and their source children
    // 7. CSS background images
    // 8. Input type="image" elements
    const allImageElements = [
      ...document.querySelectorAll("img"),
      ...document.querySelectorAll('[role="img"]'),
      ...document.querySelectorAll('[style*="background-image"]'),
      ...document.querySelectorAll("[data-src], [data-original], [data-bg]"),
      ...document.querySelectorAll("svg image"),
      ...document.querySelectorAll("picture source"),
      ...document.querySelectorAll('input[type="image"]'),
      ...document.querySelectorAll(
        '.bg-image, .lazy-image, .lazyload, [class*="lazy"], [class*="background"]'
      ),
    ];

    // Filter to remove duplicates and only keep valid elements
    // No viewport visibility check here - we want to check ALL images on the page
    const images = [...new Set(allImageElements)].filter(
      (img) => img && !isPartOfTool(img) && isElementVisible(img)
    );

    // Immediately check for images with empty or invalid src attributes
    // This is important for detecting broken images without waiting for network requests
    images.forEach((img) => {
      // For regular img elements
      if (img.tagName === "IMG") {
        // Empty src attribute
        if (!img.getAttribute("src") || img.getAttribute("src") === "") {
          markBrokenImage(img, "Empty image source");
        }
        // Invalid data URIs
        else if (
          img.src &&
          img.src.startsWith("data:") &&
          (img.src === "data:" ||
            img.src === "data:," ||
            img.src === "data:image/," ||
            img.src === "data:image/png;base64," ||
            img.src === "data:image/jpeg;base64,")
        ) {
          markBrokenImage(img, "Invalid data URI");
        }
        // Already broken images (naturally detected by browser)
        else if (
          img.complete &&
          (img.naturalWidth === 0 || img.naturalHeight === 0)
        ) {
          markBrokenImage(img, "Image failed to load (zero dimensions)");
        }
      }
    });

    // Add native error handler for all images with debouncing for repeated errors
    const handledErrorImages = new Set();

    document.querySelectorAll("img").forEach((img) => {
      if (!img.hasAttribute("data-error-handler-attached")) {
        const originalOnError = img.onerror;

        // Track when we last handled an error for this image to avoid duplicates
        let lastErrorTime = 0;

        img.onerror = function (e) {
          // Call original handler if present
          if (originalOnError) {
            originalOnError.call(this, e);
          }

          // Debounce errors to avoid processing the same broken image multiple times
          const now = Date.now();
          if (now - lastErrorTime > 1000 && !handledErrorImages.has(img)) {
            handledErrorImages.add(img);
            lastErrorTime = now;

            // Mark as broken if not already in the tool
            if (!isPartOfTool(img) && !getBrokenImages().has(img)) {
              // Add the specific error message if available
              let errorReason = "Native error event";
              if (e && e.message) {
                errorReason += `: ${e.message}`;
              }

              markBrokenImage(img, errorReason);
              updateBrokenImagesUI(getBrokenImages().size);
            }
          }
        };

        // Mark as having error handler attached
        img.setAttribute("data-error-handler-attached", "true");
      }
    });

    // Also handle window-level error events for image loading errors
    const errorHandler = function (e) {
      // Check if it's an image error
      if (
        e.target &&
        (e.target.tagName === "IMG" || e.target.tagName === "IMAGE")
      ) {
        const img = e.target;

        // Mark as broken if not already
        if (!isPartOfTool(img) && !getBrokenImages().has(img)) {
          markBrokenImage(
            img,
            `Global error event: ${e.message || "Image failed to load"}`
          );
          updateBrokenImagesUI(getBrokenImages().size);
        }
      }
    };

    // Remove any existing handler first to avoid duplicates
    window.removeEventListener("error", errorHandler, true);
    window.addEventListener("error", errorHandler, true);

    // If no images found, update status and return
    if (images.length === 0) {
      updateBrokenImagesUI(0, "No images found on page");
      resetCheckImagesButton();
      return;
    }

    // Log for debugging
    console.log(`Starting scan of ${images.length} images`);

    // Update status message during initial scan setup
    if (statusMessage) {
      statusMessage.textContent = `Starting scan of ${images.length} images...`;
      statusMessage.style.color = "#2563eb";
    }

    // Filter out already processed images and immediately broken ones
    const brokenImages = getBrokenImages();
    const imagesToProcess = images.filter((img) => !brokenImages.has(img));

    // Process remaining images - using a shorter timeout to ensure completion
    const scanPromise = processImages(imagesToProcess, 5);

    // Set a timeout to make sure we complete even if there's an issue
    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => {
        console.warn("Image scanning timed out - forcing completion");
        resolve("timeout");
      }, 20000); // 20 second max timeout - increased to allow for full page scan
    });

    // Wait for either completion or timeout
    await Promise.race([scanPromise, timeoutPromise]);

    // Get the final count from the global Set
    const finalBrokenCount = getBrokenImages().size;

    // Update UI elements with the final count
    updateBrokenImagesUI(finalBrokenCount);

    // Measure and log performance
    const endTime = performance.now();
    const duration = Math.round(endTime - startTime);
    console.log(
      `Image scan completed in ${duration}ms, found ${finalBrokenCount} broken images`
    );
  } catch (error) {
    console.error("Error during image scanning:", error);

    // Even if there's an error, update UI with any broken images we found
    const brokenCount = getBrokenImages().size;
    updateBrokenImagesUI(
      brokenCount,
      `Scan interrupted, but found ${brokenCount} broken images`
    );

    updateStatus(`Scan error: ${error.message || "Unknown error"}`, "error");

    if (statusMessage) {
      statusMessage.textContent = `Error during scan, but found ${brokenCount} broken images`;
      statusMessage.style.color = brokenCount > 0 ? "#dc2626" : "#64748b";
    }
  } finally {
    // Always reset button state when done
    resetCheckImagesButton();

    // Make sure the UI reflects any broken images found
    const finalCount = getBrokenImages().size;
    if (finalCount > 0) {
      updateStatus(
        `Found ${finalCount} broken ${finalCount === 1 ? "image" : "images"}`,
        "error"
      );
    } else {
      updateStatus("No broken images found", "success");
    }
  }
}
