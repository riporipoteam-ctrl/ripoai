import { memo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Check, Copy } from 'lucide-react'

function CodeBlock({ language, value }: { language: string; value: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="group my-3 overflow-hidden rounded-2xl border border-white/10 shadow-lg">
      <div className="flex items-center justify-between bg-[#15151c] px-3 py-2 text-xs text-muted">
        <div className="flex items-center gap-2">
          <span className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          </span>
          <span className="font-mono lowercase">{language || 'text'}</span>
        </div>
        <button
          onClick={copy}
          className="pressable flex items-center gap-1 rounded-md px-2 py-1 hover:bg-white/10"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <SyntaxHighlighter
        language={language || 'text'}
        style={oneDark}
        customStyle={{ margin: 0, background: 'rgba(0,0,0,0.55)', fontSize: '0.85rem' }}
        wrapLongLines
      >
        {value}
      </SyntaxHighlighter>
    </div>
  )
}

function MarkdownImpl({ children }: { children: string }) {
  return (
    <div className="prose-ripo">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeRaw, rehypeKatex]}
        components={{
          code({ inline, className, children, ...props }: any) {
            const match = /language-([\w-]+)/.exec(className || '')
            const raw = String(children).replace(/\n$/, '')
            if (!inline && (match || raw.includes('\n'))) {
              // info string may be "lang path/to/file" — take the first token as language.
              const lang = (match?.[1] || '').split(/\s+/)[0]
              return <CodeBlock language={lang} value={raw} />
            }
            return (
              <code
                className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.85em]"
                {...props}
              >
                {children}
              </code>
            )
          },
          a: ({ node, ...props }) => (
            <a {...props} target="_blank" rel="noreferrer" className="text-accent underline" />
          ),
          img: ({ node, ...props }) => (
            <img
              {...props}
              loading="lazy"
              className="my-2 max-h-[28rem] w-auto max-w-full rounded-2xl border border-white/10 shadow-lg"
            />
          ),
          table: ({ node, ...props }) => (
            <div className="no-scrollbar my-3 -mx-1 overflow-x-auto">
              <table className="w-full min-w-[34rem] border-collapse text-sm" {...props} />
            </div>
          ),
          th: ({ node, ...props }) => (
            <th
              className="border border-white/15 bg-white/5 px-3 py-1.5 text-left align-top"
              style={{ minWidth: '8rem' }}
              {...props}
            />
          ),
          td: ({ node, ...props }) => (
            <td className="border border-white/10 px-3 py-1.5 align-top" style={{ minWidth: '8rem' }} {...props} />
          ),
          ul: ({ node, ...props }) => <ul className="my-1 list-disc space-y-0.5 pl-5" {...props} />,
          ol: ({ node, ...props }) => <ol className="my-1 list-decimal space-y-0.5 pl-5" {...props} />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}

export const Markdown = memo(MarkdownImpl)
