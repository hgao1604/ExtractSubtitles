// Popup script

document.addEventListener('DOMContentLoaded', init);

// DOM Elements - initialized after DOM loads
let elements = {};
let currentStatus = null;

async function init() {
  // Initialize elements after DOM is ready
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

    // Check if we're on a supported site
    const url = tab.url || '';
    const isBilibili = url.includes('bilibili.com/video');
    const isYouTube = url.includes('youtube.com/watch');

    if (!isBilibili && !isYouTube) {
      showError('Please navigate to a Bilibili or YouTube video page.');
      return;
    }

    // Send message to content script
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_STATUS' });

    if (!response) {
      showError('Unable to communicate with the page. Try refreshing the page.');
      return;
    }

    currentStatus = response;
    displayStatus(response);
  } catch (error) {
    console.error('Error checking status:', error);
    showError('Unable to detect video. Try refreshing the page.');
  }
}

function displayStatus(status) {
  hideAll();

  // Show video info
  if (status.videoInfo) {
    elements.videoInfo.classList.remove('hidden');
    elements.platformBadge.textContent = status.platform === 'bilibili' ? 'Bilibili' : 'YouTube';
    elements.platformBadge.className = `platform-badge ${status.platform}`;
    elements.videoTitle.textContent = status.videoInfo.title || 'Unknown title';
  }

  // Handle subtitles
  if (status.hasSubtitles && status.subtitleList?.length > 0) {
    // Populate language select
    elements.languageSelect.innerHTML = '';
    status.subtitleList.forEach(sub => {
      const option = document.createElement('option');
      option.value = sub.lan;
      option.textContent = sub.lan_doc || sub.lan;
      if (sub.kind === 'asr') {
        option.textContent += ' (Auto-generated)';
      }
      elements.languageSelect.appendChild(option);
    });

    elements.subtitleSection.classList.remove('hidden');
    elements.actionSection.classList.remove('hidden');
  } else {
    elements.noSubtitlesSection.classList.remove('hidden');
  }
}

async function extract() {
  const language = elements.languageSelect.value;

  elements.extractBtn.disabled = true;
  elements.extractBtn.textContent = 'Extracting...';

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
    console.error('Error extracting subtitles:', error);
    showError('Failed to extract subtitles: ' + error.message);
  } finally {
    elements.extractBtn.disabled = false;
    elements.extractBtn.textContent = 'Extract Subtitles';
  }
}

async function refresh() {
  elements.refreshBtn.disabled = true;

  try {
    const tab = await getCurrentTab();
    await chrome.tabs.sendMessage(tab.id, { type: 'REFRESH_INFO' });

    // Wait a bit for the info to be fetched
    await new Promise(resolve => setTimeout(resolve, 1500));

    await checkStatus();
  } catch (error) {
    console.error('Error refreshing:', error);
    showError('Failed to refresh. Try reloading the page.');
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
