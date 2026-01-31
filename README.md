# Subtitle Extractor

A Chrome extension that extracts subtitles from Bilibili and YouTube videos, making them accessible to other extensions (like Claude) for summarization and analysis.

## Features

- **Bilibili Support**: Extract CC subtitles from Bilibili videos
- **YouTube Support**: Extract captions from YouTube videos (work in progress)
- **DOM Exposure**: Subtitle data is exposed to the page DOM, allowing other extensions to access it
- **Multiple Languages**: Support for multiple subtitle languages when available

## Installation

### From Source (Developer Mode)

1. Clone this repository:
   ```bash
   git clone https://github.com/hgao1604/ExtractSubtitles.git
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable **Developer mode** (toggle in the top right)

4. Click **Load unpacked** and select the `ExtractSubtitles` folder

5. The extension icon should appear in your toolbar

## Usage

1. Navigate to a Bilibili or YouTube video page
2. Click the **Subtitle Extractor** extension icon
3. Click **Extract** to fetch the subtitles
4. Once extracted, the data is available in the page DOM at `#subtitle-extractor-data`

### Accessing Extracted Data

In the browser console, you can access the subtitle data:

```javascript
// Get the subtitle data
const data = JSON.parse(
  document.querySelector('#subtitle-extractor-data')
    .getAttribute('data-subtitles')
);

// View structure
console.log(data);
// {
//   platform: 'bilibili' | 'youtube',
//   videoId: '...',
//   title: '...',
//   language: '...',
//   extractedAt: '...',
//   subtitles: [
//     { start: 0, end: 2.5, text: '...' },
//     ...
//   ]
// }
```

### Integration with Claude Extension

Create a shortcut in Claude's Chrome extension:

- **Name**: `summarize-subtitles`
- **Prompt**:
  ```
  Read the subtitle data from #subtitle-extractor-data element's data-subtitles attribute.
  Summarize the video content and list key points.
  ```

## Project Structure

```
ExtractSubtitles/
├── manifest.json          # Extension configuration
├── background.js          # Service worker for API requests
├── popup/
│   ├── popup.html        # Extension popup UI
│   ├── popup.css         # Popup styles
│   └── popup.js          # Popup logic
├── content-scripts/
│   ├── shared.js         # Shared utilities
│   ├── bilibili.js       # Bilibili content script
│   └── youtube.js        # YouTube content script
└── injected/
    ├── bilibili-injector.js  # Bilibili page context script
    └── youtube-injector.js   # YouTube page context script
```

## How It Works

1. **Content Scripts** are injected into video pages to communicate with the extension popup
2. **Injected Scripts** run in the page context to access video player APIs and subtitle data
3. **Background Service Worker** handles cross-origin API requests
4. Extracted subtitles are stored in a hidden DOM element for other extensions to access

## Supported Platforms

| Platform | Status | Notes |
|----------|--------|-------|
| Bilibili | ✅ Working | Requires video to have CC subtitles |
| YouTube | 🚧 In Progress | API restrictions being resolved |

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
