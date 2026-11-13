/**
 * Popup UI module for the Alignment Checker extension
 */

// State variables for the popup
let popupContainer = null;
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;
let tooltip = null;
let activeTab = "alignment"; // Track the active tab: 'alignment' or 'images' or 'spellchecker'
let isDarkMode = false; // Track the current theme

/**
 * Create and append the popup to the page
 * @returns {HTMLElement} The popup container element
 */
export function createPopup() {
  if (popupContainer) return popupContainer;

  console.log("Creating popup with spell checker tab");

  // Check if dark mode is stored in localStorage
  try {
    const storedTheme = localStorage.getItem("alignment-checker-theme");
    isDarkMode = storedTheme === "dark";
  } catch (e) {
    // If localStorage is not available, default to light mode
    isDarkMode = false;
  }

  // Create the popup container
  popupContainer = document.createElement("div");
  popupContainer.id = "alignment-checker-popup";
  popupContainer.className = "alignment-checker-popup";
  if (isDarkMode) {
    popupContainer.classList.add("dark-mode");
  }

  // Add the popup header with close button
  const header = document.createElement("div");
  header.className = "alignment-checker-popup-header";

  const title = document.createElement("h1");
  title.textContent = "Paltech Checker";

  // Theme toggle button
  const themeToggle = document.createElement("button");
  themeToggle.className = "alignment-checker-theme-toggle";
  themeToggle.innerHTML = isDarkMode ? "🌙" : "☀️";
  themeToggle.title = isDarkMode
    ? "Switch to Light Mode"
    : "Switch to Dark Mode";
  themeToggle.addEventListener("click", toggleTheme);

  const closeButton = document.createElement("button");
  closeButton.className = "alignment-checker-popup-close";
  closeButton.innerHTML = "×";
  closeButton.addEventListener("click", () => {
    hidePopup();
  });

  // Create a container for the buttons
  const headerButtons = document.createElement("div");
  headerButtons.className = "alignment-checker-header-buttons";
  headerButtons.appendChild(themeToggle);
  headerButtons.appendChild(closeButton);

  header.appendChild(title);
  header.appendChild(headerButtons);

  // Make the header draggable
  header.addEventListener("mousedown", (e) => {
    if (e.target === closeButton || e.target === themeToggle) return;

    isDragging = true;
    const rect = popupContainer.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;

    popupContainer.style.cursor = "grabbing";
  });

  // Create the popup content
  const content = document.createElement("div");
  content.className = "alignment-checker-popup-content";

  // Add tabs for navigation
  const tabsContainer = document.createElement("div");
  tabsContainer.className = "alignment-checker-tabs";

  const alignmentTab = document.createElement("div");
  alignmentTab.className = "alignment-checker-tab active";
  alignmentTab.textContent = "Alignment Checker";
  alignmentTab.dataset.tab = "alignment";
  alignmentTab.addEventListener("click", () => switchTab("alignment"));

  const imagesTab = document.createElement("div");
  imagesTab.className = "alignment-checker-tab";
  imagesTab.textContent = "Broken Image Finder";
  imagesTab.dataset.tab = "images";
  imagesTab.addEventListener("click", () => switchTab("images"));

  const spellCheckerTab = document.createElement("div");
  spellCheckerTab.className = "alignment-checker-tab";
  spellCheckerTab.textContent = "Spell Checker";
  spellCheckerTab.dataset.tab = "spellchecker";
  spellCheckerTab.addEventListener("click", () => switchTab("spellchecker"));

  tabsContainer.appendChild(alignmentTab);
  tabsContainer.appendChild(imagesTab);
  tabsContainer.appendChild(spellCheckerTab);

  // Create tab content containers
  const alignmentContent = document.createElement("div");
  alignmentContent.className = "alignment-checker-tab-content";
  alignmentContent.id = "alignment-tab-content";

  const imagesContent = document.createElement("div");
  imagesContent.className = "alignment-checker-tab-content hidden";
  imagesContent.id = "images-tab-content";

  const spellCheckerContent = document.createElement("div");
  spellCheckerContent.className = "alignment-checker-tab-content hidden";
  spellCheckerContent.id = "spellchecker-tab-content";

  // Status display
  const status = document.createElement("div");
  status.id = "alignment-checker-status";
  status.className = "alignment-checker-status";
  status.textContent = "Ready to scan";

  // Alignment Tab Content
  // Issue counts
  const issueCounts = document.createElement("div");
  issueCounts.className = "alignment-checker-issue-counts";

  const severities = ["high", "medium", "low"];
  const severityNames = ["High", "Medium", "Low"];

  severities.forEach((severity, index) => {
    const issueCount = document.createElement("div");
    issueCount.className = `alignment-checker-issue-count alignment-checker-count-${severity}`;

    const severityLabel = document.createElement("div");
    severityLabel.textContent = severityNames[index];

    const countNumber = document.createElement("div");
    countNumber.className = "alignment-checker-count-number";
    countNumber.id = `alignment-checker-${severity}-count`;
    countNumber.textContent = "0";

    issueCount.appendChild(severityLabel);
    issueCount.appendChild(countNumber);
    issueCounts.appendChild(issueCount);
  });

  // Severity options
  const severityOptions = document.createElement("div");
  severityOptions.className = "alignment-checker-severity-options";

  severities.forEach((severity, index) => {
    const label = document.createElement("label");
    label.className = `alignment-checker-severity-radio alignment-checker-severity-${severity}`;

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "alignment-checker-severity";
    radio.value = severity;
    radio.checked = severity === "high";
    radio.addEventListener("change", () => {
      if (radio.checked) {
        // We'll dispatch a custom event so the alignment module can handle this
        document.dispatchEvent(
          new CustomEvent("alignment-checker-severity-change", {
            detail: { severity },
          })
        );
      }
    });

    const text = document.createTextNode(` ${severityNames[index]}`);

    label.appendChild(radio);
    label.appendChild(text);
    severityOptions.appendChild(label);
  });

  // Alignment Buttons
  const alignmentButtons = document.createElement("div");
  alignmentButtons.className = "alignment-checker-buttons";

  const checkButton = document.createElement("button");
  checkButton.id = "alignment-checker-check";
  checkButton.textContent = "Check Alignment";
  checkButton.addEventListener("click", () => {
    const selectedSeverity = document.querySelector(
      'input[name="alignment-checker-severity"]:checked'
    ).value;

    // Dispatch a custom event to trigger alignment check
    document.dispatchEvent(
      new CustomEvent("alignment-checker-check", {
        detail: { severity: selectedSeverity },
      })
    );
  });

  const clearButton = document.createElement("button");
  clearButton.id = "alignment-checker-clear";
  clearButton.textContent = "Clear Highlights";
  clearButton.addEventListener("click", () => {
    // Create a custom event for clearing only alignment highlights
    document.dispatchEvent(
      new CustomEvent("alignment-checker-clear-alignment")
    );
  });

  alignmentButtons.appendChild(checkButton);
  alignmentButtons.appendChild(clearButton);

  // Broken Images Tab Content
  // Broken images count
  const brokenImagesContainer = document.createElement("div");
  brokenImagesContainer.className = "alignment-checker-broken-images";

  const brokenImagesLabel = document.createElement("div");
  brokenImagesLabel.textContent = "Broken Images";
  brokenImagesLabel.className = "alignment-checker-broken-label";

  const brokenImagesCount = document.createElement("div");
  brokenImagesCount.className =
    "alignment-checker-count-number alignment-checker-broken-count";
  brokenImagesCount.id = "alignment-checker-broken-count";
  brokenImagesCount.textContent = "0";
  brokenImagesCount.setAttribute("data-count", "0");

  const brokenImagesStatus = document.createElement("div");
  brokenImagesStatus.className = "alignment-checker-broken-status";
  brokenImagesStatus.textContent = "Run scan to find broken images";
  brokenImagesStatus.style.fontSize = "12px";
  brokenImagesStatus.style.color = "#64748b";
  brokenImagesStatus.style.marginTop = "4px";

  brokenImagesContainer.appendChild(brokenImagesLabel);
  brokenImagesContainer.appendChild(brokenImagesCount);
  brokenImagesContainer.appendChild(brokenImagesStatus);

  // Assemble alignment tab content
  alignmentContent.appendChild(status.cloneNode(true));
  alignmentContent.appendChild(issueCounts);
  alignmentContent.appendChild(severityOptions);
  alignmentContent.appendChild(alignmentButtons);

  // Assemble images tab content
  const imagesStatus = status.cloneNode(true);
  imagesStatus.id = "images-checker-status";
  imagesContent.appendChild(imagesStatus);
  imagesContent.appendChild(brokenImagesContainer);

  // Create vertical buttons instead of horizontal
  // Broken images check button
  const checkImagesButton = document.createElement("button");
  checkImagesButton.id = "alignment-checker-check-images";
  checkImagesButton.textContent = "Check Broken Images";
  checkImagesButton.className = "alignment-checker-check-images";
  checkImagesButton.addEventListener("click", () => {
    checkImagesButton.classList.add("scanning");
    checkImagesButton.textContent = "Scanning Images...";

    const statusMessage = document.querySelector(
      ".alignment-checker-broken-status"
    );
    if (statusMessage) {
      statusMessage.textContent = "Scanning in progress...";
      statusMessage.style.color = "#2563eb";
    }

    // Dispatch a custom event to trigger broken image detection
    document.dispatchEvent(new CustomEvent("alignment-checker-check-images"));
  });

  // Clear highlights button
  const clearImagesButton = document.createElement("button");
  clearImagesButton.id = "alignment-checker-clear-images";
  clearImagesButton.textContent = "Clear Highlights";
  clearImagesButton.addEventListener("click", () => {
    // Create a custom event for clearing only broken image highlights
    document.dispatchEvent(new CustomEvent("alignment-checker-clear-images"));
  });

  // Add buttons directly to content for vertical layout
  imagesContent.appendChild(checkImagesButton);
  imagesContent.appendChild(clearImagesButton);

  // Create spell checker tab content
  createSpellCheckerContent(spellCheckerContent);

  // Footer
  const footer = document.createElement("footer");
  footer.className = "alignment-checker-footer";
  footer.textContent = "Paltech Checker v1.0";

  // Append all elements to the content
  content.appendChild(tabsContainer);
  content.appendChild(alignmentContent);
  content.appendChild(imagesContent);
  content.appendChild(spellCheckerContent);
  content.appendChild(footer);

  // Append header and content to popup
  popupContainer.appendChild(header);
  popupContainer.appendChild(content);

  // Append popup to body
  document.body.appendChild(popupContainer);

  // Position the popup in the top right
  popupContainer.style.top = "20px";
  popupContainer.style.right = "20px";

  return popupContainer;
}

