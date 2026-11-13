/**
 * Spell checker module for the Paltech UI Checker extension
 * Enhanced version with improved performance and reduced UI impact
 */
import {
  updateSpellCheckerCount,
  updateDictionaryCount,
  updateSpellCheckerWordList,
  updateStatus,
} from "./popup.js";

// Initialize dictionary and related variables
let dictionary = new Set();
let ignoredWords = new Set();
let technicalTerms = new Set([
  "html",
  "css",
  "javascript",
  "localhost",
  "github",
  "windows",
  "macos",
  "linux",
  "iphone",
  "android",
  "http",
  "https",
  "www",
  "com",
  "io",
  "css",
  "js",
  "json",
  "google",
  "api",
  "ui",
  "url",
  "urls",
  "jquery",
  "paltech",
  "webpack",
  "npm",
  "nodejs",
]);
let misspelledWords = {}; // word -> count
let isInitialized = false;
let isLoading = false;
let processingInProgress = false; // Flag to prevent concurrent processing

// Configuration options with sensible defaults
const config = {
  maxElementsToProcess: 5000, // Limit number of elements to process
  batchSize: 50, // Process DOM in batches to avoid UI freezing
  batchDelay: 0, // Milliseconds between batches (0 for tight loops)
  highlightThrottleDelay: 10, // Milliseconds between applying highlights
  skipClasses: ["no-spell-check", "code", "editor"], // Skip elements with these classes
  containerSelector: "body", // Default container to scan
};

// Basic English dictionary for simplicity and reliability
const basicDictionary = [
  "the",
  "be",
  "to",
  "of",
  "and",
  "a",
  "in",
  "that",
  "have",
  "it",
  "for",
  "not",
  "on",
  "with",
  "he",
  "as",
  "you",
  "do",
  "at",
  "this",
  "but",
  "his",
  "by",
  "from",
  "they",
  "we",
  "say",
  "her",
  "she",
  "or",
  "an",
  "will",
  "my",
  "one",
  "all",
  "would",
  "there",
  "their",
  "what",
  "so",
  "up",
  "out",
  "if",
  "about",
  "who",
  "get",
  "which",
  "go",
  "me",
  "when",
  "make",
  "can",
  "like",
  "time",
  "no",
  "just",
  "him",
  "know",
  "take",
  "people",
  "into",
  "year",
  "your",
  "good",
  "some",
  "could",
  "them",
  "see",
  "other",
  "than",
  "then",
  "now",
  "look",
  "only",
  "come",
  "its",
  "over",
  "think",
  "also",
  "back",
  "after",
  "use",
  "two",
  "how",
  "our",
  "work",
  "first",
  "well",
  "way",
  "even",
  "new",
  "want",
  "because",
  "any",
  "these",
  "give",
  "day",
  "most",
  "us",
  "is",
  "am",
  "are",
  "was",
  "were",
  "been",
  "has",
  "had",
  "did",
  "done",
  "should",
  "could",
  "would",
  "may",
  "might",
  "must",
  "shall",
  "can",
  "should",
  "check",
  "spell",
  "spelling",
  "checker",
  "dictionary",
  "word",
  "words",
  "text",
  "article",
  "language",
  "english",
  "misspelled",
  "correct",
  "incorrect",
  "error",
  "errors",
  "typo",
  "typos",
  "highlight",
  "find",
  "scan",
  "page",
];

/**
 * Helper function to safely update status only when in spell checker tab
 * @param {string} message - Status message to display
 * @param {string} type - Status type
 */
function safeUpdateStatus(message, type = "") {
  try {
    // Only update status if the spell checker tab is active
    const activeTab = document.querySelector(".alignment-checker-tab.active")
      ?.dataset.tab;
    if (activeTab === "spellchecker") {
      updateStatus(message, type);
    } else {
      console.log(
        `Skipping status update "${message}" (not in spell checker tab)`
      );
    }
  } catch (err) {
    console.log("Status update error:", err);
  }
}

/**
 * Initialize the spell checker module
 */
