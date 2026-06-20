// Runtime, whole-page UI translator — like a built-in page translator, but
// driven by the app's own AI (`complete`). On language change it walks the DOM,
// collects visible *UI chrome* text nodes (buttons, labels, menus, headings,
// placeholders), translates them in batches, caches per (language, text) in
// localStorage, and applies them via textContent. It NEVER touches chat
// message content, AI/agent output, code, inputs or anything marked
// data-no-translate / translate="no". Switching back to English restores the
// originals. Best-effort and non-blocking — a few strings may lag.

import { complete } from './groq'
import { LANGUAGES, deviceLanguageCode } from './languages'

// Remember the ORIGINAL English text per node so we can restore on switch back.
const ORIGINAL = new WeakMap<Text, string>()
// Every text node we've touched (live set), so English restore is instant.
const TOUCHED = new Set<Text>()

let currentCode = 'en'
let observer: MutationObserver | null = null
let scanTimer: ReturnType<typeof setTimeout> | null = null
let running = false

// ---- Cache (per language) -------------------------------------------------

type Cache = Record<string, string>
const memCache: Record<string, Cache> = {}

function cacheKey(code: string) {
  return 'askai.autotr.' + code
}

function loadCache(code: string): Cache {
  if (memCache[code]) return memCache[code]
  let c: Cache = {}
  try {
    const raw = localStorage.getItem(cacheKey(code))
    if (raw) c = JSON.parse(raw)
  } catch {
    /* ignore */
  }
  memCache[code] = c
  return c
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
function scheduleSave(code: string) {
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    try {
      localStorage.setItem(cacheKey(code), JSON.stringify(memCache[code] ?? {}))
    } catch {
      /* quota — ignore */
    }
  }, 500)
}

// ---- Node filtering --------------------------------------------------------

// Containers whose text must NEVER be translated (user/AI message content,
// markdown/code, inputs, etc.). Matched via closest().
const SKIP_SELECTOR = [
  '[data-no-translate]',
  '[translate="no"]',
  '[contenteditable="true"]',
  '[contenteditable=""]',
  'input',
  'textarea',
  'script',
  'style',
  'noscript',
  'code',
  'pre',
  'svg',
  // Chat / AI / agent surfaces — already in the user's language via the model.
  '.message-row',
  '.user-message-row',
  '.assistant-message-row',
  '.user-bubble',
  '.prose-ripo',
  '.image-card',
  '.agent-browser-panel',
].join(',')

// Only-whitespace, pure numbers/punctuation/symbols, emoji, or URLs — skip.
const TRANSLATABLE = /[\p{L}]/u
const URL_LIKE = /^(https?:\/\/|www\.|mailto:|[\w.-]+@[\w.-]+)/i

function isTranslatable(text: string): boolean {
  const t = text.trim()
  if (t.length < 2 || t.length > 200) return false
  if (!TRANSLATABLE.test(t)) return false // no letters (numbers/emoji/symbols)
  if (URL_LIKE.test(t)) return false
  if (/^[\d\s.,:%+\-/]+$/.test(t)) return false // numeric-ish
  return true
}

function shouldSkipNode(node: Text): boolean {
  const parent = node.parentElement
  if (!parent) return true
  // Hidden subtrees aren't worth translating (and aren't user-visible).
  if (parent.closest(SKIP_SELECTOR)) return true
  return false
}

// ---- DOM collection --------------------------------------------------------

interface Item {
  text: string
  apply: (translated: string) => void
}

function collectTextNodes(root: Node, out: Item[]) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const node = n as Text
      if (shouldSkipNode(node)) return NodeFilter.FILTER_REJECT
      const original = ORIGINAL.get(node) ?? node.textContent ?? ''
      if (!isTranslatable(original)) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })
  let n: Node | null
  while ((n = walker.nextNode())) {
    const node = n as Text
    const original = ORIGINAL.get(node) ?? node.textContent ?? ''
    if (!ORIGINAL.has(node)) ORIGINAL.set(node, original)
    TOUCHED.add(node)
    out.push({
      text: original.trim(),
      apply: (translated) => {
        // Preserve surrounding whitespace from the original node.
        const raw = ORIGINAL.get(node) ?? original
        const lead = raw.match(/^\s*/)?.[0] ?? ''
        const trail = raw.match(/\s*$/)?.[0] ?? ''
        if (node.isConnected) node.textContent = lead + translated + trail
      },
    })
  }
}

// Translate placeholder/title/aria-label attributes too.
const ATTR_NAMES = ['placeholder', 'title', 'aria-label']
const ATTR_ORIGINAL = new WeakMap<Element, Record<string, string>>()
const ATTR_TOUCHED = new Set<Element>()

function collectAttrs(root: Element, out: Item[]) {
  const els = [root, ...Array.from(root.querySelectorAll<HTMLElement>('[placeholder],[title],[aria-label]'))]
  for (const el of els) {
    if (!(el instanceof Element)) continue
    if (el.closest(SKIP_SELECTOR)) continue
    for (const attr of ATTR_NAMES) {
      if (!el.hasAttribute(attr)) continue
      const store = ATTR_ORIGINAL.get(el) ?? {}
      const original = store[attr] ?? el.getAttribute(attr) ?? ''
      if (!isTranslatable(original)) continue
      if (store[attr] === undefined) {
        store[attr] = original
        ATTR_ORIGINAL.set(el, store)
        ATTR_TOUCHED.add(el)
      }
      out.push({
        text: original.trim(),
        apply: (translated) => {
          if (el.isConnected) el.setAttribute(attr, translated)
        },
      })
    }
  }
}