/**
 * Switch between tabs
 * @param {string} tabName - Name of the tab to switch to
 */
function switchTab(tabName) {
  activeTab = tabName;

  // Remove active class from all tabs and hide all content
  document.querySelectorAll(".alignment-checker-tab").forEach((tab) => {
    tab.classList.remove("active");
  });
  document
    .querySelectorAll(".alignment-checker-tab-content")
    .forEach((content) => {
      content.classList.add("hidden");
    });

  // Add active class to selected tab
  document
    .querySelector(`.alignment-checker-tab[data-tab="${tabName}"]`)
    .classList.add("active");

  // Show selected content
  document.getElementById(`${tabName}-tab-content`).classList.remove("hidden");
}

/**
 * Show the popup
 * @param {string} initialTab - Optional tab to show first ('alignment' or 'images' or 'spellchecker')
 */
export function showPopup(initialTab = null) {
  console.log("showPopup called with initialTab:", initialTab);

  try {
    const popup = createPopup();
    console.log("Popup created, setting display to block");
    popup.style.display = "block";

    // Switch to specified tab if provided
    if (initialTab) {
      console.log("Switching to tab:", initialTab);
      switchTab(initialTab);
    }

    // Add global mousemove and mouseup listeners for dragging
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    // Add listener for clicks outside the popup (with a small delay to prevent immediate closing)
    setTimeout(() => {
      document.addEventListener("mousedown", handleOutsideClick);
    }, 100);

    console.log("Popup should now be visible");
  } catch (error) {
    console.error("Error showing popup:", error);
  }
}

