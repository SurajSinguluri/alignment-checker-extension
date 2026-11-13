// Context menu setup
console.log("Setting up Paltech UI Checker background script");

chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed/updated");

  // Create parent menu item
  chrome.contextMenus.create({
    id: "paltech-checker",
    title: "Paltech Checker",
    contexts: ["all"],
  });

  // Create submenu items for each feature
  chrome.contextMenus.create({
    id: "paltech-checker-alignment",
    parentId: "paltech-checker",
    title: "Check Alignment",
    contexts: ["all"],
  });

  chrome.contextMenus.create({
    id: "paltech-checker-images",
    parentId: "paltech-checker",
    title: "Find Broken Images",
    contexts: ["all"],
  });

  chrome.contextMenus.create({
    id: "paltech-checker-spelling",
    parentId: "paltech-checker",
    title: "Check Spelling",
    contexts: ["all"],
  });

  console.log("Context menu items created");
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  console.log("Context menu clicked:", info.menuItemId);

  if (info.menuItemId === "paltech-checker-alignment") {
    chrome.tabs.sendMessage(tab.id, {
      action: "showPopup",
      tab: "alignment",
    });
  } else if (info.menuItemId === "paltech-checker-images") {
    chrome.tabs.sendMessage(tab.id, {
      action: "showPopup",
      tab: "images",
    });
  } else if (info.menuItemId === "paltech-checker-spelling") {
    console.log("Spell checker menu item clicked");
    chrome.tabs.sendMessage(tab.id, {
      action: "showPopup",
      tab: "spellchecker",
    });
  }
});

// Handle extension icon click
chrome.action.onClicked.addListener(async (tab) => {
  console.log("Extension icon clicked");

  // Don't run on chrome:// URLs or other restricted pages
  if (!tab.url.startsWith("chrome://") && !tab.url.startsWith("edge://")) {
    // Send message to content script to show popup
    try {
      console.log("Sending showPopup message to tab");
      await chrome.tabs.sendMessage(tab.id, { action: "showPopup" });
    } catch (error) {
      console.error("Error sending message, injecting content script:", error);

      // If content script is not yet loaded, inject it
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["dist/contentScript.js"],
      });

      // Then inject CSS
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ["src/css/styles.css"],
      });

      console.log("Content script and CSS injected, retrying message");

      // And try again
      setTimeout(async () => {
        await chrome.tabs.sendMessage(tab.id, { action: "showPopup" });
      }, 100);
    }
  } else {
    console.log("Extension cannot run on this page type:", tab.url);
  }
});
