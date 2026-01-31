// Popup script

document.addEventListener('DOMContentLoaded', init);

let elements = {};
let currentStatus = null;

async function init() {
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

    if (!isBilibili) {
      showError('请打开B站视频页面使用此插件');
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_STATUS' });

    if (!response) {
      showError('无法与页面通信，请刷新页面后重试');
      return;
    }

    currentStatus = response;
    displayStatus(response);
  } catch (error) {
    console.error('Error checking status:', error);
    showError('无法检测视频信息，请刷新页面后重试');
  }
}

function displayStatus(status) {
  hideAll();

  if (status.videoInfo) {
    elements.videoInfo.classList.remove('hidden');
    elements.platformBadge.textContent = 'Bilibili';
    elements.platformBadge.className = 'platform-badge bilibili';
    elements.videoTitle.textContent = status.videoInfo.title || '未知标题';
  }

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

async function extract() {
  const language = elements.languageSelect.value;

  elements.extractBtn.disabled = true;
  elements.extractBtn.textContent = '提取中...';

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
    showError('提取字幕失败: ' + error.message);
  } finally {
    elements.extractBtn.disabled = false;
    elements.extractBtn.textContent = '提取字幕';
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
    console.error('Error refreshing:', error);
    showError('刷新失败，请重新加载页面');
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
