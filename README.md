# Paltech Alignment Checker

A Chrome extension that helps detect and highlight misaligned elements and broken images on web pages.

## Features

- Check for misaligned elements with different severity levels
- Detect broken images across the page
- Interactive UI with detailed tooltips
- Draggable popup window

## Project Structure

```
paltech-alignment-checker/
├── dist/                       # Compiled JavaScript files
├── src/                        # Source code
│   ├── css/                    # Stylesheets
│   │   └── styles.css          # Main CSS file
│   └── js/                     # JavaScript code
│       ├── modules/            # Modular components
│       │   ├── alignment.js    # Alignment detection logic
│       │   ├── brokenImages.js # Broken image detection
│       │   ├── highlights.js   # Element highlighting functionality
│       │   ├── popup.js        # UI popup handling
│       │   └── utils.js        # Shared utility functions
│       └── contentScript.js    # Main entry point
├── images/                     # Extension icons
├── background.js               # Service worker background script
├── manifest.json               # Extension manifest
├── package.json                # Project dependencies
└── webpack.config.js           # Webpack configuration
```

## Development

1. Install dependencies: `npm install`
2. Development mode: `npm run dev`
3. Build for production: `npm run build`

## Usage

1. Install the extension in Chrome
2. Navigate to any webpage
3. Click the extension icon to open the alignment checker
4. Use the different options to check for alignment issues or broken images

## How It Works

- **Alignment Detection**: Analyzes the position and dimensions of elements to find misalignments
- **Broken Image Detection**: Uses various techniques to identify broken or invalid images
- **Highlighting**: Outlines problematic elements with different colors based on severity
- **Tooltips**: Shows detailed information about why an element is flagged
