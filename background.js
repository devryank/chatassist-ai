// ChatAssist-AI — Service Worker (background.js)
// Opens the options page on first install so the user can configure their API key.

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.runtime.openOptionsPage();
  }
});