export async function initialize() {
  console.log("Initializing spell checker module");
  if (isInitialized) {
    console.log("Spell checker already initialized");
    return;
  }

  // Set initialization in progress flag to prevent multiple simultaneous initializations
  isLoading = true;

  try {
    // Load configuration from storage if available
    await loadConfig();

    // Set up event listeners with proper error handling
    setupEventListeners();

    // Load ignored words first as this is faster
    await loadIgnoredWords();

    // Load dictionary (may take some time)
    try {
      const dictSize = await loadDictionary();
      console.log("Dictionary loaded with", dictSize, "words");
    } catch (dictError) {
      console.error(
        "Dictionary load failed, but continuing with basic dictionary:",
        dictError
      );
    }

    console.log(
      "Spell checker initialized with dictionary size:",
      dictionary.size
    );
    isInitialized = true;
  } catch (error) {
    console.error("Error initializing spell checker:", error);
    safeUpdateStatus("Error initializing spell checker", "error");
  } finally {
    isLoading = false;
  }
}

/**
 * Load configuration from storage
 */
async function loadConfig() {
  try {
    if (
      typeof chrome !== "undefined" &&
      chrome.storage &&
      chrome.storage.sync
    ) {
      return new Promise((resolve) => {
        chrome.storage.sync.get(["spellCheckerConfig"], (result) => {
          if (result && result.spellCheckerConfig) {
            // Merge stored config with defaults
            Object.assign(config, result.spellCheckerConfig);
            console.log("Loaded configuration:", config);
          }
          resolve();
        });
      });
    }
  } catch (error) {
    console.error("Error loading configuration:", error);
  }
}

/**
 * Set up event listeners with proper error handling
 */
function setupEventListeners() {
  try {
    // Remove existing listeners to prevent duplicates
    document.removeEventListener("spell-checker-check", handleCheckSpelling);
    document.removeEventListener("spell-checker-ignore-word", handleIgnoreWord);
    document.removeEventListener(
      "spell-checker-clear-highlights",
      clearHighlights
    );
    document.removeEventListener("spell-checker-config", updateConfig);

    // Add listeners
    document.addEventListener("spell-checker-check", handleCheckSpelling);
    document.addEventListener("spell-checker-ignore-word", handleIgnoreWord);
    document.addEventListener(
      "spell-checker-clear-highlights",
      clearHighlights
    );
    document.addEventListener("spell-checker-config", updateConfig);

    console.log("Spell checker event listeners set up");
  } catch (eventError) {
    console.error("Error setting up event listeners:", eventError);
  }
}

/**
 * Update configuration based on event
 * @param {CustomEvent} event - Event with configuration details
 */
function updateConfig(event) {
  if (event.detail && typeof event.detail === "object") {
    Object.assign(config, event.detail);

    // Save to storage if available
    try {
      if (
        typeof chrome !== "undefined" &&
        chrome.storage &&
        chrome.storage.sync
      ) {
        chrome.storage.sync.set({ spellCheckerConfig: config });
      }
    } catch (error) {
      console.error("Error saving configuration:", error);
    }

    console.log("Configuration updated:", config);
  }
}

/**
 * Load dictionary from a remote source with better error handling and fallbacks
 */
async function loadDictionary() {
  try {
    safeUpdateStatus("Loading dictionary...", "scanning");

    // Add some basic words to the dictionary to start with
    basicDictionary.forEach((word) => dictionary.add(word.toLowerCase()));

    // Try loading the main dictionary
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      const response = await fetch(
        "https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt",
        { signal: controller.signal }
      );

      clearTimeout(timeoutId);

      if (!response.ok) throw new Error("Failed to load dictionary");

      const text = await response.text();
      const words = text.split(/\r?\n/);

      // Add words to dictionary
      words.forEach((word) => {
        if (word && word.trim()) dictionary.add(word.trim().toLowerCase());
      });

      // Update dictionary count in storage
      updateDictionaryCount(dictionary.size);
      saveDictionaryCount();

      safeUpdateStatus("Ready to check spelling", "success");
      return dictionary.size;
    } catch (fetchError) {
      console.error("Dictionary load error:", fetchError);
      // Continue to fallback dictionary
      throw fetchError;
    }
  } catch (error) {
    console.error("Primary dictionary load error:", error);

    // Dictionary already has basic words, try the fallback dictionary
    try {
      safeUpdateStatus("Trying alternative dictionary...", "scanning");

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      const fallbackResponse = await fetch(
        "https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english.txt",
        { signal: controller.signal }
      );

      clearTimeout(timeoutId);

      if (!fallbackResponse.ok)
        throw new Error("Failed to load fallback dictionary");

      const text = await fallbackResponse.text();
      const words = text.split(/\r?\n/);

      // Add words to dictionary
      words.forEach((word) => {
        if (word && word.trim()) dictionary.add(word.trim().toLowerCase());
      });

      // Update dictionary count in storage
      updateDictionaryCount(dictionary.size);
      saveDictionaryCount();

      safeUpdateStatus("Ready to check spelling", "success");
      return dictionary.size;
    } catch (fallbackError) {
      console.error("Fallback dictionary load error:", fallbackError);

      // We'll just use the basic dictionary already loaded
      console.log("Using minimal dictionary with", dictionary.size, "words");
      safeUpdateStatus("Ready to check spelling", "success");

      // Update dictionary count in storage
      updateDictionaryCount(dictionary.size);

      return dictionary.size;
    }
  }
}

