// ============================================================
// ChatAssist-AI — content.js
// Detects text selection on any webpage, shows a floating AI
// button near the cursor, then calls Claude API with quad-layer
// context: DOM surrounding text, platform info, manual input,
// and an optional persistent PDF document attachment.
// ============================================================

(function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────
  const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
  const CLAUDE_API_VERSION = '2023-06-01';
  const DEFAULT_MODEL = 'claude-haiku-4-5';
  const FAB_ID = 'chatassist-fab';
  const BACKDROP_ID = 'chatassist-backdrop';

  // Max chars to extract from surrounding DOM (Layer A)
  const MAX_SURROUNDING_CHARS = 3000;


  // SVG icons
  const SPARKLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2l2.09 6.26L20.18 10l-6.09 3.74-2.09 6.26-2.09-6.26L3.82 10l6.09-1.74L12 2z"/></svg>`;
  const COPY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
  const SEND_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;

  // ── PDF.js v5 — lazy-loaded on demand via dynamic import() ─────────────
  // PDF.js is only loaded when the user first clicks "Attach PDF".
  // This avoids any startup overhead on every page.
  const PDFJS_URL = chrome.runtime.getURL('lib/pdf.mjs');
  const PDFJS_WORKER_URL = chrome.runtime.getURL('lib/pdf.worker.mjs');
  let _pdfjsLib = null; // cached after first load

  async function getPDFJS() {
    if (_pdfjsLib) return _pdfjsLib;
    // Dynamic import works in MV3 content scripts for web-accessible resources
    const pdfjs = await import(PDFJS_URL);
    pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
    _pdfjsLib = pdfjs;
    return _pdfjsLib;
  }

  // ── sessionStorage keys for PDF persistence ─────────────────
  const PDF_TEXT_KEY = 'chatassist_pdf_text';
  const PDF_NAME_KEY = 'chatassist_pdf_name';

  // ── PDF helpers ─────────────────────────────────────────────

  // Extract ALL text from a PDF File object using PDF.js v5
  async function extractPDFText(file) {
    const pdfjsLib = await getPDFJS();
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pageTexts = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageStr = content.items.map((item) => item.str).join(' ');
      pageTexts.push(pageStr);
    }

    return pageTexts.join('\n\n').trim();
  }

  // Read PDF context from sessionStorage
  function getPDFContext() {
    const text = sessionStorage.getItem(PDF_TEXT_KEY);
    const name = sessionStorage.getItem(PDF_NAME_KEY);
    return (text && name) ? { text, name } : null;
  }

  // Save PDF context to sessionStorage
  function savePDF(name, text) {
    sessionStorage.setItem(PDF_NAME_KEY, name);
    sessionStorage.setItem(PDF_TEXT_KEY, text);
  }

  // Clear PDF context
  function clearPDF() {
    sessionStorage.removeItem(PDF_TEXT_KEY);
    sessionStorage.removeItem(PDF_NAME_KEY);
    updateFABBadge();
  }

  // Show/hide a small badge on the FAB indicating a PDF is attached
  function updateFABBadge() {
    if (!fab) return;
    const existing = document.getElementById('chatassist-fab-badge');
    const hasPDF = !!getPDFContext();

    if (hasPDF && !existing) {
      const badge = document.createElement('span');
      badge.id = 'chatassist-fab-badge';
      badge.textContent = '📄';
      badge.title = 'PDF attached — click ✦ to use it';
      fab.appendChild(badge);
    } else if (!hasPDF && existing) {
      existing.remove();
    }
  }

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
    // Restore badge if PDF already attached from a previous selection
    updateFABBadge();
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

  // ── Layer A: Extract Surrounding DOM Text ───────────────────────────────
  //
  // Problem solved: naive "largest ancestor" approach captured sidebar +
  // chat panel together on WhatsApp/LinkedIn because it climbed too high.
  //
  // New strategy — THREE-PASS proximity-first approach:
  //
  //   Pass 1 (IDEAL):   Find the smallest ancestor with 200–12k chars that
  //                     passes BOTH filters below. Return immediately.
  //   Pass 2 (FALLBACK):Find smallest ancestor with 200–40k chars passing
  //                     geometry filter (density relaxed).
  //   Pass 3 (LAST):    Aggregate sibling text walking upward.
  //   Pass 4 (BODY):    Trim body.innerText as last resort.
  //
  // FILTER 1 — Geometry: reject elements whose width ≥ 90% of the viewport.
  //   These are layout shells (app containers) that include sidebars.
  //
  // FILTER 2 — Density: selected text must be ≥ 2% of ancestor text.
  //   If the selection is a tiny fraction of the container, the container
  //   is too broad — it likely includes unrelated sidebar content.
  //   LinkedIn's <main> is ~70% viewport width so it passes geometry, but
  //   its text is diluted by the conversation-list sidebar → density rejects it.
  //
  const MIN_CONTEXT_CHARS = 200;    // minimum chars for useful context
  const IDEAL_MAX_CHARS = 12000;  // ideal ceiling — stays inside chat panel
  const MAX_PAGE_CHARS = 40000;  // hard ceiling before it's the full page
  const MIN_DENSITY = 0.02;   // selected text must be ≥ 2% of ancestor

  // Returns true if the element width spans nearly the full viewport
  function isLayoutShell(el) {
    try {
      const rect = el.getBoundingClientRect();
      return rect.width >= window.innerWidth * 0.9;
    } catch (_) {
      return false;
    }
  }

  // ── Priority container selectors per platform ──────────────
  // These target the actual chat/thread panel directly, bypassing the
  // generic DOM walk-up which can climb too high and include sidebars.
  //
  // Each entry:
  //   selectors  — tried in order; first one that contains anchorNode wins.
  //   exclude    — child selectors to strip BEFORE reading innerText.
  //                Used to remove noisy header/participant areas.
  const PLATFORM_CONTAINERS = [
    {
      // LinkedIn Messaging — thread detail panel (right side, chat messages only)
      hostContains: 'linkedin.com',
      selectors: [
        '.scaffold-layout__detail',   // thread detail column
        '.msg__detail',               // messaging detail
        '.msg-s-message-list-container', // message list itself
        '.msg-convo-wrapper',         // conversation wrapper
      ],
      exclude: [],
    },
    {
      // WhatsApp Web — main conversation panel
      // The header area contains the group name + ALL member phone numbers
      // as a comma-separated subtitle — strip it to save context tokens.
      hostContains: 'web.whatsapp.com',
      selectors: [
        '#main',                      // main chat panel
        '[data-testid="conversation-panel-wrapper"]',
        '[data-testid="conversation-panel-messages"]',
      ],
      exclude: [
        // Conversation header (group name + participant list subtitle)
        '[data-testid="conversation-header"]',
        'header[data-testid]',
        // Generic WAWeb header class
        '#main header',
        // Footer (message input box — not conversation history)
        '[data-testid="conversation-compose-box-input"]',
        'footer',
      ],
    },
  ];

  // ── Extract innerText from an element, excluding noisy children ─
  // Clones the element so the live DOM is never mutated.
  function getCleanText(el, excludeSelectors = []) {
    if (!excludeSelectors || excludeSelectors.length === 0) {
      return (el.innerText || '').trim();
    }
    try {
      const clone = el.cloneNode(true);
      for (const sel of excludeSelectors) {
        clone.querySelectorAll(sel).forEach((node) => node.remove());
      }
      // Temporarily mount clone off-screen so innerText works correctly
      clone.style.position = 'absolute';
      clone.style.visibility = 'hidden';
      clone.style.pointerEvents = 'none';
      document.body.appendChild(clone);
      const text = (clone.innerText || '').trim();
      clone.remove();
      return text;
    } catch (_) {
      return (el.innerText || '').trim();
    }
  }

  // Try to find the best platform-specific container that contains anchorNode.
  // Returns { el, excludeSelectors } so callers can strip noisy child elements
  // (e.g. WhatsApp group header / participant phone numbers) via getCleanText().
  function getPlatformContainer(anchorNode) {
    const host = window.location.hostname || '';
    for (const platform of PLATFORM_CONTAINERS) {
      if (!host.includes(platform.hostContains)) continue;
      for (const sel of platform.selectors) {
        // Walk up from anchorNode first
        let el = anchorNode.closest ? anchorNode.closest(sel) : null;
        // Fall back to document-level query
        if (!el) el = document.querySelector(sel);
        if (el && el.contains(anchorNode)) {
          return { el, excludeSelectors: platform.exclude || [] };
        }
      }
    }
    return { el: null, excludeSelectors: [] };
  }

  function getSurroundingText(selection) {
    try {
      if (!selection || selection.rangeCount === 0) return '';

      const range = selection.getRangeAt(0);
      const selectedText = selection.toString().trim();
      let anchorNode = range.commonAncestorContainer;

      if (anchorNode.nodeType === Node.TEXT_NODE) anchorNode = anchorNode.parentElement;
      if (!anchorNode) return '';

      const selLen = selectedText.length;

      // ── Priority Pass: Platform-specific container ────────────
      // Run before the generic walk-up to avoid climbing into sidebar parents.
      // Uses getCleanText() to strip platform-specific noisy regions
      // (e.g. WhatsApp group header with member phone numbers) before
      // passing the text to Claude.
      const { el: platformEl, excludeSelectors: platformExclude } =
        getPlatformContainer(anchorNode);
      if (platformEl) {
        const txt = getCleanText(platformEl, platformExclude);
        if (txt.length >= MIN_CONTEXT_CHARS) {
          return trimAroundSelection(txt, selectedText);
        }
      }

      // ── Pass 1 & 2: Walk up, apply filters ───────────────────
      let fallbackEl = null; // best candidate if ideal not found
      let current = anchorNode;

      while (current && current !== document.documentElement) {
        const txt = (current.innerText || '').trim();
        const len = txt.length;

        // Hard stop — we've hit the full page
        if (len > MAX_PAGE_CHARS) break;

        if (len >= MIN_CONTEXT_CHARS) {
          const passGeometry = !isLayoutShell(current);
          const density = selLen / len;
          const passDensity = density >= MIN_DENSITY;

          // Pass 1 (IDEAL): small container, both filters pass → accept now
          if (len <= IDEAL_MAX_CHARS && passGeometry && passDensity) {
            return trimAroundSelection(txt, selectedText);
          }

          // Pass 2 candidate: larger container, at least geometry passes
          if (passGeometry && !fallbackEl) {
            fallbackEl = current;
          }
        }

        current = current.parentElement;
      }

      // Use best fallback from Pass 2
      if (fallbackEl) {
        return trimAroundSelection(
          (fallbackEl.innerText || '').trim(),
          selectedText
        );
      }

      // ── Pass 3: Aggregate sibling text at multiple levels ─────
      let aggregated = '';
      let crawler = anchorNode;

      while (crawler && crawler !== document.body) {
        const parent = crawler.parentElement;
        if (!parent) break;

        for (const sib of Array.from(parent.children)) {
          const sibText = (sib.innerText || '').trim();
          if (sibText && !aggregated.includes(sibText)) {
            aggregated += (aggregated ? '\n' : '') + sibText;
          }
          if (aggregated.length >= MAX_SURROUNDING_CHARS * 2) break;
        }

        if (aggregated.length >= MIN_CONTEXT_CHARS) {
          return trimAroundSelection(aggregated, selectedText);
        }
        crawler = parent;
      }

      // ── Pass 4: Last resort — body ────────────────────────────
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

    // ── PDF attachment section (Layer D) ─────────────────────
    const pdfContext = getPDFContext();

    const pdfSection = document.createElement('div');
    pdfSection.id = 'chatassist-pdf-section';

    // Hidden file input
    const pdfFileInput = document.createElement('input');
    pdfFileInput.type = 'file';
    pdfFileInput.accept = '.pdf,application/pdf';
    pdfFileInput.id = 'chatassist-pdf-file-input';
    pdfFileInput.style.display = 'none';

    // Header row
    const pdfHeader = document.createElement('div');
    pdfHeader.id = 'chatassist-pdf-header';

    const pdfIcon = document.createElement('span');
    pdfIcon.id = 'chatassist-pdf-icon';
    pdfIcon.textContent = '📄';

    const pdfLabel = document.createElement('span');
    pdfLabel.id = 'chatassist-pdf-label';

    const pdfActions = document.createElement('div');
    pdfActions.id = 'chatassist-pdf-actions';

    const pdfAttachBtn = document.createElement('button');
    pdfAttachBtn.id = 'chatassist-pdf-attach-btn';
    pdfAttachBtn.textContent = 'Attach PDF';
    pdfAttachBtn.type = 'button';

    const pdfRemoveBtn = document.createElement('button');
    pdfRemoveBtn.id = 'chatassist-pdf-remove-btn';
    pdfRemoveBtn.textContent = '× Remove';
    pdfRemoveBtn.type = 'button';
    pdfRemoveBtn.style.display = 'none';

    pdfActions.append(pdfAttachBtn, pdfRemoveBtn);
    pdfHeader.append(pdfIcon, pdfLabel, pdfActions);

    // Loading indicator
    const pdfLoadingEl = document.createElement('span');
    pdfLoadingEl.id = 'chatassist-pdf-loading';
    pdfLoadingEl.textContent = '⏳ Reading PDF…';
    pdfLoadingEl.style.display = 'none';

    pdfSection.append(pdfFileInput, pdfHeader, pdfLoadingEl);

    // Helper to update PDF UI state
    function refreshPDFUI(ctx) {
      if (ctx) {
        const charCount = ctx.text.length.toLocaleString();
        pdfLabel.textContent = `${ctx.name} (${charCount} chars)`;
        pdfAttachBtn.style.display = 'none';
        pdfRemoveBtn.style.display = 'inline-flex';
      } else {
        pdfLabel.textContent = 'PDF Document';
        pdfAttachBtn.style.display = 'inline-flex';
        pdfRemoveBtn.style.display = 'none';
      }
    }

    // Init with existing sessionStorage state
    refreshPDFUI(pdfContext);

    // Attach button → trigger file picker
    pdfAttachBtn.addEventListener('click', () => pdfFileInput.click());

    // File selected → extract text
    pdfFileInput.addEventListener('change', async () => {
      const file = pdfFileInput.files[0];
      if (!file) return;

      pdfLoadingEl.style.display = 'inline-block';
      pdfAttachBtn.disabled = true;

      try {
        const text = await extractPDFText(file);
        savePDF(file.name, text);
        updateFABBadge();
        refreshPDFUI(getPDFContext());
      } catch (err) {
        pdfLabel.textContent = `⚠️ Error: ${err.message}`;
      } finally {
        pdfLoadingEl.style.display = 'none';
        pdfAttachBtn.disabled = false;
        pdfFileInput.value = ''; // reset so same file can be re-attached
      }
    });

    // Remove button → clear PDF
    pdfRemoveBtn.addEventListener('click', () => {
      clearPDF();
      refreshPDFUI(null);
    });

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
    parts.push(manualSection, pdfSection, body, footer);
    modal.append(...parts);

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    // Focus the manual textarea for quick typing
    setTimeout(() => manualInput.focus(), 80);

    // Generate on button click — pass current PDF context at click time
    generateBtn.addEventListener('click', () => {
      const manualContext = manualInput.value.trim();
      const currentPDF = getPDFContext(); // re-read in case user just attached
      generateBtn.disabled = true;
      generateBtn.style.opacity = '0.6';
      generateBtn.innerHTML = '⏳ Generating…';
      callClaude(selectedText, surroundingText, platformCtx, manualContext, currentPDF, body, copyBtn);
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
  function closeModal(force = false) {
    // If called from an event listener, 'force' will be an Event object
    const isEvent = typeof force === 'object';

    if (isEvent || !force) {
      const responseEl = document.getElementById('chatassist-response-text');
      const generateBtn = document.getElementById('chatassist-generate-btn');

      const isGenerating = generateBtn && generateBtn.disabled && generateBtn.innerHTML.includes('Generating');
      const hasResponse = responseEl && responseEl.textContent.trim().length > 0;

      if (isGenerating || hasResponse) {
        const msg = isGenerating
          ? "AI sedang membuat jawaban. Yakin ingin menutup?"
          : "Tutup AI? Jawaban yang belum di-copy akan hilang.";
        if (!window.confirm(msg)) {
          return; // Cancel closing
        }
      }
    }

    const el = document.getElementById(BACKDROP_ID);
    if (el) el.remove();
    backdrop = null;
    isModalOpen = false;
    document.removeEventListener('keydown', onEscapeKey);
  }

  function onEscapeKey(e) {
    if (e.key === 'Escape') closeModal();
  }

  // ── AI API Call (with quad-layer context) ─────────────────
  async function callClaude(selectedText, surroundingText, platformCtx, manualContext, pdfCtx, bodyEl, copyBtn) {
    const DEFAULT_SYSTEM_PROMPT =
      'You are a helpful AI assistant. Analyze the provided text and give a clear, concise, and useful response.';

    // Load settings from storage
    const { authMode, licenseKey, claudeApiKey, openaiApiKey, geminiApiKey, systemPrompt, claudeModel } = await new Promise((resolve) => {
      chrome.storage.local.get(['authMode', 'licenseKey', 'claudeApiKey', 'openaiApiKey', 'geminiApiKey', 'systemPrompt', 'claudeModel'], resolve);
    });

    const finalSystemPrompt = (systemPrompt && systemPrompt.trim())
      ? systemPrompt.trim()
      : DEFAULT_SYSTEM_PROMPT;

    const rawModelStr = claudeModel || 'anthropic:claude-haiku-4-5';
    let provider = 'anthropic';
    let finalModel = rawModelStr;

    if (rawModelStr.includes(':')) {
      [provider, finalModel] = rawModelStr.split(':');
    }

    const activeMode = authMode || (claudeApiKey ? 'byok' : 'pro');

    // Validate the needed key
    if (activeMode === 'pro') {
      if (!licenseKey || !licenseKey.trim()) {
        showError(bodyEl, '⚠️ No Pro License Key found. Please check Settings.');
        return;
      }
    } else {
      if (provider === 'anthropic' && (!claudeApiKey || !claudeApiKey.trim())) {
        showError(bodyEl, '⚠️ No Anthropic API key found. Please check Settings.');
        return;
      }
      if (provider === 'openai' && (!openaiApiKey || !openaiApiKey.trim())) {
        showError(bodyEl, '⚠️ No OpenAI API key found. Please check Settings.');
        return;
      }
      if (provider === 'gemini' && (!geminiApiKey || !geminiApiKey.trim())) {
        showError(bodyEl, '⚠️ No Gemini API key found. Please check Settings.');
        return;
      }
    }

    // ── Build quad-layer user message ─────────────────────────
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

    // Layer D — PDF document (full text, no character cap)
    if (pdfCtx && pdfCtx.text) {
      parts.push(`\n[Attached Document — "${pdfCtx.name}"]:\n${pdfCtx.text}`);
    }

    const userMessage = parts.join('\n');

    try {
      let aiText = '';

      if (activeMode === 'pro') {
        // Cloudflare Worker Proxy Backend for ChatAssist Pro (License Key validation + wrapper)
        const response = await fetch('http://localhost:8787/v1/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${licenseKey.trim()}`
          },
          body: JSON.stringify({
            provider: provider,
            model: finalModel,
            system: finalSystemPrompt,
            message: userMessage
          })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || `ChatAssist Pro API Error (${response.status})`);
        aiText = data.text || '(No response)';

      } else {
        // BYOK Mode: Direct to Provider APIs
        if (provider === 'anthropic') {
          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': claudeApiKey.trim(),
              'anthropic-version': '2023-06-01',
              'anthropic-dangerous-direct-browser-access': 'true',
            },
            body: JSON.stringify({
              model: finalModel,
              max_tokens: 2048,
              system: finalSystemPrompt,
              messages: [{ role: 'user', content: userMessage }],
            }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data?.error?.message || `Anthropic API Error (${response.status})`);
          aiText = data.content?.[0]?.text || '(No response)';

        } else if (provider === 'openai') {
          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${openaiApiKey.trim()}`,
            },
            body: JSON.stringify({
              model: finalModel,
              max_tokens: 2048,
              messages: [
                { role: 'system', content: finalSystemPrompt },
                { role: 'user', content: userMessage }
              ],
            }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data?.error?.message || `OpenAI API Error (${response.status})`);
          aiText = data.choices?.[0]?.message?.content || '(No response)';

        } else if (provider === 'gemini') {
          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${finalModel}:generateContent?key=${geminiApiKey.trim()}`;
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              system_instruction: {
                parts: [{ text: finalSystemPrompt }]
              },
              contents: [{
                role: 'user',
                parts: [{ text: userMessage }]
              }],
              generationConfig: {
                maxOutputTokens: 2048
              }
            }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data?.error?.message || `Gemini API Error (${response.status})`);
          aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || '(No response)';
        }
      }

      showResponse(bodyEl, aiText, copyBtn);

    } catch (err) {
      showError(
        bodyEl,
        `❌ API Error:\n${err.message}\n\nPlease check your key & internet connection.`
      );
    }
  }

  // ── Lightweight Markdown → HTML renderer ────────────────────
  function renderMarkdown(text) {
    // Escape HTML entities first
    const esc = (s) =>
      s.replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const lines = text.split('\n');
    const html = [];
    let inUl = false, inOl = false, inPre = false, preLines = [];

    const flushList = () => {
      if (inUl) { html.push('</ul>'); inUl = false; }
      if (inOl) { html.push('</ol>'); inOl = false; }
    };

    const flushPre = () => {
      if (inPre) {
        html.push('<pre>' + preLines.map(esc).join('\n') + '</pre>');
        preLines = [];
        inPre = false;
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const line = raw.trimEnd();

      // Fenced code block
      if (/^```/.test(line)) {
        if (inPre) { flushPre(); } else { flushList(); inPre = true; }
        continue;
      }
      if (inPre) { preLines.push(raw); continue; }

      // Headings
      if (/^### /.test(line)) { flushList(); html.push('<h3>' + inlineMarkdown(esc(line.slice(4))) + '</h3>'); continue; }
      if (/^## /.test(line)) { flushList(); html.push('<h2>' + inlineMarkdown(esc(line.slice(3))) + '</h2>'); continue; }
      if (/^# /.test(line)) { flushList(); html.push('<h1>' + inlineMarkdown(esc(line.slice(2))) + '</h1>'); continue; }

      // Horizontal rule
      if (/^[-*_]{3,}$/.test(line.trim())) { flushList(); html.push('<hr>'); continue; }

      // Unordered list
      if (/^[-*+] /.test(line)) {
        if (inOl) { html.push('</ol>'); inOl = false; }
        if (!inUl) { html.push('<ul>'); inUl = true; }
        html.push('<li>' + inlineMarkdown(esc(line.replace(/^[-*+] /, ''))) + '</li>');
        continue;
      }

      // Ordered list
      if (/^\d+\. /.test(line)) {
        if (inUl) { html.push('</ul>'); inUl = false; }
        if (!inOl) { html.push('<ol>'); inOl = true; }
        html.push('<li>' + inlineMarkdown(esc(line.replace(/^\d+\. /, ''))) + '</li>');
        continue;
      }

      // Blockquote
      if (/^> /.test(line)) {
        flushList();
        html.push('<blockquote>' + inlineMarkdown(esc(line.slice(2))) + '</blockquote>');
        continue;
      }

      // Blank line → close lists / paragraph break
      if (line.trim() === '') {
        flushList();
        // Rely on CSS margins for grouping, don't inject <br>
        continue;
      }

      // Regular paragraph line
      flushList();
      html.push('<p>' + inlineMarkdown(esc(line)) + '</p>');
    }

    flushPre();
    flushList();
    return html.join('\n');
  }

  // Inline markdown: bold, italic, inline code
  function inlineMarkdown(s) {
    return s
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/__(.+?)__/g, '<strong>$1</strong>')
      .replace(/_(.+?)_/g, '<em>$1</em>');
  }

  // ── Render AI Response ──────────────────────────────────────
  function showResponse(bodyEl, text, copyBtn) {
    bodyEl.innerHTML = '';

    const responseEl = document.createElement('div');
    responseEl.id = 'chatassist-response-text';
    responseEl.innerHTML = renderMarkdown(text);

    bodyEl.appendChild(responseEl);
    copyBtn.style.display = 'flex';

    // Enter response-mode: collapse inputs, expand modal
    const modal = document.getElementById('chatassist-modal');
    if (modal) {
      modal.classList.add('chatassist-response-mode');

      // Inject "Edit Context" bar if not already present
      if (!document.getElementById('chatassist-edit-bar')) {
        const editBar = document.createElement('div');
        editBar.id = 'chatassist-edit-bar';

        const editBtn = document.createElement('button');
        editBtn.id = 'chatassist-edit-context-btn';
        editBtn.innerHTML = '✏ Edit context &amp; regenerate';
        editBtn.type = 'button';

        editBtn.addEventListener('click', () => {
          modal.classList.remove('chatassist-response-mode');
          editBar.remove();
          bodyEl.innerHTML = '';
          copyBtn.style.display = 'none';
          // Re-enable generate button
          const genBtn = document.getElementById('chatassist-generate-btn');
          if (genBtn) {
            genBtn.disabled = false;
            genBtn.style.opacity = '';
            const SEND_SVG_INLINE = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;
            genBtn.innerHTML = SEND_SVG_INLINE + ' Generate Response';
          }
        });

        editBar.appendChild(editBtn);

        // Insert after header (first child of modal)
        const header = document.getElementById('chatassist-modal-header');
        if (header && header.nextSibling) {
          modal.insertBefore(editBar, header.nextSibling);
        } else {
          modal.appendChild(editBar);
        }
      }
    }
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
