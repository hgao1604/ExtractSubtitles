// YouTube content script

(function() {
  'use strict';

  console.log('[Subtitle Extractor] YouTube content script loaded');

  let videoInfo = null;
  let capturedSubtitles = [];
  let currentVideoId = null; // 追踪当前视频ID，用于检测视频切换

  // 防抖：记录最近通知的语言和时间
  let lastNotification = { language: null, time: 0 };

  // Inject the interceptor script into page context ASAP
  function injectScript() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('injected/youtube-injector.js');
    script.onload = function() {
      this.remove();
      console.log('[Subtitle Extractor] Injector script loaded');
    };
    (document.head || document.documentElement).appendChild(script);
  }

  // Inject immediately
  injectScript();

  // Listen for messages from injected script
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (!event.data?.source?.startsWith('subtitle-extractor-yt-injector')) return;

    const { type, data } = event.data;

    if (type === 'VIDEO_INFO' || type === 'VIDEO_INFO_READY') {
      // 检测是否切换了视频
      if (data?.videoId && data.videoId !== currentVideoId) {
        console.log('[Subtitle Extractor] Video changed, clearing old data');
        capturedSubtitles = []; // 清空旧字幕
        lastNotification = { language: null, time: 0 }; // 重置防抖
        currentVideoId = data.videoId;
      }
      videoInfo = data;
      console.log('[Subtitle Extractor] Received video info:', data?.title);
    }

    if (type === 'SUBTITLE_CAPTURED') {
      // 去重：检查是否已存在相同语言
      const existingIndex = capturedSubtitles.findIndex(s => s.language === data.language);
      if (existingIndex >= 0) {
        capturedSubtitles[existingIndex] = data;
      } else {
        capturedSubtitles.push(data);
      }
      console.log('[Subtitle Extractor] Subtitle captured:', data.language, 'Total:', capturedSubtitles.length);

      // 防抖：3秒内同语言不重复提示
      const now = Date.now();
      if (lastNotification.language === data.language && now - lastNotification.time < 3000) {
        return; // 跳过重复提示
      }
      lastNotification = { language: data.language, time: now };

      // Show notification
      showNotification(`字幕已捕获: ${data.language}`);
    }

    if (type === 'CAPTURED_SUBTITLES') {
      capturedSubtitles = data || [];
    }
  });

  // Show a toast notification on the page
  function showNotification(message) {
    const existing = document.getElementById('subtitle-extractor-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'subtitle-extractor-toast';
    toast.style.cssText = `
      position: fixed;
      top: 70px;
      right: 20px;
      background: #4CAF50;
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      z-index: 999999;
      font-family: Arial, sans-serif;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      animation: slideIn 0.3s ease;
    `;
    toast.textContent = message;

    // Add animation style
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // Request video info from injected script
  function requestVideoInfo() {
    window.postMessage({
      source: 'subtitle-extractor-yt-content',
      type: 'GET_VIDEO_INFO'
    }, '*');
  }

  // Request captured subtitles
  function requestCapturedSubtitles() {
    window.postMessage({
      source: 'subtitle-extractor-yt-content',
      type: 'GET_CAPTURED_SUBTITLES'
    }, '*');
  }

  // Get current status for popup
  function getStatus() {
    return {
      platform: 'youtube',
      videoInfo: videoInfo,
      hasSubtitles: videoInfo?.captionTracks?.length > 0,
      subtitleList: videoInfo?.captionTracks?.map(t => ({
        lan: t.languageCode,
        lan_doc: t.name || t.languageCode
      })) || [],
      capturedCount: capturedSubtitles.length,
      capturedLanguages: capturedSubtitles.map(s => s.language)
    };
  }

  // Format captured subtitles for export
  function formatSubtitles(subtitleData) {
    if (!subtitleData?.data?.events) return [];

    return subtitleData.data.events
      .filter(e => e.segs && e.segs.length > 0)
      .map(event => ({
        start: (event.tStartMs || 0) / 1000,
        end: ((event.tStartMs || 0) + (event.dDurationMs || 0)) / 1000,
        text: event.segs.map(s => s.utf8 || '').join('').trim()
      }))
      .filter(s => s.text);
  }

  // Export subtitles to DOM
  function exportToDOM(language) {
    const subtitle = capturedSubtitles.find(s => s.language === language) || capturedSubtitles[0];

    if (!subtitle) {
      return { success: false, error: '没有找到捕获的字幕，请确保已开启字幕并播放视频' };
    }

    const formattedSubtitles = formatSubtitles(subtitle);

    if (formattedSubtitles.length === 0) {
      return { success: false, error: '字幕数据为空' };
    }

    const exportData = {
      platform: 'youtube',
      videoId: videoInfo?.videoId,
      title: videoInfo?.title,
      author: videoInfo?.author,
      language: subtitle.language,
      extractedAt: new Date().toISOString(),
      subtitles: formattedSubtitles
    };

    // Write to DOM using shared function
    if (typeof writeSubtitlesToDOM === 'function') {
      writeSubtitlesToDOM(exportData);
    } else {
      // Fallback
      let container = document.getElementById('subtitle-extractor-data');
      if (!container) {
        container = document.createElement('div');
        container.id = 'subtitle-extractor-data';
        container.style.display = 'none';
        document.body.appendChild(container);
      }
      container.setAttribute('data-subtitles', JSON.stringify(exportData));
    }

    console.log('[Subtitle Extractor] Exported', formattedSubtitles.length, 'subtitle entries');
    return { success: true, count: formattedSubtitles.length };
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[Subtitle Extractor] Received message:', message.type);

    if (message.type === 'GET_STATUS') {
      // Request fresh data from injector
      requestVideoInfo();
      requestCapturedSubtitles();

      // Wait a bit for responses
      setTimeout(() => {
        sendResponse(getStatus());
      }, 300);

      return true; // Keep channel open
    }

    if (message.type === 'EXTRACT_SUBTITLE') {
      const result = exportToDOM(message.language);
      sendResponse(result);
      return true;
    }

    if (message.type === 'REFRESH_INFO') {
      requestVideoInfo();
      sendResponse({ success: true });
      return true;
    }
  });

  // Initial request after a delay
  setTimeout(() => {
    requestVideoInfo();
  }, 1000);

  console.log('[Subtitle Extractor] YouTube content script initialized');
})();