// ---- Restore (back to English) --------------------------------------------

function restoreAll() {
  for (const node of TOUCHED) {
    const original = ORIGINAL.get(node)
    if (original !== undefined && node.isConnected) node.textContent = original
  }
  TOUCHED.clear()
  for (const el of ATTR_TOUCHED) {
    const store = ATTR_ORIGINAL.get(el)
    if (!store) continue
    for (const attr of ATTR_NAMES) {
      if (store[attr] !== undefined && el.isConnected) el.setAttribute(attr, store[attr])
    }
  }
  ATTR_TOUCHED.clear()
}

// ---- Batched translation ---------------------------------------------------

const BATCH = 48

async function translateBatch(code: string, langName: string, langNative: string, texts: string[]): Promise<string[]> {
  const numbered = texts.map((s, i) => `${i + 1}. ${s}`).join('\n')
  const sys = `You are a professional UI localizer for a web app. Translate each numbered short UI string into ${langName} (${langNative}). These are buttons, labels, menus, headings and placeholders — keep them short and natural. Return ONLY a JSON array of strings, same order, exactly ${texts.length} items. Preserve punctuation like '…', '%', and any emoji. Do not add quotes or commentary.`
  const out = await complete(
    'llama-3.3-70b-versatile',
    [
      { role: 'system', content: sys },
      { role: 'user', content: numbered },
    ],
    { temperature: 0, maxTokens: 3000 },
  )
  const a = out.indexOf('[')
  const b = out.lastIndexOf(']')
  if (a < 0 || b < 0) return texts
  const arr = JSON.parse(out.slice(a, b + 1))
  if (!Array.isArray(arr) || arr.length !== texts.length) return texts
  return arr.map((x, i) => (typeof x === 'string' && x ? x : texts[i]))
}

// Translate a list of items: apply cached ones instantly, batch-fetch the rest.
async function processItems(code: string, langName: string, langNative: string, items: Item[]) {
  const cache = loadCache(code)
  // De-dupe identical source strings within this pass.
  const pending = new Map<string, Item[]>()
  for (const item of items) {
    const cached = cache[item.text]
    if (cached !== undefined) {
      item.apply(cached)
      continue
    }
    const group = pending.get(item.text)
    if (group) group.push(item)
    else pending.set(item.text, [item])
  }
  const unique = Array.from(pending.keys())
  if (!unique.length) return

  for (let i = 0; i < unique.length; i += BATCH) {
    if (currentCode !== code) return // language changed mid-flight — bail
    const slice = unique.slice(i, i + BATCH)
    try {
      const translated = await translateBatch(code, langName, langNative, slice)
      slice.forEach((src, j) => {
        const value = translated[j]
        cache[src] = value
        if (currentCode === code) pending.get(src)?.forEach((it) => it.apply(value))
      })
      scheduleSave(code)
    } catch {
      // Leave these in English; cache nothing so they retry next pass.
    }
    // Yield to the UI between batches so we never freeze the page.
    await new Promise((r) => setTimeout(r, 0))
  }
}

// ---- Public API ------------------------------------------------------------

function scanAndTranslate(root: Node = document.body) {
  if (currentCode === 'en') return
  const code = currentCode
  const lang = LANGUAGES.find((l) => l.code === code)
  if (!lang) return
  if (running) return
  running = true
  const items: Item[] = []
  try {
    collectTextNodes(root, items)
    if (root instanceof Element) collectAttrs(root, items)
    else if (root === document.body) collectAttrs(document.body, items)
  } catch {
    /* ignore */
  }
  if (!items.length) {
    running = false
    return
  }
  void processItems(code, lang.name, lang.native, items).finally(() => {
    running = false
  })
}

function debouncedScan() {
  if (scanTimer) clearTimeout(scanTimer)
  scanTimer = setTimeout(() => {
    scanTimer = null
    scanAndTranslate(document.body)
  }, 300)
}

function ensureObserver() {
  if (observer || typeof MutationObserver === 'undefined') return
  observer = new MutationObserver((mutations) => {
    if (currentCode === 'en') return
    // Only react when real nodes/text appear — cheap guard before the debounce.
    for (const m of mutations) {
      if (m.type === 'childList' && (m.addedNodes.length || m.removedNodes.length)) {
        debouncedScan()
        return
      }
      if (m.type === 'characterData') {
        debouncedScan()
        return
      }
    }
  })
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  })
}

/**
 * Drive the whole-UI translator for the given language selection.
 * 'auto' => device language; 'en'/English => restore originals (no-op cost).
 */
export function applyAutoTranslate(selection: string | undefined) {
  if (typeof document === 'undefined') return
  const sel = selection || 'auto'
  const code = sel === 'auto' ? deviceLanguageCode() : sel
  if (code === currentCode) {
    // Same language — just make sure new nodes get picked up.
    if (code !== 'en') {
      ensureObserver()
      debouncedScan()
    }
    return
  }
  currentCode = code
  if (code === 'en') {
    restoreAll()
    return
  }
  ensureObserver()
  // Prime the cache and translate progressively (non-blocking).
  scanAndTranslate(document.body)
  // A short follow-up pass catches anything mounted right after route changes.
  setTimeout(() => debouncedScan(), 800)
}