/**
 * Save dictionary count to storage
 */
function saveDictionaryCount() {
  try {
    if (
      typeof chrome !== "undefined" &&
      chrome.storage &&
      chrome.storage.sync
    ) {
      chrome.storage.sync.set({ dictionaryCount: dictionary.size });
    }
  } catch (storageError) {
    console.error("Could not save dictionary count to storage:", storageError);
  }
}

/**
 * Load ignored words from Chrome storage with better error handling
 */
async function loadIgnoredWords() {
  console.log("Loading ignored words from storage");

  try {
    // Initialize with some common words to ignore by default
    ignoredWords = new Set([
      "paltech",
      "ui",
      "checker",
      "ui-checker",
      "website",
      "webpage",
      "frontend",
    ]);

    // Try to load from storage if available
    if (
      typeof chrome !== "undefined" &&
      chrome.storage &&
      chrome.storage.sync
    ) {
      return new Promise((resolve) => {
        chrome.storage.sync.get(["ignoredWords"], (result) => {
          try {
            if (
              result &&
              result.ignoredWords &&
              Array.isArray(result.ignoredWords)
            ) {
              // Add to the existing set
              result.ignoredWords.forEach((word) => {
                if (word && typeof word === "string") {
                  ignoredWords.add(word.toLowerCase());
                }
              });
              console.log(
                "Loaded",
                ignoredWords.size,
                "ignored words from storage"
              );
            }
          } catch (parseError) {
            console.error("Error parsing ignored words:", parseError);
          }
          resolve();
        });
      });
    }
  } catch (error) {
    console.error("Error loading ignored words:", error);
  }
}

/**
 * Handle the check spelling event with debouncing to prevent multiple simultaneous checks
 */
function handleCheckSpelling() {
  if (processingInProgress) {
    console.log("Spell checking already in progress, skipping");
    return;
  }

  console.log("Check spelling triggered");
  safeUpdateStatus("Checking spelling...", "scanning");

  processingInProgress = true;

  // Run the spell check with a small delay to let UI update
  setTimeout(() => {
    checkSpelling()
      .then((results) => {
        // Update UI with results
        const misspelledCount = Object.keys(results).length;
        updateSpellCheckerCount(misspelledCount);
        updateSpellCheckerWordList(results);

        if (misspelledCount > 0) {
          safeUpdateStatus(
            `Found ${misspelledCount} possible spelling issues`,
            "warning"
          );
        } else {
          safeUpdateStatus("No spelling issues found", "success");
        }
      })
      .catch((error) => {
        console.error("Error in spell checking:", error);
        safeUpdateStatus("Error checking spelling", "error");
      })
      .finally(() => {
        processingInProgress = false;
      });
  }, 10);
}

/**
 * Handle the ignore word event
 * @param {CustomEvent} event - The event with word detail
 */
function handleIgnoreWord(event) {
  if (event.detail && event.detail.word) {
    ignoreWord(event.detail.word);
  }
}

/**
 * Check if a word is spelled correctly with improved handling of special cases
 * @param {string} word - The word to check
 * @returns {boolean} - Whether the word is spelled correctly
 */