/**
 * Hide the popup and clear all highlights and tooltips
 * This ensures that when the extension is closed, all visual elements are removed
 */
export function hidePopup() {
  if (popupContainer) {
    console.log("Hiding popup and clearing all highlights");
    popupContainer.style.display = "none";

    // Remove global listeners
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
    document.removeEventListener("mousedown", handleOutsideClick);

    try {
      // Dispatch a custom event to clear all highlights when popup is hidden
      document.dispatchEvent(new CustomEvent("alignment-checker-clear"));

      // Also explicitly clear spell checker highlights
      document.dispatchEvent(new CustomEvent("spell-checker-clear-highlights"));

      // Fallback method to remove spell check highlights directly
      setTimeout(() => {
        try {
          // Direct DOM manipulation to ensure all spell checker highlights are removed
          const highlightedElements = document.querySelectorAll(
            ".spell-check-misspelled"
          );
          console.log(
            `Popup closing: Found ${highlightedElements.length} spell check highlights to clear`
          );

          if (highlightedElements.length > 0) {
            highlightedElements.forEach((el) => {
              try {
                if (el) {
                  el.classList.remove("spell-check-misspelled");
                  el.removeAttribute("title");
                }
              } catch (e) {
                console.error("Error removing class from element:", e);
              }
            });
          }
        } catch (e) {
          console.error("Error in fallback clear highlights:", e);
        }
      }, 100);
    } catch (clearError) {
      console.error("Error clearing highlights:", clearError);
    }

    // Remove tooltip element entirely
    if (tooltip) {
      tooltip.remove();
      tooltip = null;
    }
  }
}

