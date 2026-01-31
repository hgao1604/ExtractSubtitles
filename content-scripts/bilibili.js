// Bilibili content script

(function() {
  'use strict';

  let videoInfo = null;
  let subtitleList = [];
  let isInitialized = false;

  // Initialize the content script
  async function init() {
    if (isInitialized) return;
    isInitialized = true;

    console.log('[Subtitle Extractor] Bilibili content script loaded');

    // Inject the page script to access __INITIAL_STATE__
    await SubtitleExtractor.injectScript('injected/bilibili-injector.js');

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

      if (videoInfo?.bvid && videoInfo?.cid) {
        fetchSubtitleList();
      }
    }
  }

  // Handle messages from popup/background
  function handleRuntimeMessage(message, sender, sendResponse) {
    if (message.type === 'GET_STATUS') {
      sendResponse({
        platform: 'bilibili',
        videoInfo: videoInfo,
        subtitleList: subtitleList,
        hasSubtitles: subtitleList.length > 0
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

  // Fetch subtitle list from Bilibili API
  async function fetchSubtitleList() {
    if (!videoInfo?.bvid || !videoInfo?.cid) {
      console.log('[Subtitle Extractor] Missing bvid or cid');
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'FETCH_BILIBILI_SUBTITLE_LIST',
        bvid: videoInfo.bvid,
        cid: videoInfo.cid
      });

      if (response.success) {
        subtitleList = response.subtitles || [];
        console.log('[Subtitle Extractor] Got subtitle list:', subtitleList);
      } else {
        console.error('[Subtitle Extractor] Failed to fetch subtitle list:', response.error);
      }
    } catch (error) {
      console.error('[Subtitle Extractor] Error fetching subtitle list:', error);
    }
  }

  // Extract subtitle content
  async function extractSubtitle(language) {
    if (!subtitleList.length) {
      throw new Error('No subtitles available');
    }

    // Find the requested language or use first available
    let subtitle = subtitleList.find(s => s.lan === language);
    if (!subtitle) {
      subtitle = subtitleList[0];
    }

    if (!subtitle?.subtitle_url) {
      throw new Error('Subtitle URL not found');
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'FETCH_BILIBILI_SUBTITLE_CONTENT',
        url: subtitle.subtitle_url
      });

      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch subtitle content');
      }

      const subtitleData = response.data;
      const body = subtitleData.body || [];

      // Format and expose the data
      const exportData = SubtitleExtractor.formatExportData(
        'bilibili',
        videoInfo.bvid,
        videoInfo.title,
        subtitle.lan,
        body
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

  // Watch for URL changes (SPA navigation)
  let lastUrl = location.href;
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      console.log('[Subtitle Extractor] URL changed, reinitializing...');
      videoInfo = null;
      subtitleList = [];

      // Wait for page to load new content
      setTimeout(() => {
        SubtitleExtractor.sendToPage({ type: 'GET_VIDEO_INFO' });
      }, 2000);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