function isSpelledCorrectly(word) {
  if (!word || word.length <= 1) return true;

  // Improved handling of special cases

  // Ignore numbers, email addresses, URLs, file paths
  if (
    /\d/.test(word) ||
    /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(word) ||
    /^(https?:\/\/|www\.)/.test(word) ||
    /^(\/|\.\/|\.\.\/|~\/|[a-zA-Z]:\\)/.test(word)
  ) {
    return true;
  }

  // Ignore words with all caps (likely acronyms) or camelCase (likely variables)
  if (
    (word === word.toUpperCase() && word.length > 1) ||
    (/^[a-z]+[A-Z]/.test(word) && word.length > 3)
  ) {
    return true;
  }

  // Convert to lowercase for checking
  const lowerWord = word.toLowerCase();

  // Check against ignored words
  if (ignoredWords.has(lowerWord)) return true;

  // Check against technical terms
  if (technicalTerms.has(lowerWord)) return true;

  // Check against main dictionary
  if (dictionary.has(lowerWord)) return true;

  // Check common word variations

  // Check possessive forms
  if (lowerWord.endsWith("'s") && dictionary.has(lowerWord.slice(0, -2)))
    return true;

  // Check plural forms more accurately
  if (lowerWord.endsWith("s") && dictionary.has(lowerWord.slice(0, -1)))
    return true;
  if (lowerWord.endsWith("es") && dictionary.has(lowerWord.slice(0, -2)))
    return true;
  if (lowerWord.endsWith("ies") && dictionary.has(lowerWord.slice(0, -3) + "y"))
    return true;

  // Check common prefixes
  const prefixes = [
    "re",
    "un",
    "in",
    "im",
    "dis",
    "non",
    "pre",
    "post",
    "anti",
    "sub",
    "super",
  ];
  for (const prefix of prefixes) {
    if (
      lowerWord.startsWith(prefix) &&
      dictionary.has(lowerWord.slice(prefix.length))
    ) {
      return true;
    }
  }

  // Check common suffixes
  const suffixes = [
    "ing",
    "ed",
    "ly",
    "er",
    "est",
    "ness",
    "able",
    "ible",
    "ment",
    "ful",
    "less",
  ];
  for (const suffix of suffixes) {
    if (lowerWord.endsWith(suffix)) {
      const stem = lowerWord.slice(0, -suffix.length);
      // Check if stem is valid word
      if (dictionary.has(stem)) return true;

      // Handle doubling of final consonant (e.g., running -> run)
      if (suffix === "ing" || suffix === "ed") {
        const lastChar = stem.slice(-1);
        const penultimateChar = stem.slice(-2, -1);
        if (
          /[bcdfghjklmnpqrstvwxyz]/.test(lastChar) &&
          /[aeiou]/.test(penultimateChar)
        ) {
          if (dictionary.has(stem.slice(0, -1))) return true;
        }
      }

      // Handle 'e' drop before 'ing' (e.g., having -> have)
      if (suffix === "ing") {
        if (dictionary.has(stem + "e")) return true;
      }
    }
  }

  return false;
}

/**
 * Find and highlight spelling mistakes with improved performance
 * @returns {Promise<Object>} - Promise resolving to object containing misspelled words and their counts
 */
async function checkSpelling() {
  console.log("Scanning page for misspelled errors");

  // Clear previous results
  misspelledWords = {};

  try {
    // Clear any existing highlights first
    await clearHighlightsWithoutReset();

    // Get container to scan
    let container;
    try {
      container = document.querySelector(config.containerSelector);
    } catch (selectorError) {
      console.error("Error with container selector:", selectorError);
      container = document.body;
    }

    if (!container) {
      console.error("Container not found, using document body");
      container = document.body;
    }

    // Use a more efficient approach to traverse the DOM with batching
    await scanDOMForSpellingErrorsWithBatching(container);

    // Save the current misspelled words to storage if Chrome API is available
    try {
      if (typeof chrome !== "undefined" && chrome.storage) {
        chrome.storage.sync.set({ misspelledWords: misspelledWords });
      }
    } catch (error) {
      console.error("Could not save misspelled words to storage:", error);
    }

    console.log(
      "Found",
      Object.keys(misspelledWords).length,
      "unique misspelled words"
    );
    return misspelledWords;
  } catch (err) {
    console.error("Error in checkSpelling:", err);
    return {};
  }
}