/**
 * Handle mouse movement for dragging
 * @param {MouseEvent} e - The mouse event
 */
function handleMouseMove(e) {
  if (!isDragging || !popupContainer) return;

  // Calculate new position
  const x = e.clientX - dragOffsetX;
  const y = e.clientY - dragOffsetY;

  // Apply boundaries to keep popup within viewport
  const maxX = window.innerWidth - popupContainer.offsetWidth;
  const maxY = window.innerHeight - popupContainer.offsetHeight;

  popupContainer.style.left = `${Math.max(0, Math.min(maxX, x))}px`;
  popupContainer.style.top = `${Math.max(0, Math.min(maxY, y))}px`;
  popupContainer.style.right = "auto";
}

/**
 * Handle mouse up event to stop dragging
 */
function handleMouseUp() {
  isDragging = false;
  if (popupContainer) {
    popupContainer.style.cursor = "auto";
  }
}

/**
 * Handle clicks outside the popup
 * @param {MouseEvent} e - The mouse event
 */
function handleOutsideClick(e) {
  if (popupContainer && !popupContainer.contains(e.target)) {
    hidePopup();
  }
}

/**
 * Update status message in the popup
 * @param {string} message - Status message to display
 * @param {string} type - Status type (e.g., 'success', 'error', 'warning', 'scanning')
 */
export function updateStatus(message, type = "") {
  // Get the correct status element based on active tab
  let statusElement;
  if (activeTab === "alignment") {
    statusElement = document.getElementById("alignment-checker-status");
  } else if (activeTab === "images") {
    statusElement = document.getElementById("images-checker-status");
  } else if (activeTab === "spellchecker") {
    statusElement = document.getElementById("spell-checker-status");
  }

  if (!statusElement) return;

  // Only update if the message is for the active tab
  // Never show spelling or dictionary messages in non-spellchecker tabs
  if (
    (message.toLowerCase().includes("spell") ||
      message.toLowerCase().includes("dictionary") ||
      message.toLowerCase().includes("spelling")) &&
    activeTab !== "spellchecker"
  ) {
    console.log(
      "Suppressing spell checker message in non-spellchecker tab:",
      message
    );
    return;
  }

  statusElement.textContent = message;

  // Reset all status classes first
  statusElement.className = "alignment-checker-status";

  // Add type class only if provided and ensure no spaces in the class name
  if (type) {
    // Split type by spaces and add each class separately
    const classes = type.split(/\s+/);
    classes.forEach((className) => {
      if (className) {
        statusElement.classList.add(`alignment-checker-status-${className}`);
      }
    });
  }
}

