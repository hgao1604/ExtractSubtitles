// Bilibili page injector - runs in page context to access __INITIAL_STATE__

(function() {
  'use strict';

  function getVideoInfo() {
    try {
      // Try to get from __INITIAL_STATE__
      if (window.__INITIAL_STATE__) {
        const state = window.__INITIAL_STATE__;
        const videoData = state.videoData || state.epInfo || {};

        return {
          bvid: videoData.bvid || state.bvid,
          cid: videoData.cid || state.epInfo?.cid || state.cid,
          aid: videoData.aid || state.aid,
          title: videoData.title || state.videoData?.title || document.title,
          // For bangumi pages
          epId: state.epInfo?.ep_id
        };
      }

      // Fallback: try to get bvid from URL
      const urlMatch = window.location.pathname.match(/\/video\/(BV[\w]+)/);
      if (urlMatch) {
        return {
          bvid: urlMatch[1],
          title: document.title
        };
      }

      return null;
    } catch (error) {
      console.error('[Subtitle Extractor] Error getting video info:', error);
      return null;
    }
  }

  // Listen for requests from content script
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.source !== 'subtitle-extractor-content') return;

    if (event.data.type === 'GET_VIDEO_INFO') {
      const info = getVideoInfo();
      window.postMessage({
        source: 'subtitle-extractor-injector',
        type: 'VIDEO_INFO',
        data: info
      }, '*');
    }
  });

  // Auto-send video info when script loads
  setTimeout(() => {
    const info = getVideoInfo();
    if (info) {
      window.postMessage({
        source: 'subtitle-extractor-injector',
        type: 'VIDEO_INFO_READY',
        data: info
      }, '*');
    }
  }, 500);
})();