/**
 * Clear highlights without resetting the misspelled words
 */
async function clearHighlightsWithoutReset() {
  return new Promise((resolve) => {
    try {
      // Clear existing highlights
      document.querySelectorAll(".spell-check-misspelled").forEach((el) => {
        // Instead of replacing the node, just remove the class to preserve positioning
        el.classList.remove("spell-check-misspelled");
        el.removeAttribute("title");
      });

      // Short timeout to allow DOM to update
      setTimeout(resolve, 10);
    } catch (error) {
      console.error("Error clearing highlights:", error);
      resolve();
    }
  });
}

/**
 * Scan DOM for spelling errors using a more efficient batched approach
 * @param {HTMLElement} rootElement - The root element to scan
 * @returns {Promise<void>} - Promise that resolves when scanning is complete
 */
function scanDOMForSpellingErrorsWithBatching(rootElement) {
  return new Promise((resolve) => {
    if (!rootElement) {
      resolve();
      return;
    }

    // Skip certain elements entirely
    const tagsToSkip = new Set([
      "SCRIPT",
      "STYLE",
      "CODE",
      "PRE",
      "BUTTON",
      "INPUT",
      "TEXTAREA",
      "SVG",
      "CANVAS",
      "IFRAME",
      "NOSCRIPT",
      "SELECT",
      "OPTION",
      "META",
      "LINK",
      "HEAD",
      "TITLE",
      "AUDIO",
      "VIDEO",
      "PATH",
      "RECT",
      "CIRCLE",
    ]);

    // Word regex that handles apostrophes and hyphens
    const wordRegex = /([a-zA-ZÀ-ÖØ-öø-ÿ]+(?:[''\-][a-zA-ZÀ-ÖØ-öø-ÿ]+)*)/g;

    // Array to store text nodes to process
    const textNodesToProcess = [];

    // Function to collect text nodes
    function collectTextNodes(element) {
      if (!element) return;

      // Skip certain elements
      if (element.nodeType === Node.ELEMENT_NODE) {
        const tagName = element.tagName.toUpperCase();
        if (tagsToSkip.has(tagName)) return;

        // Skip elements with configured classes
        if (element.classList) {
          for (const cls of config.skipClasses) {
            if (element.classList.contains(cls)) return;
          }
        }

        // Skip invisible elements
        try {
          const style = window.getComputedStyle(element);
          if (
            style.display === "none" ||
            style.visibility === "hidden" ||
            style.opacity === "0" ||
            parseInt(style.opacity, 10) === 0
          ) {
            return;
          }
        } catch (e) {
          // Skip style check errors
        }

        // Skip elements with spellcheck="false" attribute
        if (element.getAttribute("spellcheck") === "false") return;
      }

      // Add text nodes to the processing list
      if (element.nodeType === Node.TEXT_NODE) {
        if (element.nodeValue && element.nodeValue.trim() !== "") {
          // Check if node is in a highlighted element already
          let ancestor = element.parentNode;
          while (ancestor) {
            if (
              ancestor.classList &&
              ancestor.classList.contains("spell-check-misspelled")
            ) {
              return;
            }
            ancestor = ancestor.parentNode;
          }

          textNodesToProcess.push(element);
        }
        return;
      }

      // Recursively process child nodes
      if (element.childNodes && element.childNodes.length > 0) {
        // Use a copied list of child nodes to avoid live collection issues
        const childNodes = Array.from(element.childNodes);
        childNodes.forEach((child) => {
          collectTextNodes(child);
        });
      }
    }

    // Process text node and check for spelling errors
    function processTextNode(node) {
      if (!node || !node.nodeValue || node.nodeValue.trim() === "") return null;

      // Process the text node for spelling errors
      const text = node.nodeValue;
      let lastIndex = 0;
      const fragment = document.createDocumentFragment();
      let match;
      let modified = false;

      // Reset regex
      wordRegex.lastIndex = 0;

      // Find all words in the text
      try {
        while ((match = wordRegex.exec(text)) !== null) {
          const word = match[0];
          const startPos = match.index;
          const endPos = startPos + word.length;

          // Add text before the word
          if (startPos > lastIndex) {
            fragment.appendChild(
              document.createTextNode(text.substring(lastIndex, startPos))
            );
          }

          // Check if the word is spelled correctly
          if (!isSpelledCorrectly(word)) {
            try {
              // Create a span for misspelled word
              const misspelledSpan = document.createElement("span");
              misspelledSpan.className = "spell-check-misspelled";
              misspelledSpan.title = `Possible misspelling: ${word}`;
              misspelledSpan.textContent = word;

              // Don't add custom styling inline - use CSS classes instead
              // This reduces UI impact

              fragment.appendChild(misspelledSpan);

              // Update word count
              const lowerWord = word.toLowerCase();
              misspelledWords[lowerWord] =
                (misspelledWords[lowerWord] || 0) + 1;

              modified = true;
            } catch (spanError) {
              console.error("Error creating highlight span:", spanError);
              // Fallback to normal text
              fragment.appendChild(document.createTextNode(word));
            }
          } else {
            // Add correctly spelled word
            fragment.appendChild(document.createTextNode(word));
          }

          lastIndex = endPos;
        }

        // Add any remaining text
        if (lastIndex < text.length) {
          fragment.appendChild(
            document.createTextNode(text.substring(lastIndex))
          );
        }

        // Only return the fragment if we found misspellings
        if (modified && node.parentNode) {
          return {
            node: node,
            fragment: fragment,
            parent: node.parentNode,
          };
        }
      } catch (processError) {
        console.error("Error processing text:", processError);
      }

      return null;
    }

    // Start collecting nodes
    collectTextNodes(rootElement);

    // Limit number of nodes to process
    if (textNodesToProcess.length > config.maxElementsToProcess) {
      console.log(
        `Limiting text nodes to process from ${textNodesToProcess.length} to ${config.maxElementsToProcess}`
      );
      textNodesToProcess.length = config.maxElementsToProcess;
    }

    console.log(`Processing ${textNodesToProcess.length} text nodes`);

    // Process nodes in batches
    const totalNodes = textNodesToProcess.length;
    let processedCount = 0;
    let replacements = [];

    function processBatch(startIndex) {
      const endIndex = Math.min(startIndex + config.batchSize, totalNodes);

      // Process a batch of nodes
      for (let i = startIndex; i < endIndex; i++) {
        const result = processTextNode(textNodesToProcess[i]);
        if (result) {
          replacements.push(result);
        }
        processedCount++;
      }

      // Apply replacements if we've accumulated enough or finished processing
      if (replacements.length >= 20 || endIndex >= totalNodes) {
        applyReplacements(replacements);
        replacements = [];
      }

      // Update progress if in spell checker tab
      if (processedCount % 100 === 0) {
        const percent = Math.round((processedCount / totalNodes) * 100);
        safeUpdateStatus(`Checking spelling... ${percent}%`, "scanning");
      }

      // Schedule next batch
      if (endIndex < totalNodes) {
        if (config.batchDelay > 0) {
          setTimeout(() => processBatch(endIndex), config.batchDelay);
        } else {
          processBatch(endIndex);
        }
      } else {
        // All done
        resolve();
      }
    }

    // Start processing
    processBatch(0);
  });
}

