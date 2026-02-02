// YouTube content script

(function() {
  'use strict';

  let videoInfo = null;
  let capturedSubtitles = [];
  let currentVideoId = null; // 追踪当前视频ID，用于检测视频切换
  let injectorLoaded = false;

  // 检查是否在视频页面
  function isVideoPage() {
    return window.location.pathname === '/watch' && window.location.search.includes('v=');
  }

  // Inject the interceptor script into page context
  function injectScript() {
    if (injectorLoaded) return;

    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('injected/youtube-injector.js');
    script.onload = function() {
      this.remove();
      injectorLoaded = true;
    };
    (document.head || document.documentElement).appendChild(script);
  }

  // Inject immediately (interceptor works on all pages to catch navigations)
  injectScript();

  // Listen for messages from injected script
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (!event.data?.source?.startsWith('subtitle-extractor-yt-injector')) return;

    const { type, data } = event.data;

    if (type === 'VIDEO_INFO' || type === 'VIDEO_INFO_READY') {
      // 检测是否切换了视频（只有在已有 currentVideoId 时才清空）
      if (data?.videoId && currentVideoId && data.videoId !== currentVideoId) {
        capturedSubtitles = []; // 清空旧字幕
      }
      // 更新 currentVideoId
      if (data?.videoId) {
        currentVideoId = data.videoId;
      }
      videoInfo = data;
    }

    if (type === 'SUBTITLE_CAPTURED') {
      // 只在视频页面处理字幕捕获
      if (!isVideoPage()) {
        return;
      }

      // 延迟处理，让 VIDEO_INFO_READY 有时间先到达完成清空操作
      setTimeout(() => {
        // 去重：检查是否已存在相同语言
        const existingIndex = capturedSubtitles.findIndex(s => s.language === data.language);
        if (existingIndex >= 0) {
          capturedSubtitles[existingIndex] = data;
        } else {
          capturedSubtitles.push(data);
        }

        // 设置 Badge 标记
        chrome.runtime.sendMessage({ type: 'SET_BADGE', captured: true });
      }, 500); // 延迟 500ms
    }

    if (type === 'CAPTURED_SUBTITLES') {
      // 只有在本地没有数据时才使用 injector 的数据，避免覆盖
      if (capturedSubtitles.length === 0 && data && data.length > 0) {
        capturedSubtitles = data;
      }
    }
  });

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

    return { success: true, count: formattedSubtitles.length };
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_STATUS') {
      // 从 URL 获取当前视频 ID
      const urlMatch = window.location.search.match(/[?&]v=([^&]+)/);
      const currentUrlVideoId = urlMatch ? urlMatch[1] : null;

      // 如果本地 videoInfo 的 ID 与 URL 匹配，直接返回
      if (videoInfo && videoInfo.videoId === currentUrlVideoId) {
        sendResponse(getStatus());
        return true;
      }

      // 否则请求新的视频信息（不请求字幕，本地已有）
      requestVideoInfo();
      // 注意：不调用 requestCapturedSubtitles()，避免覆盖本地已捕获的字幕

      // 等待 injector 响应，最多等 2 秒
      let attempts = 0;
      const maxAttempts = 20;
      const checkInterval = setInterval(() => {
        attempts++;
        if (videoInfo && videoInfo.videoId === currentUrlVideoId) {
          clearInterval(checkInterval);
          sendResponse(getStatus());
        } else if (attempts >= maxAttempts) {
          clearInterval(checkInterval);
          sendResponse(getStatus());
        }
      }, 100);

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
})();
