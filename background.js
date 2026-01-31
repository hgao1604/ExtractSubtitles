// Service Worker for handling cross-origin API requests

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FETCH_SUBTITLE') {
    handleFetchSubtitle(message.url, message.options)
      .then(sendResponse)
      .catch(error => sendResponse({ error: error.message }));
    return true; // Keep the message channel open for async response
  }

  if (message.type === 'FETCH_BILIBILI_SUBTITLE_LIST') {
    handleFetchBilibiliSubtitleList(message.bvid, message.cid)
      .then(sendResponse)
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }

  if (message.type === 'FETCH_BILIBILI_SUBTITLE_CONTENT') {
    handleFetchSubtitleContent(message.url)
      .then(sendResponse)
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }

  if (message.type === 'FETCH_YOUTUBE_SUBTITLE') {
    handleFetchYouTubeSubtitle(message.url)
      .then(sendResponse)
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }
});

async function handleFetchSubtitle(url, options = {}) {
  try {
    const response = await fetch(url, {
      ...options,
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function handleFetchBilibiliSubtitleList(bvid, cid) {
  try {
    const url = `https://api.bilibili.com/x/player/wbi/v2?bvid=${bvid}&cid=${cid}`;
    const response = await fetch(url, {
      credentials: 'include',
      headers: {
        'Referer': 'https://www.bilibili.com'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (data.code !== 0) {
      throw new Error(data.message || 'API returned error');
    }

    return {
      success: true,
      subtitles: data.data?.subtitle?.subtitles || []
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function handleFetchSubtitleContent(url) {
  try {
    // Ensure URL starts with https
    if (url.startsWith('//')) {
      url = 'https:' + url;
    }

    const response = await fetch(url, {
      credentials: 'include',
      headers: {
        'Referer': 'https://www.bilibili.com',
        'Origin': 'https://www.bilibili.com'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error('[Subtitle Extractor] Fetch subtitle content error:', error);
    return { success: false, error: error.message };
  }
}

async function handleFetchYouTubeSubtitle(url) {
  try {
    // Add fmt=json3 to get JSON format
    const fetchUrl = url.includes('fmt=') ? url : `${url}&fmt=json3`;

    const response = await fetch(fetchUrl, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const text = await response.text();

    // Check if response is empty
    if (!text || text.trim() === '') {
      // Try XML format as fallback
      const xmlUrl = url.replace(/&fmt=json3?/g, '');
      const xmlResponse = await fetch(xmlUrl);
      const xmlText = await xmlResponse.text();

      if (!xmlText || xmlText.trim() === '') {
        throw new Error('YouTube returned empty subtitle data. The video may require authentication or the subtitles are not accessible.');
      }

      // Parse XML format
      const events = parseYouTubeXmlSubtitles(xmlText);
      return { success: true, data: { events } };
    }

    try {
      const data = JSON.parse(text);
      return { success: true, data };
    } catch (parseError) {
      throw new Error('Failed to parse subtitle data: ' + parseError.message);
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Parse YouTube XML subtitle format
function parseYouTubeXmlSubtitles(xmlText) {
  const events = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  const textElements = doc.querySelectorAll('text');

  textElements.forEach(el => {
    const start = parseFloat(el.getAttribute('start')) * 1000;
    const dur = parseFloat(el.getAttribute('dur') || '0') * 1000;
    const text = el.textContent || '';

    events.push({
      tStartMs: start,
      dDurationMs: dur,
      segs: [{ utf8: text }]
    });
  });

  return events;
}