/**
 * Apply DOM replacements in a safe way
 * @param {Array} replacements - Array of replacement objects
 */
function applyReplacements(replacements) {
  if (!replacements || replacements.length === 0) return;

  console.log(`Applying ${replacements.length} text replacements`);

  // Apply replacements in a safe way
  replacements.forEach(({ node, fragment, parent }) => {
    try {
      if (parent && node.parentNode === parent) {
        parent.replaceChild(fragment, node);
      }
    } catch (err) {
      console.error("Error replacing node:", err);
    }
  });
}

/**
 * Ignore a specific word with improved error handling
 * @param {string} word - The word to ignore
 */
function ignoreWord(word) {
  if (!word) return;

  try {
    console.log("Ignoring word:", word);
    const lowerWord = word.toLowerCase();
    ignoredWords.add(lowerWord);

    // Save to storage if Chrome API is available
    saveIgnoredWord(lowerWord);

    // Remove highlighting for this word but preserve positioning
    removeHighlightsForWord(lowerWord);

    // Also remove the word from current misspelled words
    if (misspelledWords[lowerWord]) {
      delete misspelledWords[lowerWord];

      // Save updated misspelled words to storage
      saveUpdatedMisspelledWords();

      // Update UI
      updateUI();
    }
  } catch (globalError) {
    console.error("Error ignoring word:", globalError);
  }
}

