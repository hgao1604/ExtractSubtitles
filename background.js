// Service Worker for handling cross-origin API requests

// Badge 相关功能
function setBadge(tabId, captured = false) {
  if (captured) {
    chrome.action.setBadgeText({ text: '✓', tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#4CAF50', tabId });
  } else {
    chrome.action.setBadgeText({ text: '', tabId });
  }
}

// 标签页更新时清除 badge（URL 变化）
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    setBadge(tabId, false);
  }
});

// 标签页关闭时清理
chrome.tabs.onRemoved.addListener((tabId) => {
  setBadge(tabId, false);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Badge 设置消息
  if (message.type === 'SET_BADGE') {
    const tabId = sender.tab?.id;
    if (tabId) {
      setBadge(tabId, message.captured);
    }
    sendResponse({ success: true });
    return true;
  }
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
    return { success: false, error: error.message };
  }
}