/**
 * Update count displays in the popup
 * @param {Object} counts - Object with counts for each severity level
 */
export function updateCounts(counts) {
  for (const severity in counts) {
    const countElement = document.getElementById(
      `alignment-checker-${severity}-count`
    );
    if (countElement) {
      countElement.textContent = counts[severity];
    }
  }
}

/**
 * Reset count displays to zero
 */
export function resetCounts() {
  document.getElementById("alignment-checker-high-count").textContent = "0";
  document.getElementById("alignment-checker-medium-count").textContent = "0";
  document.getElementById("alignment-checker-low-count").textContent = "0";

  // Also reset broken images count
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
}

/**
 * Update broken images count with animation
 * @param {number} count - Number of broken images found
 */
export function updateBrokenImagesCount(count) {
  const countElement = document.getElementById(
    "alignment-checker-broken-count"
  );
  if (!countElement) return;

  // Store the current count for animation
  const oldCount = parseInt(countElement.getAttribute("data-count") || "0");
  const newCount = count;

  // Update the data attribute
  countElement.setAttribute("data-count", newCount.toString());

  // Update the visible count with a color change if increasing
  if (newCount > oldCount) {
    countElement.textContent = newCount.toString();
    countElement.style.color = "#ef4444";

    // Reset color after a delay
    setTimeout(() => {
      countElement.style.color = newCount > 0 ? "#ef4444" : "";
    }, 1000);
  } else {
    countElement.textContent = newCount.toString();
    countElement.style.color = newCount > 0 ? "#ef4444" : "";
  }
}

/**
 * Creates the tooltip element when needed
 * @returns {HTMLElement} The tooltip element
 */
export function createTooltip() {
  if (tooltip) return tooltip;

  tooltip = document.createElement("div");
  tooltip.className = "alignment-tooltip";
  document.body.appendChild(tooltip);
  return tooltip;
}

/**
 * Reset check images button state
 */
export function resetCheckImagesButton() {
  const checkImagesButton = document.getElementById(
    "alignment-checker-check-images"
  );

  if (checkImagesButton) {
    checkImagesButton.classList.remove("scanning");
    checkImagesButton.textContent = "Check Broken Images";
    checkImagesButton.disabled = false;
  }
}

/**
 * Update broken images UI elements with improved status handling
 * @param {number} count - Number of broken images
 * @param {string|null} customMessage - Optional custom message to display
 */
export function updateBrokenImagesUI(count, customMessage = null) {
  // Automatically switch to the images tab if broken images are found
  if (count > 0) {
    switchTab("images");
  }

  // Update count with visual indicator
  updateBrokenImagesCount(count);

  // Update status message
  const statusMessage = document.querySelector(
    ".alignment-checker-broken-status"
  );

  if (statusMessage) {
    if (customMessage) {
      statusMessage.textContent = customMessage;
      statusMessage.style.color = count > 0 ? "#dc2626" : "#64748b";
    } else if (count === 0) {
      statusMessage.textContent = "All images are loading correctly";
      statusMessage.style.color = "#22c55e";
    } else {
      statusMessage.textContent = `${count} broken ${
        count === 1 ? "image" : "images"
      } found`;
      statusMessage.style.color = "#dc2626";
    }
  }

  // Update main status
  if (count === 0) {
    updateStatus("No broken images found", "success");
  } else {
    updateStatus(
      `Found ${count} broken ${count === 1 ? "image" : "images"}`,
      "error"
    );
  }

  // Always reset the button state
  resetCheckImagesButton();
}

/**
 * Toggle theme between light and dark mode
 */