/**
 * Save ignored word to storage
 * @param {string} word - Word to save
 */
function saveIgnoredWord(word) {
  try {
    if (
      typeof chrome !== "undefined" &&
      chrome.storage &&
      chrome.storage.sync
    ) {
      chrome.storage.sync.get(["ignoredWords"], (result) => {
        try {
          const words = Array.isArray(result.ignoredWords)
            ? result.ignoredWords
            : [];
          if (!words.includes(word)) {
            words.push(word);
            chrome.storage.sync.set({ ignoredWords: words });
          }
        } catch (err) {
          console.error("Error processing ignored words:", err);
        }
      });
    }
  } catch (error) {
    console.error("Could not save ignored word to storage:", error);
  }
}

/**
 * Remove highlights for a specific word
 * @param {string} word - Word to remove highlights for
 */
function removeHighlightsForWord(word) {
  try {
    document.querySelectorAll(".spell-check-misspelled").forEach((el) => {
      try {
        if (el && el.textContent && el.textContent.toLowerCase() === word) {
          el.classList.remove("spell-check-misspelled");
          el.removeAttribute("title");
        }
      } catch (elementError) {
        console.error("Error removing highlight from element:", elementError);
      }
    });
  } catch (queryError) {
    console.error("Error selecting elements to unhighlight:", queryError);
  }
}

/**
 * Save updated misspelled words to storage
 */
function saveUpdatedMisspelledWords() {
  try {
    if (
      typeof chrome !== "undefined" &&
      chrome.storage &&
      chrome.storage.sync
    ) {
      chrome.storage.sync.set({ misspelledWords: misspelledWords });
    }
  } catch (error) {
    console.error("Could not save updated misspelled words to storage:", error);
  }
}

/**
 * Update UI with current state
 */
function updateUI() {
  const misspelledCount = Object.keys(misspelledWords).length;
  updateSpellCheckerCount(misspelledCount);
  updateSpellCheckerWordList(misspelledWords);

  if (misspelledCount === 0) {
    safeUpdateStatus("No spelling issues remaining", "success");
  } else {
    safeUpdateStatus(`${misspelledCount} spelling issues remaining`, "warning");
  }
}

/**
 * Clear all spell checker highlights from the page
 * @returns {Promise<void>} Promise that resolves when clearing is complete
 */
function clearHighlights() {
  console.log("Clearing spell checker highlights");

  return new Promise((resolve) => {
    try {
      // Reset the misspelled words object
      misspelledWords = {};

      // Remove all spell-check-misspelled spans but preserve the original text
      clearAllHighlights()
        .then(() => {
          // Clear storage if available
          try {
            if (
              typeof chrome !== "undefined" &&
              chrome.storage &&
              chrome.storage.sync
            ) {
              chrome.storage.sync.set({ misspelledWords: {} });
            }
          } catch (storageError) {
            console.error("Error clearing storage:", storageError);
          }

          // Update status if in the spell checker tab
          safeUpdateStatus("Spelling highlights cleared", "success");

          // Update UI
          updateSpellCheckerCount(0);
          updateSpellCheckerWordList({});

          resolve();
        })
        .catch((error) => {
          console.error("Error in clearAllHighlights:", error);

          // Still try to update UI even if there was an error
          try {
            updateSpellCheckerCount(0);
            updateSpellCheckerWordList({});
          } catch (uiError) {
            console.error("Failed to update UI after error:", uiError);
          }

          resolve();
        });
    } catch (globalError) {
      console.error("Error in clearHighlights:", globalError);
      resolve();
    }
  });
}

/**
 * Clear all highlights with a more efficient approach
 * @returns {Promise<void>} Promise that resolves when clearing is complete
 */
