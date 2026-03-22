// ChatAssist-AI — options.js
// Handles saving and loading API key + system prompt using chrome.storage.local.

document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('api-key-input');
  const systemPrompt = document.getElementById('system-prompt-input');
  const saveBtn = document.getElementById('save-btn');
  const toggleBtn = document.getElementById('toggle-visibility');
  const eyeIcon = document.getElementById('eye-icon');
  const statusBanner = document.getElementById('status-banner');
  const exampleChips = document.querySelectorAll('.example-chip');
  const modelSelect = document.getElementById('model-select');

  const authModeRadios = document.querySelectorAll('input[name="authMode"]');
  const proSection = document.getElementById('pro-section');
  const byokSection = document.getElementById('byok-section');
  const licenseKeyInput = document.getElementById('license-key-input');

  const openaiKeyInput = document.getElementById('openai-key-input');
  const geminiKeyInput = document.getElementById('gemini-key-input');

  // ── Load saved settings ──────────────────────────────────
  chrome.storage.local.get(['authMode', 'licenseKey', 'claudeApiKey', 'openaiApiKey', 'geminiApiKey', 'systemPrompt', 'claudeModel'], (result) => {
    const loadedMode = result.authMode || (result.claudeApiKey ? 'byok' : 'pro');
    const radioToSelect = document.querySelector(`input[name="authMode"][value="${loadedMode}"]`);
    if (radioToSelect) radioToSelect.checked = true;
    applyAuthModeUI(loadedMode);

    if (result.licenseKey) licenseKeyInput.value = result.licenseKey;
    if (result.claudeApiKey) apiKeyInput.value = result.claudeApiKey;
    if (result.openaiApiKey) openaiKeyInput.value = result.openaiApiKey;
    if (result.geminiApiKey) geminiKeyInput.value = result.geminiApiKey;
    if (result.systemPrompt) systemPrompt.value = result.systemPrompt;
    if (result.claudeModel) modelSelect.value = result.claudeModel;
  });

  function applyAuthModeUI(mode) {
    if (mode === 'pro') {
      proSection.style.display = 'block';
      byokSection.style.display = 'none';
    } else {
      proSection.style.display = 'none';
      byokSection.style.display = 'block';
    }
  }

  authModeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => applyAuthModeUI(e.target.value));
  });

  // ── Show / Hide API Key ──────────────────────────────────
  toggleBtn.addEventListener('click', () => {
    const isHidden = apiKeyInput.type === 'password';
    apiKeyInput.type = isHidden ? 'text' : 'password';
    openaiKeyInput.type = isHidden ? 'text' : 'password';
    geminiKeyInput.type = isHidden ? 'text' : 'password';
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
    const activeMode = document.querySelector('input[name="authMode"]:checked').value;
    const licenseVal = licenseKeyInput.value.trim();
    const keyValue = apiKeyInput.value.trim();
    const openaiValue = openaiKeyInput.value.trim();
    const geminiValue = geminiKeyInput.value.trim();
    const promptValue = systemPrompt.value.trim();
    const modelValue = modelSelect.value || 'anthropic:claude-haiku-4-5';

    if (activeMode === 'pro') {
      if (!licenseVal) {
        showBanner('error', '⚠️ Pro License Key is required for ChatAssist Pro.');
        licenseKeyInput.focus();
        return;
      }
    } else {
      // Validate BYOK based on the selected model
      if ((modelValue.startsWith('anthropic:') || !modelValue.includes(':')) && !keyValue.startsWith('sk-ant-')) {
        showBanner('error', '⚠️ Claude API key is required and must start with "sk-ant-".');
        apiKeyInput.focus();
        return;
      }
      if (modelValue.startsWith('openai:') && (!openaiValue || !openaiValue.startsWith('sk-'))) {
        showBanner('error', '⚠️ OpenAI API key is required and must start with "sk-".');
        openaiKeyInput.focus();
        return;
      }
      if (modelValue.startsWith('gemini:') && (!geminiValue || !geminiValue.startsWith('AIza'))) {
        showBanner('error', '⚠️ Gemini API key is required and must start with "AIza".');
        geminiKeyInput.focus();
        return;
      }
    }

    chrome.storage.local.set(
      {
        authMode: activeMode,
        licenseKey: licenseVal,
        claudeApiKey: keyValue,
        openaiApiKey: openaiValue,
        geminiApiKey: geminiValue,
        systemPrompt: promptValue,
        claudeModel: modelValue
      },
      () => {
        showBanner('success', '✓ Settings saved successfully! You can now highlight text on any webpage.');
      }
    );
  });

  // ── Status Banner helper ─────────────────────────────────
  function showBanner(type, message) {
    statusBanner.textContent = message;
    statusBanner.className = `status-banner ${type}`;
    statusBanner.style.display = 'block';
    clearTimeout(statusBanner._timer);
    statusBanner._timer = setTimeout(() => {
      statusBanner.style.display = 'none';
    }, 5000);
  }
});