function toggleTheme() {
  isDarkMode = !isDarkMode;

  // Update theme toggle button appearance
  const themeToggle = document.querySelector(".alignment-checker-theme-toggle");
  if (themeToggle) {
    themeToggle.innerHTML = isDarkMode ? "🌙" : "☀️";
    themeToggle.title = isDarkMode
      ? "Switch to Light Mode"
      : "Switch to Dark Mode";
  }

  // Toggle dark mode class on popup container
  if (popupContainer) {
    if (isDarkMode) {
      popupContainer.classList.add("dark-mode");
    } else {
      popupContainer.classList.remove("dark-mode");
    }
  }

  // Save preference to localStorage
  try {
    localStorage.setItem(
      "alignment-checker-theme",
      isDarkMode ? "dark" : "light"
    );
  } catch (e) {
    // Ignore if localStorage is not available
  }
}

/**
 * Create the spell checker content elements
 * @param {HTMLElement} container - The container to add the content to
 */
function createSpellCheckerContent(container) {
  // Status and counts area
  const status = document.createElement("div");
  status.id = "spell-checker-status";
  status.className = "alignment-checker-status";
  status.textContent = "Ready to check spelling";

  // Status bar with counts
  const statusBar = document.createElement("div");
  statusBar.className = "spell-checker-status-bar";

  const statusIndicator = document.createElement("div");
  statusIndicator.className = "spell-checker-status-indicator";

  const dot = document.createElement("span");
  dot.className = "spell-checker-dot spell-checker-red-dot";

  const statusText = document.createElement("span");
  statusText.id = "spell-checker-status-text";
  statusText.innerHTML = `Found <span id="spell-checker-misspelled-count">0</span> misspelled words`;

  statusIndicator.appendChild(dot);
  statusIndicator.appendChild(statusText);

  statusBar.appendChild(statusIndicator);

  // Word list header
  const wordListHeader = document.createElement("div");
  wordListHeader.className = "spell-checker-word-list-header";

  const wordColumn = document.createElement("div");
  wordColumn.className = "spell-checker-word-column";
  wordColumn.textContent = "Misspelled Words";

  const countColumn = document.createElement("div");
  countColumn.className = "spell-checker-count-column";
  countColumn.textContent = "Count";

  const actionsColumn = document.createElement("div");
  actionsColumn.className = "spell-checker-actions-column";
  actionsColumn.textContent = "Actions";

  wordListHeader.appendChild(wordColumn);
  wordListHeader.appendChild(countColumn);
  wordListHeader.appendChild(actionsColumn);

  // Word list container
  const wordListContainer = document.createElement("div");
  wordListContainer.className = "spell-checker-word-list-container";

  const wordList = document.createElement("div");
  wordList.id = "spell-checker-word-list";
  wordList.className = "spell-checker-word-list";

  // Add a placeholder message
  const noWordsItem = document.createElement("div");
  noWordsItem.className = "spell-checker-word-item";
  noWordsItem.textContent = "Click 'Check Spelling' to scan the page.";
  wordList.appendChild(noWordsItem);

  wordListContainer.appendChild(wordList);

  // Create action buttons container similar to the screenshot
  // First button (Check Spelling)
  const checkSpellingButton = document.createElement("button");
  checkSpellingButton.id = "spell-checker-check";
  checkSpellingButton.textContent = "Check Spelling";
  checkSpellingButton.addEventListener("click", () => {
    // Dispatch event to trigger spell checking
    document.dispatchEvent(new CustomEvent("spell-checker-check"));
  });

  // Second button (Clear Highlights)
  const clearHighlightsButton = document.createElement("button");
  clearHighlightsButton.id = "spell-checker-clear";
  clearHighlightsButton.textContent = "Clear Highlights";
  clearHighlightsButton.addEventListener("click", () => {
    try {
      console.log("Clear Highlights button clicked");

      // Dispatch event to clear spell checker highlights
      document.dispatchEvent(new CustomEvent("spell-checker-clear-highlights"));

      // Update status
      const status = document.getElementById("spell-checker-status");
      if (status) {
        status.textContent = "Highlights cleared";
        status.className =
          "alignment-checker-status alignment-checker-status-success";
      }

      // Reset word list
      updateSpellCheckerWordList({});

      // Also update count to 0
      updateSpellCheckerCount(0);

      console.log("Spell checker highlights should now be cleared");
    } catch (error) {
      console.error("Error clearing highlights:", error);
    }
  });

  // Add everything to the container
  container.appendChild(status);
  container.appendChild(statusBar);
  container.appendChild(wordListHeader);
  container.appendChild(wordListContainer);

  // Add buttons
  container.appendChild(checkSpellingButton);
  container.appendChild(clearHighlightsButton);
}

