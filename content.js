// ============================================================
// ChatAssist-AI — content.js
// Detects text selection on any webpage, shows a floating AI
// button near the cursor, then calls Claude API with tri-layer
// context (DOM surrounding text, platform info, manual input).
// ============================================================

(function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────
  const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
  const CLAUDE_API_VERSION = '2023-06-01';
  const AI_MODEL = 'claude-haiku-4-5';
  const FAB_ID = 'chatassist-fab';
  const BACKDROP_ID = 'chatassist-backdrop';

  // Max chars to extract from surrounding DOM (Layer A)
  const MAX_SURROUNDING_CHARS = 3000;


  // SVG icons
  const SPARKLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2l2.09 6.26L20.18 10l-6.09 3.74-2.09 6.26-2.09-6.26L3.82 10l6.09-1.74L12 2z"/></svg>`;
  const COPY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
  const SEND_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;

  // ── State ───────────────────────────────────────────────────
  let fab = null;
  let backdrop = null;
  let fabTimeout = null;
  let lastMousePos = { x: 0, y: 0 };
  let isModalOpen = false;
  let savedSelection = null; // Store selection before modal opens

  // ── Track mouse position ────────────────────────────────────
  document.addEventListener('mousemove', (e) => {
    lastMousePos = { x: e.pageX, y: e.pageY };
  });

  // ── Create Floating Action Button ──────────────────────────
  function createFAB() {
    if (document.getElementById(FAB_ID)) return;

    fab = document.createElement('button');
    fab.id = FAB_ID;
    fab.title = 'ChatAssist-AI: Ask AI about this text';
    fab.innerHTML = SPARKLE_SVG;
    fab.style.display = 'none';

    fab.addEventListener('click', onFABClick);
    document.body.appendChild(fab);
  }

  // ── Show FAB near cursor ────────────────────────────────────
  function showFAB(x, y) {
    if (!fab) createFAB();

    const offset = 14;
    const fabSize = 38;

    let posX = x + offset;
    let posY = y - fabSize - offset;

    // Clamp within viewport
    posX = Math.min(posX, window.scrollX + window.innerWidth - fabSize - 10);
    posY = Math.max(posY, window.scrollY + 10);

    fab.style.left = posX + 'px';
    fab.style.top = posY + 'px';
    fab.style.display = 'flex';
  }

  // ── Hide FAB ────────────────────────────────────────────────
  function hideFAB() {
    if (fab) fab.style.display = 'none';
  }

  // ── Listen for text selection ───────────────────────────────
  document.addEventListener('mouseup', (e) => {
    if (isModalOpen) return;
    clearTimeout(fabTimeout);
    fabTimeout = setTimeout(() => {
      const sel = window.getSelection();
      const text = sel ? sel.toString().trim() : '';

      if (text.length > 0) {
        showFAB(lastMousePos.x, lastMousePos.y);
      } else {
        hideFAB();
      }
    }, 80);
  });

  // Hide FAB when user starts a new selection (mousedown outside FAB)
  document.addEventListener('mousedown', (e) => {
    if (fab && !fab.contains(e.target)) {
      hideFAB();
    }
  });

  // ── FAB Click Handler ───────────────────────────────────────
  async function onFABClick() {
    const sel = window.getSelection();
    const text = sel ? sel.toString().trim() : '';

    if (!text) return;

    // Capture DOM context BEFORE modal opens (selection may be cleared on click)
    const surroundingText = getSurroundingText(sel);
    const platformCtx = getPlatformContext();

    hideFAB();
    openModal(text, surroundingText, platformCtx);
  }

  // ── Layer A: Extract Surrounding DOM Text (multi-strategy) ──────────────
  //
  // Strategy overview:
  //   1. Walk ALL the way up the DOM (no level cap, no tag restriction).
  //      Collect every ancestor's innerText length as we go.
  //      Pick the "sweet spot" ancestor: the deepest one whose text is at
  //      least MIN_CONTEXT_CHARS long but no more than MAX_PAGE_CHARS
  //      (to avoid grabbing the full page / nav / sidebars).
  //   2. If no single ancestor is rich enough, aggregate sibling text at
  //      each level as we walk up, until we have enough characters.
  //   3. Last resort: pull from document.body directly.
  //
  // Works across deeply-nested, dynamic-rendered DOMs:
  //   WhatsApp Web, LinkedIn, Upwork, Facebook, Slack, Telegram Web, etc.
  //
  const MIN_CONTEXT_CHARS = 120;   // ancestor must have at least this much text
  const MAX_PAGE_CHARS = 40000; // anything larger is likely the full page

  function getSurroundingText(selection) {
    try {
      if (!selection || selection.rangeCount === 0) return '';

      const range = selection.getRangeAt(0);
      const selectedText = selection.toString().trim();
      let anchorNode = range.commonAncestorContainer;

      // Normalise to element
      if (anchorNode.nodeType === Node.TEXT_NODE) anchorNode = anchorNode.parentElement;
      if (!anchorNode) return '';

      // ── Strategy 1: Walk up all levels, find sweet-spot ancestor ─────────
      let sweetSpotEl = null;
      let current = anchorNode;

      while (current && current !== document.documentElement) {
        const txt = (current.innerText || '').trim();

        // A good ancestor: enough text to be a conversation container,
        // but not so much that it spans the whole page.
        if (txt.length >= MIN_CONTEXT_CHARS && txt.length <= MAX_PAGE_CHARS) {
          sweetSpotEl = current; // keep climbing — we want the LARGEST qualifying ancestor
        }

        // Once we pass the whole-page threshold, the previous one was best
        if (txt.length > MAX_PAGE_CHARS && sweetSpotEl) break;

        current = current.parentElement;
      }

      if (sweetSpotEl) {
        return trimAroundSelection(
          (sweetSpotEl.innerText || '').trim(),
          selectedText
        );
      }

      // ── Strategy 2: Aggregate sibling text at each DOM level ─────────────
      // Walk up from anchor and at each level grab all text of sibling
      // elements, building a combined string until we hit the char limit.
      let aggregated = '';
      let crawler = anchorNode;

      while (crawler && crawler !== document.body) {
        const parent = crawler.parentElement;
        if (!parent) break;

        const siblings = Array.from(parent.children);
        for (const sib of siblings) {
          const sibText = (sib.innerText || '').trim();
          if (sibText && sibText !== aggregated) {
            aggregated += (aggregated ? '\n' : '') + sibText;
          }
          if (aggregated.length >= MAX_SURROUNDING_CHARS * 2) break;
        }

        if (aggregated.length >= MIN_CONTEXT_CHARS) {
          return trimAroundSelection(aggregated, selectedText);
        }
        crawler = parent;
      }

      // ── Strategy 3: Fall back to body text ───────────────────────────────
      const bodyText = (document.body.innerText || '').trim();
      if (bodyText && bodyText !== selectedText) {
        return trimAroundSelection(bodyText, selectedText);
      }

      return '';

    } catch (_) {
      return '';
    }
  }

  // Trim extracted text to MAX_SURROUNDING_CHARS, centered around selectedText
  function trimAroundSelection(fullText, selectedText) {
    if (!fullText || fullText === selectedText) return '';

    const selIdx = fullText.indexOf(selectedText);

    // If we can't locate the exact selection, return from the start
    if (selIdx === -1) {
      const snippet = fullText.slice(0, MAX_SURROUNDING_CHARS).trim();
      return snippet + (fullText.length > MAX_SURROUNDING_CHARS ? '\n…' : '');
    }

    // Center the window around the selection
    const halfBefore = Math.floor(MAX_SURROUNDING_CHARS * 0.55); // slightly more before
    const halfAfter = MAX_SURROUNDING_CHARS - halfBefore;
    const start = Math.max(0, selIdx - halfBefore);
    const end = Math.min(fullText.length, selIdx + selectedText.length + halfAfter);

    let snippet = fullText.slice(start, end).trim();
    if (start > 0) snippet = '…\n' + snippet;
    if (end < fullText.length) snippet = snippet + '\n…';

    return snippet;
  }



  // ── Layer B: Platform / Page Context ───────────────────────
  function getPlatformContext() {
    return {
      title: document.title || '',
      host: window.location.hostname || '',
    };
  }

  // ── Modal ───────────────────────────────────────────────────
  function openModal(selectedText, surroundingText, platformCtx) {
    if (document.getElementById(BACKDROP_ID)) return;
    isModalOpen = true;

    // ── Backdrop
    backdrop = document.createElement('div');
    backdrop.id = BACKDROP_ID;

    // ── Modal box
    const modal = document.createElement('div');
    modal.id = 'chatassist-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'ChatAssist-AI Response');

    // ── Header
    const header = document.createElement('div');
    header.id = 'chatassist-modal-header';

    const logo = document.createElement('div');
    logo.id = 'chatassist-modal-logo';
    logo.innerHTML = SPARKLE_SVG;

    const titleEl = document.createElement('span');
    titleEl.id = 'chatassist-modal-title';
    titleEl.textContent = 'ChatAssist-AI';

    // Platform pill (Layer B)
    const platformPill = document.createElement('span');
    platformPill.id = 'chatassist-platform-pill';
    platformPill.textContent = platformCtx.host || 'unknown';

    const closeBtn = document.createElement('button');
    closeBtn.id = 'chatassist-close-btn';
    closeBtn.title = 'Close';
    closeBtn.innerHTML = '✕';
    closeBtn.addEventListener('click', closeModal);

    header.append(logo, titleEl, platformPill, closeBtn);

    // ── Selected text preview
    const preview = document.createElement('span');
    preview.id = 'chatassist-selected-preview';
    preview.textContent = `"${selectedText}"`;
    preview.title = selectedText;

    // ── Surrounding context indicator (Layer A) — collapsible
    let surroundingIndicator = null;
    if (surroundingText) {
      surroundingIndicator = document.createElement('div');
      surroundingIndicator.id = 'chatassist-context-indicator';

      // Header row (clickable toggle)
      const indicatorHeader = document.createElement('button');
      indicatorHeader.id = 'chatassist-context-toggle';

      const dot = document.createElement('span');
      dot.id = 'chatassist-context-dot';
      dot.textContent = '●';

      const label = document.createElement('span');
      label.id = 'chatassist-context-toggle-label';
      label.textContent = `Surrounding context captured (${surroundingText.length} chars)`;

      const chevron = document.createElement('span');
      chevron.id = 'chatassist-context-chevron';
      chevron.textContent = '▸ Show';

      indicatorHeader.append(dot, label, chevron);

      // Content panel (hidden by default)
      const contextPanel = document.createElement('pre');
      contextPanel.id = 'chatassist-context-panel';
      contextPanel.textContent = surroundingText;

      // Toggle logic
      let isExpanded = false;
      indicatorHeader.addEventListener('click', () => {
        isExpanded = !isExpanded;
        contextPanel.style.display = isExpanded ? 'block' : 'none';
        chevron.textContent = isExpanded ? '▾ Hide' : '▸ Show';
        indicatorHeader.setAttribute('aria-expanded', String(isExpanded));
      });

      surroundingIndicator.append(indicatorHeader, contextPanel);
    }


    // ── Manual context input (Layer C)
    const manualSection = document.createElement('div');
    manualSection.id = 'chatassist-manual-section';

    const manualLabel = document.createElement('label');
    manualLabel.id = 'chatassist-context-label';
    manualLabel.htmlFor = 'chatassist-context-input';
    manualLabel.textContent = 'Additional context (optional)';

    const manualInput = document.createElement('textarea');
    manualInput.id = 'chatassist-context-input';
    manualInput.placeholder =
      'e.g. "This is a follow-up after 3 revisions from the client" or "My boss wants a status update on the project deadline"…';
    manualInput.rows = 3;

    manualSection.append(manualLabel, manualInput);

    // ── Body (for AI response)
    const body = document.createElement('div');
    body.id = 'chatassist-modal-body';

    // ── Footer
    const footer = document.createElement('div');
    footer.id = 'chatassist-modal-footer';

    const generateBtn = document.createElement('button');
    generateBtn.id = 'chatassist-generate-btn';
    generateBtn.innerHTML = SEND_SVG + ' Generate Response';

    const copyBtn = document.createElement('button');
    copyBtn.id = 'chatassist-copy-btn';
    copyBtn.innerHTML = COPY_SVG + ' Copy';
    copyBtn.style.display = 'none';
    copyBtn.addEventListener('click', () => {
      const responseEl = document.getElementById('chatassist-response-text');
      if (responseEl) {
        navigator.clipboard.writeText(responseEl.textContent).then(() => {
          copyBtn.innerHTML = '✓ Copied!';
          setTimeout(() => { copyBtn.innerHTML = COPY_SVG + ' Copy'; }, 2000);
        });
      }
    });

    const dismissBtn = document.createElement('button');
    dismissBtn.id = 'chatassist-dismiss-btn';
    dismissBtn.textContent = 'Close';
    dismissBtn.addEventListener('click', closeModal);

    footer.append(generateBtn, copyBtn, dismissBtn);

    // ── Assemble modal
    const parts = [header, preview];
    if (surroundingIndicator) parts.push(surroundingIndicator);
    parts.push(manualSection, body, footer);
    modal.append(...parts);

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    // Focus the manual textarea for quick typing
    setTimeout(() => manualInput.focus(), 80);

    // Generate on button click
    generateBtn.addEventListener('click', () => {
      const manualContext = manualInput.value.trim();
      generateBtn.disabled = true;
      generateBtn.style.opacity = '0.6';
      generateBtn.innerHTML = '⏳ Generating…';
      callClaude(selectedText, surroundingText, platformCtx, manualContext, body, copyBtn);
    });

    // Also allow Ctrl+Enter / Cmd+Enter to generate from textarea
    manualInput.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        generateBtn.click();
      }
    });

    // Close on backdrop click
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeModal();
    });

    // Close on Escape key
    document.addEventListener('keydown', onEscapeKey);
  }

  // ── Close Modal ─────────────────────────────────────────────
  function closeModal() {
    const el = document.getElementById(BACKDROP_ID);
    if (el) el.remove();
    backdrop = null;
    isModalOpen = false;
    document.removeEventListener('keydown', onEscapeKey);
  }

  function onEscapeKey(e) {
    if (e.key === 'Escape') closeModal();
  }

  // ── Claude API Call (with tri-layer context) ────────────────
  async function callClaude(selectedText, surroundingText, platformCtx, manualContext, bodyEl, copyBtn) {
    const DEFAULT_SYSTEM_PROMPT =
      'You are a helpful AI assistant. Analyze the provided text and give a clear, concise, and useful response.';

    // Load settings from storage
    const { claudeApiKey, systemPrompt } = await new Promise((resolve) => {
      chrome.storage.local.get(['claudeApiKey', 'systemPrompt'], resolve);
    });

    if (!claudeApiKey || claudeApiKey.trim() === '') {
      showError(
        bodyEl,
        '⚠️ No API key found.\n\nPlease open the ChatAssist-AI Options page (click the extension icon → Open Settings) and enter your Claude API key.'
      );
      return;
    }

    const finalSystemPrompt = (systemPrompt && systemPrompt.trim())
      ? systemPrompt.trim()
      : DEFAULT_SYSTEM_PROMPT;

    // ── Build tri-layer user message ──────────────────────────
    const parts = [];

    // Layer B — Platform context
    if (platformCtx.host || platformCtx.title) {
      parts.push(
        `[Platform: ${platformCtx.host || 'unknown'} | Page: "${platformCtx.title || 'unknown'}"]`
      );
    }

    // Layer A — DOM surrounding context
    if (surroundingText) {
      parts.push(`\n[Conversation Context — surrounding text from the page]:\n${surroundingText}`);
    }

    // Highlighted text (always present)
    parts.push(`\n[Highlighted Text — the specific text I selected]:\n"${selectedText}"`);

    // Layer C — Manual context
    if (manualContext) {
      parts.push(`\n[Additional Context I'm providing]:\n${manualContext}`);
    }

    const userMessage = parts.join('\n');

    try {
      const response = await fetch(CLAUDE_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': claudeApiKey.trim(),
          'anthropic-version': CLAUDE_API_VERSION,
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: AI_MODEL,
          max_tokens: 1024,
          system: finalSystemPrompt,
          messages: [
            { role: 'user', content: userMessage },
          ],
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const errMsg = data?.error?.message || `API Error (${response.status})`;
        showError(bodyEl, `❌ Claude Error:\n${errMsg}`);
        return;
      }

      const aiText = data.content?.[0]?.text || '(No response)';
      showResponse(bodyEl, aiText, copyBtn);

    } catch (err) {
      showError(
        bodyEl,
        `❌ Network Error:\n${err.message}\n\nPlease check your internet connection.`
      );
    }
  }

  // ── Render AI Response ──────────────────────────────────────
  function showResponse(bodyEl, text, copyBtn) {
    bodyEl.innerHTML = '';

    const responseEl = document.createElement('span');
    responseEl.id = 'chatassist-response-text';
    responseEl.textContent = text;

    bodyEl.appendChild(responseEl);
    copyBtn.style.display = 'flex';
  }

  // ── Render Error ────────────────────────────────────────────
  function showError(bodyEl, message) {
    bodyEl.innerHTML = '';

    const errorEl = document.createElement('span');
    errorEl.id = 'chatassist-error-text';
    errorEl.textContent = message;

    bodyEl.appendChild(errorEl);
  }

  // ── Init ────────────────────────────────────────────────────
  createFAB();

})();
