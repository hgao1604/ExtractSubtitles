// YouTube XHR Interceptor - runs in page context
// Intercepts subtitle requests made by YouTube player

(function() {
  'use strict';

  console.log('[Subtitle Extractor] YouTube injector loaded');

  // Storage for captured subtitles
  window.__ytSubtitleData = {
    videoInfo: null,
    capturedSubtitles: [],
    lastCaptureTime: null
  };

  // Save original XHR methods
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  // Intercept XMLHttpRequest.open
  XMLHttpRequest.prototype.open = function(method, url, ...args) {
    this._requestUrl = url;
    this._requestMethod = method;
    return originalXHROpen.apply(this, [method, url, ...args]);
  };

  // Intercept XMLHttpRequest.send
  XMLHttpRequest.prototype.send = function(...args) {
    const url = this._requestUrl;

    // Check if this is a timedtext (subtitle) request
    if (url && typeof url === 'string' && url.includes('timedtext')) {
      console.log('[Subtitle Extractor] Intercepted timedtext request:', url.substring(0, 100));

      this.addEventListener('load', function() {
        try {
          const responseText = this.responseText;
          console.log('[Subtitle Extractor] Response received, status:', this.status, 'length:', responseText?.length);

          if (this.status === 200 && responseText && responseText.length > 0) {
            // Parse the subtitle data
            let subtitleData = null;

            // Try JSON format (json3)
            if (url.includes('fmt=json3') || responseText.trim().startsWith('{')) {
              try {
                subtitleData = JSON.parse(responseText);
                console.log('[Subtitle Extractor] Parsed JSON, events:', subtitleData.events?.length);
              } catch (e) {
                console.log('[Subtitle Extractor] JSON parse failed, trying XML');
              }
            }

            // Try XML format
            if (!subtitleData && responseText.includes('<?xml')) {
              subtitleData = parseXMLSubtitles(responseText);
            }

            // Store the captured data
            if (subtitleData) {
              const captureInfo = {
                url: url,
                timestamp: Date.now(),
                format: subtitleData.events ? 'json3' : 'xml',
                data: subtitleData,
                language: extractLanguageFromUrl(url)
              };

              // 去重：检查是否已存在相同语言的字幕
              const existingIndex = window.__ytSubtitleData.capturedSubtitles.findIndex(
                s => s.language === captureInfo.language
              );

              let isNewCapture = false;
              if (existingIndex >= 0) {
                // 更新已有记录（保留最新数据）
                window.__ytSubtitleData.capturedSubtitles[existingIndex] = captureInfo;
                console.log('[Subtitle Extractor] Subtitle updated:', captureInfo.language);
              } else {
                // 新语言，添加记录
                window.__ytSubtitleData.capturedSubtitles.push(captureInfo);
                isNewCapture = true;
                console.log('[Subtitle Extractor] Subtitle captured successfully!', captureInfo.language);
              }

              window.__ytSubtitleData.lastCaptureTime = Date.now();

              // 只有新捕获的字幕才通知 content script
              if (isNewCapture) {
                window.postMessage({
                  source: 'subtitle-extractor-yt-injector',
                  type: 'SUBTITLE_CAPTURED',
                  data: captureInfo
                }, '*');
              }
            }
          } else {
            console.log('[Subtitle Extractor] Empty or failed response');
          }
        } catch (error) {
          console.error('[Subtitle Extractor] Error processing response:', error);
        }
      });
    }

    return originalXHRSend.apply(this, args);
  };

  // Parse XML subtitle format
  function parseXMLSubtitles(xmlText) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlText, 'text/xml');
      const textElements = doc.querySelectorAll('text');

      const events = [];
      textElements.forEach(el => {
        const start = parseFloat(el.getAttribute('start') || '0') * 1000;
        const dur = parseFloat(el.getAttribute('dur') || '0') * 1000;
        const text = el.textContent || '';

        if (text.trim()) {
          events.push({
            tStartMs: start,
            dDurationMs: dur,
            segs: [{ utf8: decodeHTMLEntities(text) }]
          });
        }
      });

      return { events };
    } catch (e) {
      console.error('[Subtitle Extractor] XML parse error:', e);
      return null;
    }
  }

  // Decode HTML entities
  function decodeHTMLEntities(text) {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
  }

  // Extract language code from URL
  function extractLanguageFromUrl(url) {
    const match = url.match(/[&?]lang=([^&]+)/);
    return match ? match[1] : 'unknown';
  }

  // Get video info from page
  function getVideoInfo() {
    try {
      if (window.ytInitialPlayerResponse) {
        const response = window.ytInitialPlayerResponse;
        const videoDetails = response.videoDetails || {};
        const captions = response.captions?.playerCaptionsTracklistRenderer;

        return {
          videoId: videoDetails.videoId,
          title: videoDetails.title,
          author: videoDetails.author,
          lengthSeconds: videoDetails.lengthSeconds,
          captionTracks: captions?.captionTracks?.map(t => ({
            languageCode: t.languageCode,
            name: t.name?.simpleText || t.name?.runs?.[0]?.text || '',
            baseUrl: t.baseUrl
          })) || []
        };
      }
      return null;
    } catch (e) {
      console.error('[Subtitle Extractor] Error getting video info:', e);
      return null;
    }
  }

  // Listen for messages from content script
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.source !== 'subtitle-extractor-yt-content') return;

    const { type } = event.data;

    if (type === 'GET_VIDEO_INFO') {
      const info = getVideoInfo();
      window.__ytSubtitleData.videoInfo = info;

      window.postMessage({
        source: 'subtitle-extractor-yt-injector',
        type: 'VIDEO_INFO',
        data: info
      }, '*');
    }

    if (type === 'GET_CAPTURED_SUBTITLES') {
      window.postMessage({
        source: 'subtitle-extractor-yt-injector',
        type: 'CAPTURED_SUBTITLES',
        data: window.__ytSubtitleData.capturedSubtitles
      }, '*');
    }

    if (type === 'CLEAR_CAPTURED') {
      window.__ytSubtitleData.capturedSubtitles = [];
      console.log('[Subtitle Extractor] Cleared captured subtitles');
    }
  });

  // Auto-send video info when ready
  const checkReady = setInterval(() => {
    if (window.ytInitialPlayerResponse) {
      clearInterval(checkReady);
      const info = getVideoInfo();
      if (info) {
        window.__ytSubtitleData.videoInfo = info;
        window.postMessage({
          source: 'subtitle-extractor-yt-injector',
          type: 'VIDEO_INFO_READY',
          data: info
        }, '*');
        console.log('[Subtitle Extractor] Video info ready:', info.title);
      }
    }
  }, 500);

  // Stop checking after 30 seconds
  setTimeout(() => clearInterval(checkReady), 30000);

  // 从 URL 获取当前视频 ID
  function getVideoIdFromUrl() {
    const match = window.location.search.match(/[?&]v=([^&]+)/);
    return match ? match[1] : null;
  }

  // Watch for SPA navigation
  document.addEventListener('yt-navigate-finish', () => {
    console.log('[Subtitle Extractor] Navigation detected, clearing old data');
    window.__ytSubtitleData.capturedSubtitles = [];

    const expectedVideoId = getVideoIdFromUrl();
    let attempts = 0;
    const maxAttempts = 20; // 最多尝试 10 秒

    // 轮询等待 ytInitialPlayerResponse 更新为新视频
    const pollForNewVideo = setInterval(() => {
      attempts++;
      const info = getVideoInfo();

      // 检查是否已获取到新视频信息
      if (info && info.videoId === expectedVideoId) {
        clearInterval(pollForNewVideo);
        window.__ytSubtitleData.videoInfo = info;
        window.postMessage({
          source: 'subtitle-extractor-yt-injector',
          type: 'VIDEO_INFO_READY',
          data: info
        }, '*');
        console.log('[Subtitle Extractor] New video info ready:', info.title);
      } else if (attempts >= maxAttempts) {
        clearInterval(pollForNewVideo);
        console.log('[Subtitle Extractor] Timeout waiting for new video info');
        // 超时后仍发送当前信息
        if (info) {
          window.__ytSubtitleData.videoInfo = info;
          window.postMessage({
            source: 'subtitle-extractor-yt-injector',
            type: 'VIDEO_INFO_READY',
            data: info
          }, '*');
        }
      }
    }, 500);
  });

  console.log('[Subtitle Extractor] XHR interceptor installed');
})();
