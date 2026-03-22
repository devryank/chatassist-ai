// ChatAssist-AI — options.js
// Handles saving and loading API key + system prompt using chrome.storage.local.

document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput    = document.getElementById('api-key-input');
  const systemPrompt   = document.getElementById('system-prompt-input');
  const saveBtn        = document.getElementById('save-btn');
  const toggleBtn      = document.getElementById('toggle-visibility');
  const eyeIcon        = document.getElementById('eye-icon');
  const statusBanner   = document.getElementById('status-banner');
  const exampleChips   = document.querySelectorAll('.example-chip');

  // ── Load saved settings ──────────────────────────────────
  chrome.storage.local.get(['claudeApiKey', 'systemPrompt'], (result) => {
    if (result.claudeApiKey)  apiKeyInput.value  = result.claudeApiKey;
    if (result.systemPrompt)  systemPrompt.value = result.systemPrompt;
  });

  // ── Show / Hide API Key ──────────────────────────────────
  toggleBtn.addEventListener('click', () => {
    const isHidden = apiKeyInput.type === 'password';
    apiKeyInput.type = isHidden ? 'text' : 'password';
    eyeIcon.innerHTML = isHidden
      // Eye-off icon
      ? `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>`
      // Eye icon
      : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
  });

  // ── Example Prompt Chips ─────────────────────────────────
  exampleChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      systemPrompt.value = chip.dataset.prompt;
      systemPrompt.focus();
    });
  });

  // ── Save ─────────────────────────────────────────────────
  saveBtn.addEventListener('click', () => {
    const keyValue    = apiKeyInput.value.trim();
    const promptValue = systemPrompt.value.trim();

    if (!keyValue) {
      showBanner('error', '⚠️ Please enter your Claude API key before saving.');
      apiKeyInput.focus();
      return;
    }

    if (!keyValue.startsWith('sk-ant-')) {
      showBanner('error', '⚠️ That doesn\'t look like a valid Claude API key. It should start with "sk-ant-".');
      apiKeyInput.focus();
      return;
    }

    chrome.storage.local.set(
      { claudeApiKey: keyValue, systemPrompt: promptValue },
      () => {
        showBanner('success', '✓ Settings saved successfully! You can now highlight text on any webpage.');
      }
    );
  });

  // ── Status Banner helper ─────────────────────────────────
  function showBanner(type, message) {
    statusBanner.textContent = message;
    statusBanner.className   = `status-banner ${type}`;
    statusBanner.style.display = 'block';
    clearTimeout(statusBanner._timer);
    statusBanner._timer = setTimeout(() => {
      statusBanner.style.display = 'none';
    }, 5000);
  }
});
