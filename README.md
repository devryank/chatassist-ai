<div align="center">

<img src="icons/icon128.png" width="80" alt="ChatAssist-AI Logo" />

# ChatAssist-AI

Select any text on the web, get a smart reply from Claude. Built for chats with clients, bosses, and customers. Use your own API key.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-green.svg)](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
[![BYOK](https://img.shields.io/badge/API-Bring%20Your%20Own%20Key-orange.svg)](#-byok-bring-your-own-key)

</div>

---

## ✨ Features

- 🌐 **Universal** — Works on any website: LinkedIn, WhatsApp Web, Slack, Upwork, Telegram, Gmail, and more
- 🤖 **Powered by Claude (Haiku)** — Fast and cost-effective
- 🧠 **Tri-layer context** — Captures surrounding conversation text from the page, platform info, and your own notes before generating
- 🔑 **BYOK** — Your API key lives in your browser only. Nothing goes through a third-party server
- 🎨 **Custom System Prompt** — Set the AI's persona once, use it everywhere
- 📋 **One-click copy** — Copy the response straight to clipboard
- ⚡ **Lightweight** — Vanilla JS, no frameworks, no build step

---

## 📸 How It Works

```
1. Go to any website with a chat or message you need help with
2. Highlight the text with your mouse
3. Click the ✦ button that appears near your cursor
4. (Optional) View the captured surrounding context, add your own notes
5. Click "Generate Response"
6. Copy the reply and paste it wherever you need it
```

---

## 🚀 Installation

> ChatAssist-AI is not on the Chrome Web Store yet. Install it manually as an unpacked extension.

### 1. Download

```bash
git clone https://github.com/devryank/chatassist-ai.git
```

Or download the ZIP and extract it.

### 2. Load into Chrome

1. Go to `chrome://extensions/`
2. Enable **Developer Mode** (toggle, top-right)
3. Click **Load unpacked**
4. Select the `ChatAssist-AI` folder

### 3. Add your API key

1. Click the extension icon → **Open Settings**
2. Enter your Claude API key ([get one here](https://console.anthropic.com/settings/keys))
3. Optionally write a custom system prompt
4. Click **Save Settings**

---

## 🧠 Context Layers

When you click the ✦ button, ChatAssist-AI automatically gathers context before calling Claude:

| Layer | What | How |
|---|---|---|
| **A — Surrounding text** | Nearby messages on the page | Extracted from DOM, collapsible panel lets you verify what was captured |
| **B — Platform** | Which site you're on | Page title + hostname, shown as a pill in the modal header |
| **C — Manual notes** | Anything you want to add | Optional textarea before you hit Generate |

This means Claude understands the full picture, not just the single message you selected.

---

## 🔑 BYOK (Bring Your Own Key)

| | What happens |
|---|---|
| 🔐 **Storage** | Claude API key stored only in `chrome.storage.local` on your machine |
| 🌐 **API calls** | Go directly from your browser to Anthropic's API — no proxy, no middleman |
| 🚫 **No telemetry** | Zero usage data collected |
| 💸 **Billing** | Charged directly to your Anthropic account |

> Claude Haiku is one of the most affordable models available. Most replies cost a fraction of a cent.

---

## 🎭 Example System Prompts

Paste any of these into Settings → Custom System Prompt:

### 🤝 Freelance Client Comms
```
You are a professional freelance communication assistant.
Help me craft clear, confident, and polite replies to freelance clients.
If the client is negotiating or requesting revisions outside scope, suggest a firm but respectful counter.
Reply in the same language as the message (Indonesian or English).
```

### 👔 Workplace (Boss / Manager)
```
You are a professional workplace communication assistant.
Help me write respectful, concise, and solution-focused replies to my manager.
Lead with solutions, not problems. If declining a task, offer an alternative.
Reply in the same language as the message.
```

### 🙋 Customer Service
```
You are a friendly customer service assistant.
Acknowledge the customer's concern first, then offer a concrete solution.
Keep the tone warm, clear, and never dismissive.
Reply in the same language as the customer.
```

### 💼 Negotiation Coach
```
You are an expert negotiator.
Analyze the message and suggest a persuasive but respectful counter-response.
Focus on finding win-win outcomes.
```

### 🌏 Translator (Indonesian ↔ English)
```
You are a professional translator.
Detect the language of the given text.
If English → translate to natural Bahasa Indonesia.
If Bahasa Indonesia → translate to clear, professional English.
```

### 😤 Tone Softener
```
Rewrite the given text to sound calmer and more diplomatic
while keeping the original message and intent intact.
```

---

## 📁 Project Structure

```
ChatAssist-AI/
├── manifest.json      # Manifest V3 config
├── background.js      # Service worker (opens settings on first install)
├── content.js         # Core: selection detection, DOM context, modal, API call
├── content.css        # Scoped styles for FAB and modal
├── options.html       # Settings page
├── options.css        # Settings page styles
├── options.js         # Save/load API key and system prompt
├── popup.html         # Toolbar popup
├── popup.css          # Popup styles
├── popup.js           # Popup logic
├── icons/             # Extension icons (16, 48, 128px)
└── README.md
```

---

## 🛠️ Development

```bash
# 1. Edit any source file
# 2. Go to chrome://extensions/
# 3. Click the refresh icon on the ChatAssist-AI card
# 4. Reload the tab you're testing on
```

No build step needed — pure vanilla JS.

---

## 🤝 Contributing

- 🐛 [Open an issue](https://github.com/devryank/chatassist-ai/issues) for bugs or feature requests
- 🔀 PRs welcome — please open an issue first to discuss major changes

---

## 📄 License

[MIT](LICENSE)