/**
 * Update the spell checker misspelled word count
 * @param {number} count - The number of misspelled words
 */
export function updateSpellCheckerCount(count) {
  const countElement = document.getElementById(
    "spell-checker-misspelled-count"
  );
  if (countElement) {
    countElement.textContent = count;
  }

  const status = document.getElementById("spell-checker-status");
  if (status) {
    if (count > 0) {
      status.textContent = `Found ${count} misspelled words on the page`;
      status.className =
        "alignment-checker-status alignment-checker-status-warning";
    } else {
      status.textContent = "No misspelled words found on the page";
      status.className =
        "alignment-checker-status alignment-checker-status-success";
    }
  }
}

/**
 * Update the spell checker word list with misspelled words
 * @param {Object} wordsObj - Object containing misspelled words and their counts
 */
export function updateSpellCheckerWordList(wordsObj) {
  const wordListEl = document.getElementById("spell-checker-word-list");
  if (!wordListEl) return;

  wordListEl.innerHTML = "";

  // If no words, show a message
  if (!wordsObj || Object.keys(wordsObj).length === 0) {
    const noWordsItem = document.createElement("div");
    noWordsItem.className = "spell-checker-word-item";
    noWordsItem.textContent = "No misspelled words found on this page!";
    wordListEl.appendChild(noWordsItem);
    return;
  }

  // Convert object to array for sorting
  const words = Object.entries(wordsObj).map(([word, count]) => ({
    word,
    count,
  }));

  // Sort by count (highest first)
  words.sort((a, b) => b.count - a.count);

  // Create word items
  words.forEach((item) => {
    const wordItem = document.createElement("div");
    wordItem.className = "spell-checker-word-item";

    // Word text
    const wordText = document.createElement("div");
    wordText.className = "spell-checker-word-text";
    wordText.textContent = item.word;
    wordItem.appendChild(wordText);

    // Word count
    const countWrapper = document.createElement("div");
    countWrapper.className = "spell-checker-count-wrapper";

    const wordCount = document.createElement("span");
    wordCount.className = "spell-checker-word-count";
    wordCount.textContent = item.count;
    countWrapper.appendChild(wordCount);
    wordItem.appendChild(countWrapper);

    // Word actions
    const wordActions = document.createElement("div");
    wordActions.className = "spell-checker-word-actions";

    const ignoreBtn = document.createElement("button");
    ignoreBtn.className = "spell-checker-ignore-btn";
    ignoreBtn.textContent = "Ignore";
    ignoreBtn.addEventListener("click", () => {
      // Dispatch event to ignore this word
      document.dispatchEvent(
        new CustomEvent("spell-checker-ignore-word", {
          detail: { word: item.word },
        })
      );

      // Remove from UI
      wordItem.remove();

      // If all words are now removed, show a message
      if (wordListEl.children.length === 0) {
        const noWordsItem = document.createElement("div");
        noWordsItem.className = "spell-checker-word-item";
        noWordsItem.textContent = "No misspelled words remaining.";
        wordListEl.appendChild(noWordsItem);
      }
    });

    wordActions.appendChild(ignoreBtn);
    wordItem.appendChild(wordActions);

    wordListEl.appendChild(wordItem);
  });
}

/**
 * Update the spell checker dictionary word count (now just a no-op)
 * @param {number} count - The number of words in the dictionary
 */
export function updateDictionaryCount(count) {
  // Dictionary count display has been removed from UI
  // But we keep this function as a no-op for compatibility
  console.log("Dictionary loaded with", count.toLocaleString(), "words");
}
