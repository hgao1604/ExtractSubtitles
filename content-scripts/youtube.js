// YouTube content script

(function() {
  'use strict';

  let videoInfo = null;
  let isInitialized = false;
  let pendingSubtitleRequests = new Map();

  // Initialize the content script
  async function init() {
    if (isInitialized) return;
    isInitialized = true;

    console.log('[Subtitle Extractor] YouTube content script loaded');

    // Inject the page script to access ytInitialPlayerResponse
    await SubtitleExtractor.injectScript('injected/youtube-injector.js');

    // Listen for messages from injected script
    SubtitleExtractor.listenForPageMessages(handlePageMessage);

    // Listen for messages from popup
    chrome.runtime.onMessage.addListener(handleRuntimeMessage);

    // Request video info
    setTimeout(() => {
      SubtitleExtractor.sendToPage({ type: 'GET_VIDEO_INFO' });
    }, 1000);
  }

  // Handle messages from injected script
  function handlePageMessage(message) {
    if (message.type === 'VIDEO_INFO' || message.type === 'VIDEO_INFO_READY') {
      videoInfo = message.data;
      console.log('[Subtitle Extractor] Got video info:', videoInfo);
    }

    if (message.type === 'SUBTITLE_DATA') {
      const requestId = message.requestId;
      const pending = pendingSubtitleRequests.get(requestId);
      if (pending) {
        pendingSubtitleRequests.delete(requestId);
        if (message.success) {
          pending.resolve(message.events);
        } else {
          pending.reject(new Error(message.error));
        }
      }
    }
  }

  // Handle messages from popup/background
  function handleRuntimeMessage(message, sender, sendResponse) {
    if (message.type === 'GET_STATUS') {
      const captionTracks = videoInfo?.captionTracks || [];
      sendResponse({
        platform: 'youtube',
        videoInfo: videoInfo ? {
          videoId: videoInfo.videoId,
          title: videoInfo.title,
          author: videoInfo.author
        } : null,
        subtitleList: captionTracks.map(track => ({
          lan: track.languageCode,
          lan_doc: track.name,
          kind: track.kind
        })),
        hasSubtitles: captionTracks.length > 0
      });
      return true;
    }

    if (message.type === 'EXTRACT_SUBTITLE') {
      extractSubtitle(message.language)
        .then(sendResponse)
        .catch(error => sendResponse({ error: error.message }));
      return true;
    }

    if (message.type === 'REFRESH_INFO') {
      SubtitleExtractor.sendToPage({ type: 'GET_VIDEO_INFO' });
      sendResponse({ success: true });
      return true;
    }
  }

  // Fetch subtitle through injected script (runs in page context)
  function fetchSubtitleViaPage(languageCode) {
    return new Promise((resolve, reject) => {
      const requestId = Date.now() + Math.random().toString(36);

      // Set timeout
      const timeout = setTimeout(() => {
        pendingSubtitleRequests.delete(requestId);
        reject(new Error('Subtitle fetch timeout'));
      }, 15000);

      pendingSubtitleRequests.set(requestId, {
        resolve: (data) => {
          clearTimeout(timeout);
          resolve(data);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });

      SubtitleExtractor.sendToPage({
        type: 'FETCH_SUBTITLE',
        videoId: videoInfo.videoId,
        languageCode: languageCode,
        requestId: requestId
      });
    });
  }

  // Extract subtitle content
  async function extractSubtitle(language) {
    const captionTracks = videoInfo?.captionTracks || [];

    if (!captionTracks.length) {
      throw new Error('No subtitles available');
    }

    // Find the requested language or use first available
    let track = captionTracks.find(t => t.languageCode === language);
    if (!track) {
      track = captionTracks[0];
    }

    try {
      // Fetch through page context (has proper auth/cookies)
      const events = await fetchSubtitleViaPage(track.languageCode);

      // Format and expose the data
      const exportData = SubtitleExtractor.formatExportData(
        'youtube',
        videoInfo.videoId,
        videoInfo.title,
        track.languageCode,
        events
      );

      SubtitleExtractor.exposeToDOM(exportData);

      return {
        success: true,
        data: exportData
      };
    } catch (error) {
      console.error('[Subtitle Extractor] Error extracting subtitle:', error);
      throw error;
    }
  }

  // Watch for YouTube SPA navigation
  document.addEventListener('yt-navigate-finish', () => {
    console.log('[Subtitle Extractor] YouTube navigation detected');
    videoInfo = null;

    setTimeout(() => {
      SubtitleExtractor.sendToPage({ type: 'GET_VIDEO_INFO' });
    }, 1500);
  });

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
