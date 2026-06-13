import { create } from 'zustand'
import { complete } from './groq'
import { LANGUAGES, deviceLanguageCode } from './languages'

/** Master list of user-facing UI strings translated for the whole web app. */
export const UI_STRINGS: string[] = [
  // Sidebar / nav
  'New chat', 'Search chats', 'Chats', 'Projects', 'Agents', 'Settings', 'Library',
  'Voice call', 'Upgrade to AskAI+', 'Account', 'Log out', 'Sign in',
  // Chat
  'How can I help?', 'Ask anything…', 'Message AskAI…',
  'Ask anything, build apps & sites, search the live web, create images, or dispatch a team of agents.',
  'Stop', 'Regenerate', 'Copy', 'Copied', 'Share',
  // Composer / modes
  'Web search', 'Create image', 'Generate image', 'Agent', 'Search', 'Attach',
  'Take photo', 'Photo library', 'Upload file',
  // Settings tabs / labels
  'General', 'Personalization', 'Appearance', 'Memory', 'Data', 'Personal',
  'Language', 'Default model', 'Theme', 'Accent', 'Your name', 'About you',
  'Response style', 'Response length', 'Tone', 'Emoji',
  'Light', 'Dark', 'System', 'Save', 'Cancel', 'Done', 'Close',
  'concise', 'balanced', 'detailed', 'professional', 'friendly', 'playful', 'direct',
  // Projects
  'New project', 'Create', 'Delete', 'No projects yet', 'Build with AskAI',
  // Status
  'Thinking…', 'Searching the web…', 'Generating image…', 'Working…',
  'What are we making?', 'What can I help with?', 'Daily tasks', 'Saved messages', 'Describe an image to generate...',
]

interface I18nState {
  dict: Record<string, string>
  lang: string
  apply: (selection: string | undefined) => void
}

export const useI18n = create<I18nState>((set, get) => ({
  dict: {},
  lang: 'auto',
  apply: (selection) => {
    const sel = selection || 'auto'
    set({ lang: sel })
    const code = sel === 'auto' ? deviceLanguageCode() : sel
    if (code === 'en') {
      set({ dict: {} })
      return
    }
    try {
      const raw = localStorage.getItem('askai.i18n.' + code)
      if (raw) set({ dict: JSON.parse(raw) })
      else set({ dict: {} })
    } catch {
      set({ dict: {} })
    }
    void fetchTranslations(code, set, get)
  },
}))

/** Translate a string (non-reactive). For components, prefer useT(). */
export function t(s: string): string {
  return useI18n.getState().dict[s] ?? s
}

/** Reactive translator hook — re-renders when translations load. */
export function useT(): (s: string) => string {
  const dict = useI18n((s) => s.dict)
  return (s: string) => dict[s] ?? s
}

async function fetchTranslations(
  code: string,
  set: (p: Partial<I18nState>) => void,
  get: () => I18nState,
) {
  const lang = LANGUAGES.find((l) => l.code === code)
  if (!lang) return
  if (Object.keys(get().dict).length >= UI_STRINGS.length) return // already complete
  const numbered = UI_STRINGS.map((s, i) => `${i}. ${s}`).join('\n')
  const sys = `You are a professional UI localizer. Translate each numbered English UI label into ${lang.name} (${lang.native}). Return ONLY a JSON array of strings — same order, exactly ${UI_STRINGS.length} items, no comments. Keep them short and natural for a web app UI. Preserve punctuation like '…'.`
  try {
    const out = await complete(
      'llama-3.3-70b-versatile',
      [
        { role: 'system', content: sys },
        { role: 'user', content: numbered },
      ],
      { temperature: 0, maxTokens: 4000 },
    )
    const a = out.indexOf('[')
    const b = out.lastIndexOf(']')
    if (a < 0 || b < 0) return
    const arr = JSON.parse(out.slice(a, b + 1))
    if (!Array.isArray(arr) || arr.length !== UI_STRINGS.length) return
    const dict: Record<string, string> = {}
    UI_STRINGS.forEach((s, i) => {
      if (typeof arr[i] === 'string' && arr[i]) dict[s] = arr[i]
    })
    set({ dict })
    if (get().lang !== 'en') localStorage.setItem('askai.i18n.' + code, JSON.stringify(dict))
  } catch {
    /* keep English fallback */
  }
}
