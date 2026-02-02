// Popup script

document.addEventListener('DOMContentLoaded', init);

let elements = {};
let currentStatus = null;

// i18n helper function
function getMessage(key, substitutions) {
  return chrome.i18n.getMessage(key, substitutions) || key;
}

// Apply i18n to all elements with data-i18n attribute
function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n');
    const args = element.getAttribute('data-i18n-args');

    if (args) {
      element.textContent = getMessage(key, args.split(','));
    } else {
      element.textContent = getMessage(key);
    }
  });
}

async function init() {
  // Apply i18n first
  applyI18n();

  elements = {
    loading: document.getElementById('loading'),
    error: document.getElementById('error'),
    errorMessage: document.getElementById('error-message'),
    videoInfo: document.getElementById('video-info'),
    platformBadge: document.getElementById('platform-badge'),
    videoTitle: document.getElementById('video-title'),
    subtitleSection: document.getElementById('subtitle-section'),
    languageSelect: document.getElementById('language-select'),
    actionSection: document.getElementById('action-section'),
    extractBtn: document.getElementById('extract-btn'),
    successSection: document.getElementById('success-section'),
    noSubtitlesSection: document.getElementById('no-subtitles-section'),
    refreshBtn: document.getElementById('refresh-btn')
  };

  elements.refreshBtn.addEventListener('click', refresh);
  elements.extractBtn.addEventListener('click', extract);

  await checkStatus();
}

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function checkStatus() {
  showLoading();

  try {
    const tab = await getCurrentTab();
    const url = tab.url || '';
    const isBilibili = url.includes('bilibili.com/video');
    const isYouTube = url.includes('youtube.com/watch');

    if (!isBilibili && !isYouTube) {
      showError(getMessage('errorNotVideoPage'));
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_STATUS' });

    if (!response) {
      showError(getMessage('errorCannotCommunicate'));
      return;
    }

    currentStatus = response;
    displayStatus(response);
  } catch (error) {
    // 检测是否是连接错误（content script 未加载）
    if (error.message?.includes('Could not establish connection') ||
        error.message?.includes('Receiving end does not exist')) {
      showError(getMessage('errorNotLoaded'));
    } else {
      showError(getMessage('errorCannotDetect'));
    }
  }
}

function displayStatus(status) {
  hideAll();

  const unknownTitle = getMessage('unknownTitle');

  if (status.videoInfo) {
    elements.videoInfo.classList.remove('hidden');

    if (status.platform === 'youtube') {
      elements.platformBadge.textContent = 'YouTube';
      elements.platformBadge.className = 'platform-badge youtube';

      // Show captured count for YouTube
      if (status.capturedCount > 0) {
        const capturedText = getMessage('capturedCount', [status.capturedCount.toString()]);
        elements.videoTitle.textContent = `${status.videoInfo.title || unknownTitle} (${capturedText})`;
      } else {
        elements.videoTitle.textContent = `${status.videoInfo.title || unknownTitle} (${getMessage('waitingCapture')})`;
      }
    } else {
      elements.platformBadge.textContent = 'Bilibili';
      elements.platformBadge.className = 'platform-badge bilibili';
      elements.videoTitle.textContent = status.videoInfo.title || unknownTitle;
    }
  }

  // For YouTube, show captured languages or available tracks
  if (status.platform === 'youtube') {
    if (status.capturedCount > 0) {
      elements.languageSelect.innerHTML = '';
      status.capturedLanguages.forEach(lang => {
        const option = document.createElement('option');
        option.value = lang;
        option.textContent = lang;
        elements.languageSelect.appendChild(option);
      });
      elements.subtitleSection.classList.remove('hidden');
      elements.actionSection.classList.remove('hidden');
    } else if (status.hasSubtitles) {
      // Show hint to enable subtitles
      elements.noSubtitlesSection.classList.remove('hidden');
      const hint = elements.noSubtitlesSection.querySelector('.warning span:last-child');
      if (hint) {
        hint.textContent = getMessage('enableSubtitlesHint');
      }
    } else {
      elements.noSubtitlesSection.classList.remove('hidden');
    }
  } else {
    // Bilibili logic
    if (status.hasSubtitles && status.subtitleList?.length > 0) {
      elements.languageSelect.innerHTML = '';
      status.subtitleList.forEach(sub => {
        const option = document.createElement('option');
        option.value = sub.lan;
        option.textContent = sub.lan_doc || sub.lan;
        elements.languageSelect.appendChild(option);
      });

      elements.subtitleSection.classList.remove('hidden');
      elements.actionSection.classList.remove('hidden');
    } else {
      elements.noSubtitlesSection.classList.remove('hidden');
    }
  }
}

async function extract() {
  const language = elements.languageSelect.value;

  elements.extractBtn.disabled = true;
  elements.extractBtn.textContent = getMessage('extracting');

  try {
    const tab = await getCurrentTab();
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'EXTRACT_SUBTITLE',
      language: language
    });

    if (response.error) {
      showError(response.error);
      return;
    }

    if (response.success) {
      elements.subtitleSection.classList.add('hidden');
      elements.actionSection.classList.add('hidden');
      elements.successSection.classList.remove('hidden');
    }
  } catch (error) {
    showError(getMessage('errorExtractFailed', [error.message]));
  } finally {
    elements.extractBtn.disabled = false;
    elements.extractBtn.textContent = getMessage('extractSubtitles');
  }
}

async function refresh() {
  elements.refreshBtn.disabled = true;

  try {
    const tab = await getCurrentTab();
    await chrome.tabs.sendMessage(tab.id, { type: 'REFRESH_INFO' });
    await new Promise(resolve => setTimeout(resolve, 1500));
    await checkStatus();
  } catch (error) {
    showError(getMessage('errorRefreshFailed'));
  } finally {
    elements.refreshBtn.disabled = false;
  }
}

function showLoading() {
  hideAll();
  elements.loading.classList.remove('hidden');
}

function showError(message) {
  hideAll();
  elements.error.classList.remove('hidden');
  elements.errorMessage.textContent = message;
}

function hideAll() {
  elements.loading.classList.add('hidden');
  elements.error.classList.add('hidden');
  elements.videoInfo.classList.add('hidden');
  elements.subtitleSection.classList.add('hidden');
  elements.actionSection.classList.add('hidden');
  elements.successSection.classList.add('hidden');
  elements.noSubtitlesSection.classList.add('hidden');
}
