// Service Worker for handling cross-origin API requests

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FETCH_SUBTITLE') {
    handleFetchSubtitle(message.url, message.options)
      .then(sendResponse)
      .catch(error => sendResponse({ error: error.message }));
    return true;
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
