// Shared utilities for content scripts

const SubtitleExtractor = {
  // Data container element ID
  CONTAINER_ID: 'subtitle-extractor-data',
  EVENT_NAME: 'subtitle-extractor-updated',

  // Inject a script into the page context
  injectScript(scriptPath) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL(scriptPath);
      script.onload = () => {
        script.remove();
        resolve();
      };
      script.onerror = reject;
      (document.head || document.documentElement).appendChild(script);
    });
  },

  // Listen for messages from injected scripts
  listenForPageMessages(callback) {
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      if (event.data && event.data.source === 'subtitle-extractor-injector') {
        callback(event.data);
      }
    });
  },

  // Send message to injected script
  sendToPage(data) {
    window.postMessage({
      source: 'subtitle-extractor-content',
      ...data
    }, '*');
  },

  // Expose subtitle data to the DOM
  exposeToDOM(data) {
    let container = document.getElementById(this.CONTAINER_ID);

    if (!container) {
      container = document.createElement('div');
      container.id = this.CONTAINER_ID;
      container.style.display = 'none';
      document.body.appendChild(container);
    }

    container.setAttribute('data-subtitles', JSON.stringify(data));
    container.setAttribute('data-timestamp', Date.now().toString());

    // Dispatch event to notify other extensions
    const event = new CustomEvent(this.EVENT_NAME, {
      detail: { timestamp: Date.now() }
    });
    document.dispatchEvent(event);
  },

  // Get current exposed data
  getExposedData() {
    const container = document.getElementById(this.CONTAINER_ID);
    if (!container) return null;

    try {
      return JSON.parse(container.getAttribute('data-subtitles'));
    } catch {
      return null;
    }
  },

  // Normalize subtitle format
  normalizeSubtitles(subtitles, platform) {
    if (platform === 'bilibili') {
      // Bilibili format: { from, to, content }
      return subtitles.map(item => ({
        start: item.from,
        end: item.to,
        text: item.content
      }));
    } else if (platform === 'youtube') {
      // YouTube format: { tStartMs, dDurationMs, segs: [{ utf8 }] }
      return subtitles.map(event => {
        const text = (event.segs || [])
          .map(seg => seg.utf8 || '')
          .join('')
          .trim();

        return {
          start: event.tStartMs / 1000,
          end: (event.tStartMs + (event.dDurationMs || 0)) / 1000,
          text: text
        };
      }).filter(item => item.text); // Filter out empty entries
    }

    return subtitles;
  },

  // Format final data structure
  formatExportData(platform, videoId, title, language, subtitles) {
    return {
      platform,
      videoId,
      title,
      language,
      extractedAt: new Date().toISOString(),
      subtitles: this.normalizeSubtitles(subtitles, platform)
    };
  }
};

// Make available globally
window.SubtitleExtractor = SubtitleExtractor;