function clearAllHighlights() {
  return new Promise((resolve) => {
    const elementsToProcess = document.querySelectorAll(
      ".spell-check-misspelled"
    );
    const total = elementsToProcess.length;

    if (total === 0) {
      resolve();
      return;
    }

    console.log(`Found ${total} highlighted elements to clear`);

    // Process in batches to avoid UI freezing
    let processed = 0;
    const batchSize = 50;

    function processBatch() {
      const end = Math.min(processed + batchSize, total);

      for (let i = processed; i < end; i++) {
        try {
          const el = elementsToProcess[i];
          if (el) {
            el.classList.remove("spell-check-misspelled");
            el.removeAttribute("title");
          }
        } catch (error) {
          console.error("Error processing element:", error);
        }
      }

      processed = end;

      if (processed < total) {
        setTimeout(processBatch, 0);
      } else {
        // Also try the direct approach as a fallback for any missed elements
        setTimeout(() => {
          try {
            const allSpans = document.getElementsByTagName("span");
            let cleaned = 0;

            for (let i = 0; i < allSpans.length; i++) {
              const el = allSpans[i];
              if (
                el &&
                el.className &&
                el.className.includes("spell-check-misspelled")
              ) {
                el.classList.remove("spell-check-misspelled");
                el.removeAttribute("title");
                cleaned++;
              }
            }

            if (cleaned > 0) {
              console.log(
                `Cleaned ${cleaned} additional elements with direct approach`
              );
            }

            resolve();
          } catch (error) {
            console.error("Error in fallback cleanup:", error);
            resolve();
          }
        }, 10);
      }
    }

    // Start processing
    processBatch();
  });
}

/**
 * Apply CSS styles for the spell checker
 * This keeps styling in one place and reduces inline styles
 */
export function applySpellCheckerStyles() {
  try {
    // Check if styles are already added
    if (document.getElementById("spell-checker-styles")) {
      return;
    }

    // Create style element
    const style = document.createElement("style");
    style.id = "spell-checker-styles";

    // Add CSS rules
    style.textContent = `
      .spell-check-misspelled {
        background-color: rgba(255, 0, 0, 0.2);
        border-bottom: 1px dashed #ff0000;
        display: inline;
        white-space: nowrap;
        cursor: pointer;
        position: relative;
      }
      
      .spell-check-misspelled:hover {
        background-color: rgba(255, 0, 0, 0.3);
      }
      
      /* Ensure tooltip doesn't cause layout shifts */
      .spell-check-misspelled::before,
      .spell-check-misspelled::after {
        visibility: hidden;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.3s;
      }
      
      .spell-check-misspelled:hover::before,
      .spell-check-misspelled:hover::after {
        visibility: visible;
        opacity: 1;
      }
    `;

    // Add to document
    document.head.appendChild(style);
    console.log("Spell checker styles applied");
  } catch (error) {
    console.error("Error applying spell checker styles:", error);
  }
}

/**
 * Set custom technical terms to ignore
 * @param {Array<string>} terms - Array of technical terms to ignore
 */
export function setTechnicalTerms(terms) {
  if (!Array.isArray(terms)) {
    console.error("Technical terms must be an array");
    return;
  }

  // Reset technical terms
  technicalTerms = new Set();

  // Add new terms
  terms.forEach((term) => {
    if (term && typeof term === "string") {
      technicalTerms.add(term.toLowerCase());
    }
  });

  console.log(`Set ${technicalTerms.size} technical terms to ignore`);
}

/**
 * Add custom words to dictionary
 * @param {Array<string>} words - Array of words to add to dictionary
 */
export function addToDictionary(words) {
  if (!Array.isArray(words)) {
    console.error("Words must be an array");
    return;
  }

  // Add words to dictionary
  let addedCount = 0;
  words.forEach((word) => {
    if (word && typeof word === "string") {
      dictionary.add(word.toLowerCase());
      addedCount++;
    }
  });

  // Update dictionary count
  updateDictionaryCount(dictionary.size);

  // Save to storage
  saveDictionaryCount();

  console.log(`Added ${addedCount} words to dictionary`);
}

/**
 * Reset spell checker to initial state
 */
export function reset() {
  // Clear highlights
  clearHighlights();

  // Reset data structures
  misspelledWords = {};
  isInitialized = false;

  console.log("Spell checker reset to initial state");

  // Re-initialize
  initialize();
}

// Export additional methods for use in other modules
export { clearHighlights, isSpelledCorrectly, checkSpelling, ignoreWord };
