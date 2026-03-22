// ChatAssist-AI — popup.js
// Shows API key status and opens the options page on button click.

document.addEventListener('DOMContentLoaded', () => {
  const apiStatus    = document.getElementById('api-status');
  const settingsBtn  = document.getElementById('open-settings-btn');

  // Check if API key is configured
  chrome.storage.local.get(['claudeApiKey'], (result) => {
    if (result.claudeApiKey && result.claudeApiKey.trim().startsWith('sk-ant-')) {
      apiStatus.textContent = '✓ Configured';
      apiStatus.className   = 'status-badge status-badge--ok';
    } else {
      apiStatus.textContent = 'Not set';
      apiStatus.className   = 'status-badge status-badge--missing';
    }
  });

  // Open Options page
  settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
});
