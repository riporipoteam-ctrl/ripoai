import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

function replaceAny(source, path, label, replacements) {
  for (const { before, after } of replacements) {
    if (source.includes(after)) return source
    if (source.includes(before)) return source.replace(before, after)
  }
  throw new Error(`Agent browser prebuild patch failed: ${label} pattern not found in ${path}`)
}

function replaceAnyOptional(source, replacements) {
  for (const { before, after } of replacements) {
    if (source.includes(after)) return source
    if (source.includes(before)) return source.replace(before, after)
  }
  return source
}

function insertAfter(source, path, label, anchor, addition) {
  if (source.includes(addition)) return source
  if (!source.includes(anchor)) {
    throw new Error(`Agent browser prebuild patch failed: ${label} anchor not found in ${path}`)
  }
  return source.replace(anchor, `${anchor}${addition}`)
}

function patchFile(path, transform) {
  const fullPath = resolve(root, path)
  let source = readFileSync(fullPath, 'utf8')
  const next = transform(source, path)

  if (next !== source) writeFileSync(fullPath, next)
}

patchFile('src/hooks/useChat.ts', (source, path) => {
  source = insertAfter(
    source,
    path,
    'agent browser import',
    "import { searchWebImages, wantsWebImageSearch, webImageQuery } from '../lib/webImages'\n",
    "import { runAgentBrowserTask, type AgentBrowserEvent, type AgentBrowserState } from '../lib/agentBrowser'\n",
  )

  source = replaceAny(source, path, 'agent search gate', [
    {
      before:
`      const wantsSearch =
        opts.agent ||
        opts.webSearch ||
        (!opts.webSearch && shouldAutoSearch(history[history.length - 1]?.content ?? ''))`,
      after:
`      // Agent mode must never route through the compound web-search model.
      // The real browser panel below is the source of truth when Agent is on.
      const wantsSearch =
        !opts.agent &&
        (opts.webSearch ||
          (!opts.webSearch && shouldAutoSearch(history[history.length - 1]?.content ?? '')))`,
    },
    {
      before:
`      const wantsSearch =
        opts.agent ||
        opts.webSearch ||
        (autoSearchAllowed && shouldAutoSearch(history[history.length - 1]?.content ?? ''))`,
      after:
`      // Agent mode must never route through the compound web-search model.
      // The real browser panel below is the source of truth when Agent is on.
      const wantsSearch =
        !opts.agent &&
        (opts.webSearch ||
          (autoSearchAllowed && shouldAutoSearch(history[history.length - 1]?.content ?? '')))`,
    },
  ])

  source = replaceAnyOptional(source, [
    {
      before:
        'Use these browser results when relevant. If the browser backend was unavailable, say you could not open the live browser and continue with normal web-search/tool results; do not pretend to click pages you did not click.',
      after:
        'Use these browser results when relevant. If the browser backend was unavailable, say you could not open the live browser; do not fall back to the web-search model and do not pretend to click pages you did not click.',
    },
  ])

  if (!source.includes('const initialAgentBrowser: AgentBrowserState | undefined')) {
    source = insertAfter(
      source,
      path,
      'initial agent browser state',
      '      const assistantId = uid4()\n',
      `      const initialAgentBrowser: AgentBrowserState | undefined =
        opts.agent && (settings.agentBrowserPreview ?? true)
          ? {
              status: 'running',
              events: [{ type: 'start', label: 'Starting real browser session', at: Date.now() }],
            }
          : undefined
`,
    )
  }

  source = replaceAny(source, path, 'assistant message browser panel', [
    {
      before:
        "        { id: assistantId, role: 'assistant', content: '', reasoning: '', model: opts.model, steps: [], map: placesData ?? undefined, weather: weatherData ?? undefined, createdAt: Date.now() },",
      after:
`        {
          id: assistantId,
          role: 'assistant',
          content: '',
          reasoning: '',
          model: opts.model,
          steps: [],
          map: placesData ?? undefined,
          weather: weatherData ?? undefined,
          agentBrowser: initialAgentBrowser,
          createdAt: Date.now(),
        } as StoredMessage & { agentBrowser?: AgentBrowserState },`,
    },
    {
      before:
`        {
          id: assistantId,
          role: 'assistant',
          content: '',
          reasoning: '',
          model: opts.model,
          steps: [],
          map: placesData ?? undefined,
          weather: weatherData ?? undefined,
          createdAt: Date.now(),
        }`,
      after:
`        {
          id: assistantId,
          role: 'assistant',
          content: '',
          reasoning: '',
          model: opts.model,
          steps: [],
          map: placesData ?? undefined,
          weather: weatherData ?? undefined,
          agentBrowser: initialAgentBrowser,
          createdAt: Date.now(),
        } as StoredMessage & { agentBrowser?: AgentBrowserState }`,
    },
  ])

  if (!source.includes('let agentBrowser: AgentBrowserState | undefined = initialAgentBrowser')) {
    source = insertAfter(
      source,
      path,
      'run real browser before model stream',
      '      const isLive = () => loadedId.current === id\n',
      `
      let agentBrowser: AgentBrowserState | undefined = initialAgentBrowser
      if (opts.agent && (settings.agentBrowserPreview ?? true)) {
        const events: AgentBrowserEvent[] = [...(initialAgentBrowser?.events ?? [])]
        const applyAgentBrowser = (state: AgentBrowserState) => {
          agentBrowser = state
          if (!isLive()) return
          setMessages((m) =>
            m.map((x) =>
              x.id === assistantId
                ? ({ ...x, agentBrowser: state } as StoredMessage & { agentBrowser?: AgentBrowserState })
                : x,
            ),
          )
        }
        try {
          const browserResult = await runAgentBrowserTask(lastText, {
            signal: ac.signal,
            onEvent: (event) => {
              events.push(event)
              applyAgentBrowser({ ...(agentBrowser ?? { status: 'running', events: [] }), status: 'running', events: [...events] })
            },
          })
          const finalBrowser = { ...browserResult, events: browserResult.events?.length ? browserResult.events : events }
          applyAgentBrowser(finalBrowser)
          const browserNotes = [
            finalBrowser.currentUrl ? \`Current URL: \${finalBrowser.currentUrl}\` : '',
            finalBrowser.title ? \`Page title: \${finalBrowser.title}\` : '',
            finalBrowser.summary ? \`Browser summary: \${finalBrowser.summary}\` : '',
            finalBrowser.sources?.length
              ? \`Sources opened: \${finalBrowser.sources.map((s) => \`\${s.title || s.url} (\${s.url})\`).join('; ')}\`
              : '',
            finalBrowser.error ? \`Browser status: \${finalBrowser.error}\` : '',
          ]
            .filter(Boolean)
            .join('\\n')
          if (browserNotes) {
            system += \`\\n\\nReal agent browser session results:\\n\${browserNotes}\\nUse these browser results when relevant. If the browser backend was unavailable, say you could not open the live browser; do not fall back to the web-search model and do not pretend to click pages you did not click.\`
            groqMessages[0] = { role: 'system', content: system }
          }
        } catch (e: any) {
          if (e?.name === 'AbortError') throw e
          applyAgentBrowser({
            status: 'error',
            events,
            error: e?.message || 'Agent browser failed.',
          })
        }
      }
`,
    )
  }

  source = replaceAny(source, path, 'final transcript browser panel', [
    {
      before:
`        weather: weatherData ?? undefined,
        createdAt: Date.now(),
      }`,
      after:
`        weather: weatherData ?? undefined,
        agentBrowser,
        createdAt: Date.now(),
      } as StoredMessage & { agentBrowser?: AgentBrowserState }`,
    },
  ])

  return source
})

patchFile('src/components/ChatView.tsx', (source, path) => {
  source = replaceAny(source, path, 'web chip exclusivity', [
    {
      before: 'onToggleWeb={() => { setWebSearch((v) => !v); setImageMode(false) }}',
      after: 'onToggleWeb={() => { setWebSearch((v) => !v); setAgent(false); setImageMode(false) }}',
    },
  ])
  source = replaceAny(source, path, 'agent chip exclusivity', [
    {
      before: 'onToggleAgent={() => { setAgent((v) => !v); setImageMode(false) }}',
      after: 'onToggleAgent={() => { setAgent((v) => !v); setWebSearch(false); setImageMode(false) }}',
    },
  ])
  return source
})

console.log('Agent mode forced to real browser path.')
