// YouTube page injector - runs in page context

(function() {
  'use strict';

  function getVideoInfo() {
    try {
      if (window.ytInitialPlayerResponse) {
        return extractFromPlayerResponse(window.ytInitialPlayerResponse);
      }

      if (window.ytplayer?.config?.args?.raw_player_response) {
        return extractFromPlayerResponse(window.ytplayer.config.args.raw_player_response);
      }

      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        const content = script.textContent;
        if (content.includes('ytInitialPlayerResponse')) {
          const match = content.match(/ytInitialPlayerResponse\s*=\s*({.+?});/s);
          if (match) {
            try {
              const data = JSON.parse(match[1]);
              return extractFromPlayerResponse(data);
            } catch (e) {}
          }
        }
      }

      return null;
    } catch (error) {
      console.error('[Subtitle Extractor] Error getting video info:', error);
      return null;
    }
  }

  function extractFromPlayerResponse(response) {
    const videoDetails = response.videoDetails || {};
    const captions = response.captions?.playerCaptionsTracklistRenderer;
    const captionTracks = captions?.captionTracks || [];

    return {
      videoId: videoDetails.videoId,
      title: videoDetails.title,
      channelId: videoDetails.channelId,
      author: videoDetails.author,
      lengthSeconds: videoDetails.lengthSeconds,
      captionTracks: captionTracks.map(track => ({
        baseUrl: track.baseUrl,
        name: track.name?.simpleText || track.name?.runs?.[0]?.text || '',
        languageCode: track.languageCode,
        kind: track.kind,
        isTranslatable: track.isTranslatable
      })),
      translationLanguages: captions?.translationLanguages?.map(lang => ({
        languageCode: lang.languageCode,
        languageName: lang.languageName?.simpleText || lang.languageName?.runs?.[0]?.text || ''
      })) || []
    };
  }

  // Get caption from the video player's caption module
  async function fetchSubtitleFromPlayer(videoId, languageCode) {
    try {
      console.log('[Subtitle Extractor] Starting fetch for video:', videoId, 'lang:', languageCode);

      // Get video info
      const info = getVideoInfo();
      console.log('[Subtitle Extractor] Video info:', info);
      console.log('[Subtitle Extractor] Caption tracks:', info?.captionTracks);

      if (!info) {
        throw new Error('Could not get video info');
      }

      if (!info.captionTracks || info.captionTracks.length === 0) {
        throw new Error('No caption tracks available for this video');
      }

      const track = info.captionTracks.find(t => t.languageCode === languageCode) || info.captionTracks[0];
      console.log('[Subtitle Extractor] Selected track:', track);

      if (!track?.baseUrl) {
        throw new Error('No caption URL in track');
      }

      console.log('[Subtitle Extractor] Base URL:', track.baseUrl);

      // Fetch with XMLHttpRequest
      const events = await fetchWithXHR(track.baseUrl);
      console.log('[Subtitle Extractor] XHR returned events:', events?.length);

      if (events && events.length > 0) {
        return { success: true, events };
      }

      // Try srv3 format
      const srv3Url = track.baseUrl.replace(/&fmt=\w+/, '') + '&fmt=srv3';
      console.log('[Subtitle Extractor] Trying srv3:', srv3Url);
      const srv3Events = await fetchSrv3Format(srv3Url);
      console.log('[Subtitle Extractor] srv3 returned events:', srv3Events?.length);

      if (srv3Events && srv3Events.length > 0) {
        return { success: true, events: srv3Events };
      }

      throw new Error('Could not fetch captions - all methods returned empty');
    } catch (error) {
      console.error('[Subtitle Extractor] Player fetch error:', error);
      return { success: false, error: error.message };
    }
  }

  // Fetch using XMLHttpRequest
  function fetchWithXHR(baseUrl) {
    return new Promise((resolve) => {
      const url = baseUrl + (baseUrl.includes('fmt=') ? '' : '&fmt=json3');
      console.log('[Subtitle Extractor] Fetching URL:', url);

      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.withCredentials = true;

      xhr.onload = function() {
        console.log('[Subtitle Extractor] XHR status:', xhr.status, 'length:', xhr.responseText?.length);

        if (xhr.status === 200 && xhr.responseText && xhr.responseText.trim() !== '') {
          try {
            const data = JSON.parse(xhr.responseText);
            console.log('[Subtitle Extractor] Parsed JSON, events:', data.events?.length);
            if (data.events && data.events.length > 0) {
              resolve(data.events);
              return;
            }
          } catch (e) {
            console.log('[Subtitle Extractor] JSON parse failed, trying XML');
          }
        }

        // Try without fmt parameter (XML format)
        const xmlUrl = baseUrl.replace(/&fmt=\w+/g, '');
        console.log('[Subtitle Extractor] Trying XML URL:', xmlUrl);

        const xhr2 = new XMLHttpRequest();
        xhr2.open('GET', xmlUrl, true);
        xhr2.withCredentials = true;

        xhr2.onload = function() {
          console.log('[Subtitle Extractor] XML status:', xhr2.status, 'length:', xhr2.responseText?.length);
          console.log('[Subtitle Extractor] XML sample:', xhr2.responseText?.substring(0, 200));

          if (xhr2.status === 200 && xhr2.responseText && xhr2.responseText.trim() !== '') {
            const events = parseXml(xhr2.responseText);
            console.log('[Subtitle Extractor] Parsed XML events:', events.length);
            resolve(events);
          } else {
            resolve([]);
          }
        };

        xhr2.onerror = () => resolve([]);
        xhr2.send();
      };

      xhr.onerror = () => resolve([]);
      xhr.send();
    });
  }

  // Fetch srv3 format
  function fetchSrv3Format(url) {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.withCredentials = true;

      xhr.onload = function() {
        if (xhr.status === 200 && xhr.responseText && xhr.responseText.trim() !== '') {
          const events = parseSrv3(xhr.responseText);
          resolve(events);
        } else {
          resolve([]);
        }
      };

      xhr.onerror = () => resolve([]);
      xhr.send();
    });
  }

  // Parse XML subtitle format
  function parseXml(xmlText) {
    const events = [];
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlText, 'text/xml');
      const textElements = doc.querySelectorAll('text');

      textElements.forEach(el => {
        const start = parseFloat(el.getAttribute('start') || '0') * 1000;
        const dur = parseFloat(el.getAttribute('dur') || '0') * 1000;
        const text = decodeEntities(el.textContent || '');

        if (text.trim()) {
          events.push({
            tStartMs: start,
            dDurationMs: dur,
            segs: [{ utf8: text }]
          });
        }
      });
    } catch (e) {
      console.error('[Subtitle Extractor] XML parse error:', e);
    }
    return events;
  }

  // Parse srv3 format
  function parseSrv3(text) {
    const events = [];
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'text/xml');
      const pElements = doc.querySelectorAll('p');

      pElements.forEach(el => {
        const start = parseInt(el.getAttribute('t') || '0');
        const dur = parseInt(el.getAttribute('d') || '0');
        const textContent = el.textContent || '';

        if (textContent.trim()) {
          events.push({
            tStartMs: start,
            dDurationMs: dur,
            segs: [{ utf8: decodeEntities(textContent) }]
          });
        }
      });
    } catch (e) {}
    return events;
  }

  function decodeEntities(text) {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
  }

  // Listen for requests from content script
  window.addEventListener('message', async (event) => {
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

    if (event.data.type === 'FETCH_SUBTITLE') {
      const { videoId, languageCode, requestId } = event.data;
      const result = await fetchSubtitleFromPlayer(videoId, languageCode);
      window.postMessage({
        source: 'subtitle-extractor-injector',
        type: 'SUBTITLE_DATA',
        requestId: requestId,
        ...result
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

  // Watch for navigation events
  document.addEventListener('yt-navigate-finish', () => {
    setTimeout(() => {
      const info = getVideoInfo();
      if (info) {
        window.postMessage({
          source: 'subtitle-extractor-injector',
          type: 'VIDEO_INFO_READY',
          data: info
        }, '*');
      }
    }, 1000);
  });
})();
