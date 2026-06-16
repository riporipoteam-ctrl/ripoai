import{r,j as e,m as _,A as te}from"./motion-TAHrZRye.js";import{a7 as Y,C as G,au as se,a6 as ne,aH as ae,a as ie,o as le,n as oe,j as re,N as K,X as z,O as W,b as q,al as H,ah as S,aP as de,ap as ce,L as pe,G as me,Q as ue}from"./index-BqiUtCY3.js";import{f as xe,c as fe,b as he,S as be,e as ge,u as we}from"./index-IoI9SfNs.js";import{E as ye}from"./eye-B6L2oq9M.js";import"./firebase-D2epOZ3z.js";import"./markdown-B5uOaCix.js";/**
 * @license lucide-react v0.469.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ne=Y("Boxes",[["path",{d:"M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z",key:"lc1i9w"}],["path",{d:"m7 16.5-4.74-2.85",key:"1o9zyk"}],["path",{d:"m7 16.5 5-3",key:"va8pkn"}],["path",{d:"M7 16.5v5.17",key:"jnp8gn"}],["path",{d:"M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z",key:"8zsnat"}],["path",{d:"m17 16.5-5-3",key:"8arw3v"}],["path",{d:"m17 16.5 4.74-2.85",key:"8rfmw"}],["path",{d:"M17 16.5v5.17",key:"k6z78m"}],["path",{d:"M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z",key:"1xygjf"}],["path",{d:"M12 8 7.26 5.15",key:"1vbdud"}],["path",{d:"m12 8 4.74-2.85",key:"3rx089"}],["path",{d:"M12 13.5V8",key:"1io7kd"}]]);/**
 * @license lucide-react v0.469.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ve=Y("Component",[["path",{d:"M15.536 11.293a1 1 0 0 0 0 1.414l2.376 2.377a1 1 0 0 0 1.414 0l2.377-2.377a1 1 0 0 0 0-1.414l-2.377-2.377a1 1 0 0 0-1.414 0z",key:"1uwlt4"}],["path",{d:"M2.297 11.293a1 1 0 0 0 0 1.414l2.377 2.377a1 1 0 0 0 1.414 0l2.377-2.377a1 1 0 0 0 0-1.414L6.088 8.916a1 1 0 0 0-1.414 0z",key:"10291m"}],["path",{d:"M8.916 17.912a1 1 0 0 0 0 1.415l2.377 2.376a1 1 0 0 0 1.414 0l2.377-2.376a1 1 0 0 0 0-1.415l-2.377-2.376a1 1 0 0 0-1.414 0z",key:"1tqoq1"}],["path",{d:"M8.916 4.674a1 1 0 0 0 0 1.414l2.377 2.376a1 1 0 0 0 1.414 0l2.377-2.376a1 1 0 0 0 0-1.414l-2.377-2.377a1 1 0 0 0-1.414 0z",key:"1x6lto"}]]),J=t=>`askai:agent-apps:${t}`,F=t=>`askai:agent-apps:seeded:${t}`,L="askai-agent-apps-changed";function ke(){return"app_"+Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-4)}function je(t){return window.addEventListener(L,t),()=>window.removeEventListener(L,t)}function Ae(){try{window.dispatchEvent(new CustomEvent(L))}catch{}}function $(t){try{const s=localStorage.getItem(J(t));if(!s)return[];const n=JSON.parse(s);return Array.isArray(n)?n:[]}catch{return[]}}function P(t,s){try{localStorage.setItem(J(t),JSON.stringify(s))}catch{}Ae()}function I(t){let s=$(t);if(!s.length&&!localStorage.getItem(F(t))){s=Ee();try{localStorage.setItem(F(t),"1")}catch{}P(t,s)}return[...s].sort((n,l)=>l.updatedAt-n.updatedAt)}function Se(t={}){const s=Date.now();return{id:t.id??ke(),title:t.title??"Untitled app",description:t.description??"",agentId:t.agentId??"askai",agentName:t.agentName??"AskAI Builder",kind:t.kind??"app",files:t.files??{...M},entry:t.entry??"/App.tsx",prompt:t.prompt,createdAt:t.createdAt??s,updatedAt:t.updatedAt??s}}function O(t,s){const n=$(t),l=n.findIndex(m=>m.id===s.id),o={...s,updatedAt:Date.now()};return l===-1?n.push(o):n[l]=o,P(t,n),o}function Ce(t,s){P(t,$(t).filter(n=>n.id!==s))}function Te(t){const s=t.toLowerCase();return/\b(landing|website|web ?site|marketing|portfolio|homepage|one ?pager|splash)\b/.test(s)?"website":/\b(component|button|card|widget|badge|chart|navbar|modal|input|form field)\b/.test(s)?"component":"app"}const R=`// Loads Tailwind's Play CDN once so utility classes work in the preview.
export function useTailwindCDN() {
  if (typeof document === 'undefined') return
  if (document.getElementById('twcdn')) return
  const s = document.createElement('script')
  s.id = 'twcdn'
  s.src = 'https://cdn.tailwindcss.com'
  document.head.appendChild(s)
}
`,De=`import { useTailwindCDN } from './tailwind'

export default function App() {
  useTailwindCDN()
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold">Your new app</h1>
        <p className="mt-2 text-slate-400">
          Ask the agent to build something and it appears right here, live.
        </p>
      </div>
    </div>
  )
}
`,M={"/App.tsx":De,"/tailwind.ts":R};function Ee(){const t=Date.now();return[{id:"seed_landing",title:"Nimbus — SaaS landing page",description:"A responsive marketing landing page with hero, feature grid, pricing and footer.",agentId:"askai",agentName:"Pixel (Designer)",kind:"website",entry:"/App.tsx",prompt:"Build a clean SaaS landing page for a product called Nimbus",createdAt:t-1e3*60*60*26,updatedAt:t-1e3*60*60*26,files:{"/tailwind.ts":R,"/App.tsx":Ie}},{id:"seed_todo",title:"Focus — todo app",description:"A keyboard-friendly todo list with add, complete, filter and clear, persisted in state.",agentId:"askai",agentName:"Forge (Engineer)",kind:"app",entry:"/App.tsx",prompt:"Build a minimal todo app with filters",createdAt:t-1e3*60*60*3,updatedAt:t-1e3*60*60*3,files:{"/tailwind.ts":R,"/App.tsx":Le}}]}const Ie=`import { useTailwindCDN } from './tailwind'

const features = [
  { title: 'Realtime sync', body: 'Changes propagate to every device instantly.' },
  { title: 'Private by default', body: 'End-to-end encrypted. Your data stays yours.' },
  { title: 'Built for teams', body: 'Shared spaces, roles and granular permissions.' },
]

const tiers = [
  { name: 'Free', price: '$0', perks: ['1 workspace', 'Up to 3 members', 'Community support'] },
  { name: 'Pro', price: '$12', perks: ['Unlimited workspaces', 'Up to 25 members', 'Priority support'], featured: true },
  { name: 'Scale', price: '$39', perks: ['SSO & audit logs', 'Unlimited members', 'Dedicated support'] },
]

export default function App() {
  useTailwindCDN()
  return (
    <div className="min-h-screen bg-white text-slate-900 antialiased">
      <header className="sticky top-0 z-10 border-b border-slate-200/70 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2 font-bold">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-600 text-white">N</span>
            Nimbus
          </div>
          <nav className="hidden gap-6 text-sm text-slate-600 sm:flex">
            <a href="#features" className="hover:text-slate-900">Features</a>
            <a href="#pricing" className="hover:text-slate-900">Pricing</a>
          </nav>
          <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
            Get started
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-20 text-center">
        <span className="inline-block rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600">
          New · Workspaces 2.0
        </span>
        <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-extrabold tracking-tight sm:text-6xl">
          The calm workspace your team will actually use
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-slate-600">
          Nimbus keeps docs, tasks and chat in one tidy place — fast, private, and beautifully simple.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <button className="rounded-lg bg-indigo-600 px-6 py-3 font-semibold text-white hover:bg-indigo-500">
            Start free
          </button>
          <button className="rounded-lg border border-slate-300 px-6 py-3 font-semibold hover:bg-slate-50">
            Book a demo
          </button>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-6 sm:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-2xl border border-slate-200 p-6">
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-center text-3xl font-bold">Simple, fair pricing</h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {tiers.map((t) => (
            <div
              key={t.name}
              className={
                'rounded-2xl border p-6 ' +
                (t.featured ? 'border-indigo-600 ring-1 ring-indigo-600' : 'border-slate-200')
              }
            >
              <div className="flex items-baseline justify-between">
                <h3 className="font-semibold">{t.name}</h3>
                {t.featured && (
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-600">
                    Popular
                  </span>
                )}
              </div>
              <p className="mt-4 text-3xl font-extrabold">
                {t.price}
                <span className="text-base font-medium text-slate-500">/mo</span>
              </p>
              <ul className="mt-4 space-y-2 text-sm text-slate-600">
                {t.perks.map((p) => (
                  <li key={p}>• {p}</li>
                ))}
              </ul>
              <button className="mt-6 w-full rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500">
                Choose {t.name}
              </button>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-slate-200 py-10 text-center text-sm text-slate-500">
        © {new Date().getFullYear()} Nimbus. Built by an agent.
      </footer>
    </div>
  )
}
`,Le=`import { useMemo, useState } from 'react'
import { useTailwindCDN } from './tailwind'

interface Todo {
  id: number
  text: string
  done: boolean
}

type Filter = 'all' | 'active' | 'done'

export default function App() {
  useTailwindCDN()
  const [todos, setTodos] = useState<Todo[]>([
    { id: 1, text: 'Ship the Apps gallery', done: true },
    { id: 2, text: 'Review the agent build', done: false },
    { id: 3, text: 'Celebrate', done: false },
  ])
  const [text, setText] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  const visible = useMemo(
    () =>
      todos.filter((t) =>
        filter === 'all' ? true : filter === 'active' ? !t.done : t.done,
      ),
    [todos, filter],
  )
  const remaining = todos.filter((t) => !t.done).length

  function add() {
    const value = text.trim()
    if (!value) return
    setTodos((ts) => [...ts, { id: Date.now(), text: value, done: false }])
    setText('')
  }

  function toggle(id: number) {
    setTodos((ts) => ts.map((t) => (t.id === id ? { ...t, done: !t.done } : t)))
  }

  function remove(id: number) {
    setTodos((ts) => ts.filter((t) => t.id !== id))
  }

  return (
    <div className="min-h-screen bg-slate-100 py-10">
      <div className="mx-auto max-w-md px-4">
        <h1 className="text-2xl font-bold text-slate-900">Focus</h1>
        <p className="text-sm text-slate-500">{remaining} task{remaining === 1 ? '' : 's'} left</p>

        <div className="mt-4 flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="What needs doing?"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500"
          />
          <button
            onClick={add}
            className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500"
          >
            Add
          </button>
        </div>

        <div className="mt-4 flex gap-2 text-sm">
          {(['all', 'active', 'done'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={
                'rounded-full px-3 py-1 capitalize ' +
                (filter === f ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600')
              }
            >
              {f}
            </button>
          ))}
        </div>

        <ul className="mt-4 space-y-2">
          {visible.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-3 rounded-lg bg-white px-3 py-2 shadow-sm"
            >
              <input
                type="checkbox"
                checked={t.done}
                onChange={() => toggle(t.id)}
                className="h-4 w-4 accent-indigo-600"
              />
              <span className={'flex-1 ' + (t.done ? 'text-slate-400 line-through' : 'text-slate-800')}>
                {t.text}
              </span>
              <button onClick={() => remove(t.id)} className="text-slate-400 hover:text-red-500">
                ✕
              </button>
            </li>
          ))}
          {visible.length === 0 && (
            <li className="rounded-lg bg-white px-3 py-6 text-center text-sm text-slate-400">
              Nothing here.
            </li>
          )}
        </ul>
      </div>
    </div>
  )
}
`,Oe=`You are AskAI App Builder — a world-class React + TypeScript front-end engineer.
You build small, self-contained apps/websites/components that run in a Sandpack "react-ts" sandbox.
START CODING IMMEDIATELY. No questions, no plans, minimal preamble.

HARD RULES:
- Stack: React 18 + TypeScript. Style with Tailwind utility classes ONLY.
- Tailwind is provided via a CDN helper. Your App MUST import { useTailwindCDN } from './tailwind' and call useTailwindCDN() at the top of the component so classes work.
- Always include a file /tailwind.ts with EXACTLY this content:
\`\`\`ts /tailwind.ts
export function useTailwindCDN() {
  if (typeof document === 'undefined') return
  if (document.getElementById('twcdn')) return
  const s = document.createElement('script')
  s.id = 'twcdn'
  s.src = 'https://cdn.tailwindcss.com'
  document.head.appendChild(s)
}
\`\`\`
- The entry component is /App.tsx and MUST be the default export (export default function App()).
- Do NOT use external npm packages beyond react/react-dom. No CSS files, no index.html, no index.tsx — Sandpack supplies the mount. Just the source files.
- Make it complete, polished, responsive and runnable. Real content, no Lorem-only placeholders, no "// rest of code" elisions.

Output format (strict) — output EACH file as its own fenced block whose info string is the file path, e.g.:
\`\`\`tsx /App.tsx
import { useTailwindCDN } from './tailwind'
export default function App() { ... }
\`\`\`
Then any extra components as /Foo.tsx, helpers as /lib.ts, etc.`;function Re(t,s){return s==="length"?!0:(t.match(/```/g)||[]).length%2===1}async function V(t,s={}){const n=s.model||G,l=s.files,o=l?Object.entries(l).map(([p,h])=>`--- ${p} ---
${h}`).join(`

`).slice(0,7e3):"",m={role:"system",content:Oe+(o?`

You are MODIFYING an existing app. Current files:
${o}

Apply the requested change and re-output every file that changes (full file contents).`:"")};let c="";const u=s.signal,N=p=>{var h;c+=p,(h=s.onToken)==null||h.call(s,c)};async function x(p){return(await ae({model:n,messages:p,temperature:.5,maxTokens:8e3,topP:1,signal:u,onToken:N})).finishReason||""}let f=[m,{role:"user",content:t}],w=await x(f),g=0;for(;!(u!=null&&u.aborted)&&Re(c,w)&&g<7;){g++,f=[m,{role:"user",content:t},{role:"assistant",content:c},{role:"user",content:"Continue exactly where you left off. Output only the remaining code. Do not repeat anything already written."}];try{w=await x(f)}catch{break}}const v=se(c),a={};for(const p of v)a[p.path]=a[p.path]?a[p.path]+`
`+p.code:p.code;const d={...l??{},...a};return d["/tailwind.ts"]||(d["/tailwind.ts"]=M["/tailwind.ts"]),d["/App.tsx"]||(d["/App.tsx"]=M["/App.tsx"]),{text:c,files:d}}async function Me(t,s){try{const l=(await ne(s||G,[{role:"user",content:`Give a 2-4 word product-style title (no quotes, no punctuation) for an app built from this request: "${t.slice(0,200)}"`}],{maxTokens:16})||"").replace(/["'.\n]/g,"").trim();if(l)return l.slice(0,48)}catch{}return t.trim().slice(0,48)||"New app"}function ze({app:t,uid:s,onBack:n,onChange:l}){const[o,m]=r.useState(t.files),[c,u]=r.useState("preview"),[N,x]=r.useState(0),[f,w]=r.useState(""),[g,v]=r.useState(!1),[a,d]=r.useState(""),p=r.useRef(null),[h,E]=r.useState(()=>typeof window<"u"&&window.innerWidth<768);r.useEffect(()=>{const i=()=>E(window.innerWidth<768);return window.addEventListener("resize",i),()=>window.removeEventListener("resize",i)},[]),r.useEffect(()=>{m(t.files),x(i=>i+1),u("preview")},[t.id]);const C=r.useMemo(()=>Object.fromEntries(Object.entries(o).map(([i,b])=>[i,{code:b}])),[o]),k=typeof document<"u"&&document.documentElement.classList.contains("dark");function T(i){const b=O(s,{...t,files:i});l(b)}function X(){var i;(i=p.current)==null||i.abort(),p.current=null,v(!1)}async function B(){const i=f.trim();if(!i||g)return;S("medium"),w(""),v(!0),d(""),u("code");const b=new AbortController;p.current=b;try{const{files:j}=await V(i,{files:o,signal:b.signal,onToken:d});m(j),x(A=>A+1),T(j),u("preview")}catch{}finally{v(!1),p.current=null,d("")}}function Z(){S("light");const i=o[t.entry]??o["/App.tsx"]??"",b=Object.entries(o).filter(([D])=>D!==t.entry&&D!=="/App.tsx").map(([D,ee])=>`// ${D}
${U(ee)}`).join(`

`),j=Be(t.title,b,U(i)),A=new Blob([j],{type:"text/html"}),y=URL.createObjectURL(A);window.open(y,"_blank","noopener"),setTimeout(()=>URL.revokeObjectURL(y),6e4)}function Q(){S("light");for(const[i,b]of Object.entries(o)){const j=new Blob([b],{type:"text/plain"}),A=URL.createObjectURL(j),y=document.createElement("a");y.href=A,y.download=i.replace(/^\//,"").replace(/\//g,"__"),document.body.appendChild(y),y.click(),y.remove(),setTimeout(()=>URL.revokeObjectURL(A),1e4)}}return e.jsxs("div",{className:`flex h-full flex-col ${H?"pb-24":""}`,children:[e.jsxs("div",{className:"flex shrink-0 items-center gap-2 border-b border-line/60 px-3 py-2.5",children:[e.jsx("button",{onClick:n,className:"pressable flex h-11 w-11 items-center justify-center rounded-xl text-muted hover:bg-ink/5 hover:text-ink","aria-label":"Back to gallery",children:e.jsx(ie,{size:20})}),e.jsxs("div",{className:"min-w-0 flex-1",children:[e.jsx("div",{className:"truncate font-bold text-ink",children:t.title}),e.jsxs("div",{className:"truncate text-xs text-muted",children:["Built by ",t.agentName]})]}),e.jsxs("button",{onClick:Z,className:"pressable flex h-11 items-center gap-1.5 rounded-xl border border-line/60 bg-card px-3 text-sm font-semibold text-ink",title:"Open in new tab",children:[e.jsx(le,{size:16})," ",e.jsx("span",{className:"hidden sm:inline",children:"Open"})]}),e.jsxs("button",{onClick:Q,className:"pressable flex h-11 items-center gap-1.5 rounded-xl border border-line/60 bg-card px-3 text-sm font-semibold text-ink",title:"Download source",children:[e.jsx(oe,{size:16})," ",e.jsx("span",{className:"hidden sm:inline",children:"Download"})]})]}),e.jsxs("div",{className:"flex shrink-0 items-center gap-1 px-3 py-2",children:[[{id:"preview",label:"Preview",icon:ye},{id:"code",label:"Code",icon:re}].map(i=>e.jsxs("button",{onClick:()=>u(i.id),className:`pressable flex min-h-[40px] items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition ${c===i.id?"accent-gradient-bg text-white":"text-muted hover:bg-ink/5"}`,children:[e.jsx(i.icon,{size:15})," ",i.label]},i.id)),e.jsxs("span",{className:"ml-auto flex items-center gap-1 text-xs text-muted",children:[e.jsx(K,{size:12,className:"text-accent"})," Live"]})]}),e.jsx(_.div,{initial:{opacity:0},animate:{opacity:1},className:"min-h-0 flex-1 px-3 pb-3",children:g?e.jsx(Pe,{text:a}):e.jsxs(xe,{template:"react-ts",theme:k?"dark":"light",files:C,options:{recompileMode:"delayed",recompileDelay:400,activeFile:t.entry},style:{height:"100%"},children:[e.jsxs(fe,{style:{height:"100%",borderRadius:18,border:"1px solid rgb(var(--line))"},children:[c==="code"&&e.jsxs(e.Fragment,{children:[!h&&e.jsx(he,{style:{height:"100%"}}),e.jsx(be,{showLineNumbers:!0,showInlineErrors:!0,showTabs:h,style:{height:"100%",minWidth:0,flex:1}})]}),c==="preview"&&e.jsx(ge,{showOpenInCodeSandbox:!1,style:{height:"100%"}})]}),c==="code"&&e.jsx($e,{onFiles:i=>{m(i),T(i)}})]},N)}),e.jsx("div",{className:"shrink-0 px-3 pb-3",children:e.jsxs("div",{className:"glass-strong flex items-end gap-2 rounded-2xl border border-line/60 p-2",children:[e.jsx(z,{size:18,className:"mb-2 ml-1 shrink-0 text-accent"}),e.jsx("textarea",{value:f,onChange:i=>w(i.target.value),onKeyDown:i=>{i.key==="Enter"&&!i.shiftKey&&(i.preventDefault(),B())},rows:1,placeholder:"Ask the agent to change this app…",className:"no-scrollbar max-h-28 flex-1 resize-none bg-transparent px-1 py-2 text-sm text-ink outline-none placeholder:text-muted"}),g?e.jsx("button",{onClick:X,className:"pressable flex h-10 w-10 items-center justify-center rounded-full bg-ink text-bg",children:e.jsx(W,{size:14,fill:"currentColor"})}):e.jsx("button",{onClick:B,disabled:!f.trim(),className:"pressable accent-gradient-bg flex h-10 w-10 items-center justify-center rounded-full text-white disabled:opacity-40",children:e.jsx(q,{size:18})})]})})]})}function $e({onFiles:t}){const{sandpack:s}=we(),n=r.useRef(""),l=r.useRef(null);return r.useEffect(()=>{const o={};for(const[c,u]of Object.entries(s.files))c==="/index.html"||c==="/index.tsx"||c==="/public/index.html"||(o[c]=u.code);const m=JSON.stringify(o);if(m!==n.current)return n.current=m,l.current&&clearTimeout(l.current),l.current=setTimeout(()=>t(o),800),()=>{l.current&&clearTimeout(l.current)}},[s.files,t]),null}function Pe({text:t}){const s=r.useRef(null);return r.useEffect(()=>{var n;(n=s.current)==null||n.scrollTo({top:s.current.scrollHeight})},[t]),e.jsxs("div",{className:"flex h-full flex-col overflow-hidden rounded-[18px] border border-line/60 bg-card",children:[e.jsxs("div",{className:"flex items-center gap-2 border-b border-line/60 px-3 py-2 text-xs",children:[e.jsxs("span",{className:"flex gap-1.5",children:[e.jsx("span",{className:"h-2.5 w-2.5 rounded-full bg-red-400/80"}),e.jsx("span",{className:"h-2.5 w-2.5 rounded-full bg-yellow-400/80"}),e.jsx("span",{className:"h-2.5 w-2.5 rounded-full bg-green-400/80"})]}),e.jsx("span",{className:"font-mono text-muted",children:"building…"}),e.jsxs("span",{className:"ml-auto flex items-center gap-1 text-accent",children:[e.jsx("span",{className:"h-1.5 w-1.5 animate-pulse rounded-full bg-accent"})," live"]})]}),e.jsx("div",{ref:s,className:"no-scrollbar flex-1 overflow-y-auto p-3 font-mono text-[12px] leading-relaxed text-ink/85",children:e.jsxs("pre",{className:"whitespace-pre-wrap break-words",children:[t||"Thinking…",e.jsx("span",{className:"ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-accent align-middle"})]})})]})}function U(t){return t.replace(/^\s*import[^\n]*\n/gm,"").replace(/^\s*export\s+default\s+function/m,"function").replace(/^\s*export\s+default\s+/m,"const __default = ").replace(/^\s*export\s+/gm,"")}function Be(t,s,n){return`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${t.replace(/</g,"&lt;")}</title>
<script src="https://cdn.tailwindcss.com"><\/script>
<script src="https://unpkg.com/react@18/umd/react.production.min.js" crossorigin><\/script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" crossorigin><\/script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
</head>
<body>
<div id="root"></div>
<script type="text/babel" data-presets="react,typescript" data-type="module">
const { useState, useEffect, useMemo, useRef, useCallback } = React
function useTailwindCDN() {}
${s}
${n}
ReactDOM.createRoot(document.getElementById('root')).render(<App />)
<\/script>
</body>
</html>`}const Fe={website:{label:"Website",icon:me,tint:"#6366f1"},app:{label:"App",icon:Ne,tint:"#10b981"},component:{label:"Component",icon:ve,tint:"#f59e0b"}},Ue=["A SaaS landing page for an AI note-taking app","A pomodoro timer app with start, pause and reset","A pricing table component with three tiers"];function _e(t){const s=Math.round((Date.now()-t)/6e4);if(s<1)return"just now";if(s<60)return`${s}m ago`;const n=Math.round(s/60);if(n<24)return`${n}h ago`;const l=Math.round(n/24);return l<7?`${l}d ago`:new Date(t).toLocaleDateString()}function Ve(){const t=de(a=>{var d;return(d=a.user)==null?void 0:d.uid}),[s,n]=r.useState([]),[l,o]=r.useState([]),[m,c]=r.useState(null),[u,N]=r.useState(""),[x,f]=r.useState(!1);r.useEffect(()=>{if(t)return n(I(t)),o(ce(t)),je(()=>n(I(t)))},[t]);const w=r.useMemo(()=>s.find(a=>a.id===m)??null,[s,m]);async function g(){const a=u.trim();if(!a||x||!t)return;S("medium"),f(!0),N("");const d=l.find(k=>/engineer|developer|builder|design|code|web/i.test(`${k.role} ${k.name}`))??l[0],p=(d==null?void 0:d.id)??"askai",h=d?`${d.name}${d.role?` (${d.role})`:""}`:"AskAI Builder",E=Te(a),C=Se({title:a.length>40?a.slice(0,40)+"…":a,description:a,agentId:p,agentName:h,kind:E,prompt:a});O(t,C);try{const[{files:k},T]=await Promise.all([V(a),Me(a)]);O(t,{...C,title:T||C.title,files:k})}catch{}finally{f(!1)}}function v(a){t&&(S("light"),Ce(t,a))}return w&&t?e.jsx(ze,{app:w,uid:t,onBack:()=>c(null),onChange:()=>n(I(t))}):e.jsxs("div",{className:`mx-auto w-full max-w-4xl px-4 py-6 ${H?"pb-32":"pb-12"}`,children:[e.jsxs("div",{className:"mb-5",children:[e.jsxs("div",{className:"mb-1 flex items-center gap-2",children:[e.jsx("span",{className:"accent-gradient-bg flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-sm",children:e.jsx(pe,{size:18})}),e.jsx("h1",{className:"text-2xl font-bold text-ink",children:"Apps"}),s.length>0&&e.jsxs("span",{className:"ml-auto rounded-full bg-accent/15 px-2.5 py-1 text-xs font-bold text-accent",children:[s.length," built"]})]}),e.jsx("p",{className:"text-sm text-muted",children:"Websites and apps your agents build for you — each one runs live with editable source."})]}),e.jsxs("div",{className:"glass mb-6 rounded-2xl border border-line/60 p-3",children:[e.jsxs("div",{className:"mb-2 flex items-center gap-2 text-sm font-semibold text-ink",children:[e.jsx(z,{size:16,className:"text-accent"}),"Have an agent build me a website or app"]}),e.jsxs("div",{className:"glass-strong flex items-end gap-2 rounded-xl border border-line/60 p-2",children:[e.jsx("textarea",{value:u,onChange:a=>N(a.target.value),onKeyDown:a=>{a.key==="Enter"&&!a.shiftKey&&(a.preventDefault(),g())},rows:2,placeholder:"Describe what you want built — e.g. a landing page for my coffee shop…",className:"no-scrollbar max-h-32 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-ink outline-none placeholder:text-muted"}),x?e.jsx("button",{disabled:!0,className:"pressable flex h-11 w-11 items-center justify-center rounded-full bg-ink text-bg opacity-70","aria-label":"Building",children:e.jsx(W,{size:14,fill:"currentColor"})}):e.jsx("button",{onClick:g,disabled:!u.trim(),className:"accent-gradient-bg pressable flex h-11 w-11 items-center justify-center rounded-full text-white disabled:opacity-40","aria-label":"Build",children:e.jsx(q,{size:18})})]}),x&&e.jsxs("div",{className:"mt-2 flex items-center gap-2 text-xs font-medium text-muted",children:[e.jsx("span",{className:"bg-gradient-to-r from-accent via-ink to-accent bg-[length:200%_100%] bg-clip-text text-transparent animate-shimmer",children:"An agent is building your app…"}),e.jsxs("span",{className:"flex gap-1",children:[e.jsx("span",{className:"h-1.5 w-1.5 animate-pulse-dot rounded-full bg-accent"}),e.jsx("span",{className:"h-1.5 w-1.5 animate-pulse-dot rounded-full bg-accent [animation-delay:0.2s]"}),e.jsx("span",{className:"h-1.5 w-1.5 animate-pulse-dot rounded-full bg-accent [animation-delay:0.4s]"})]})]}),!x&&e.jsx("div",{className:"mt-2 flex flex-wrap gap-1.5",children:Ue.map(a=>e.jsx("button",{onClick:()=>N(a),className:"pressable rounded-full border border-line/60 px-2.5 py-1 text-xs text-muted hover:text-ink",children:a},a))})]}),s.length===0?e.jsxs("div",{className:"glass rounded-2xl border border-line/60 px-4 py-12 text-center",children:[e.jsx(K,{size:28,className:"mx-auto text-accent"}),e.jsx("p",{className:"mt-3 font-semibold text-ink",children:"No apps yet"}),e.jsx("p",{className:"mt-1 text-sm text-muted",children:"Ask an agent above to build your first website or app."})]}):e.jsx("div",{className:"grid grid-cols-1 gap-3 sm:grid-cols-2",children:e.jsx(te,{initial:!1,children:s.map((a,d)=>e.jsx(Ye,{app:a,index:d,onOpen:()=>{S("select"),c(a.id)},onDelete:()=>v(a.id)},a.id))})})]})}function Ye({app:t,index:s,onOpen:n,onDelete:l}){const o=Fe[t.kind],m=o.icon;return e.jsxs(_.div,{layout:!0,initial:{opacity:0,y:12},animate:{opacity:1,y:0},exit:{opacity:0,scale:.96},transition:{delay:Math.min(s*.04,.3),type:"spring",stiffness:260,damping:26},className:"glass group flex flex-col overflow-hidden rounded-2xl border border-line/60",children:[e.jsxs("button",{onClick:n,className:"pressable apps-thumb relative flex h-32 w-full items-center justify-center overflow-hidden text-left",style:{"--thumb":o.tint},"aria-label":`Open ${t.title}`,children:[e.jsx("span",{className:"apps-thumb-mark text-4xl font-black opacity-90",children:t.title.trim().charAt(0).toUpperCase()||"A"}),e.jsxs("span",{className:"absolute left-3 top-3 flex items-center gap-1 rounded-full bg-black/35 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white backdrop-blur",children:[e.jsx(m,{size:11})," ",o.label]})]}),e.jsxs("div",{className:"flex min-w-0 flex-1 flex-col p-3.5",children:[e.jsxs("button",{onClick:n,className:"min-w-0 text-left",children:[e.jsx("h3",{className:"truncate font-semibold text-ink",children:t.title}),e.jsx("p",{className:"mt-0.5 line-clamp-2 text-sm text-muted",children:t.description||"No description"})]}),e.jsxs("div",{className:"mt-auto flex items-center gap-2 pt-3",children:[e.jsxs("span",{className:"flex min-w-0 items-center gap-1.5 text-xs text-muted",children:[e.jsx(z,{size:12,className:"shrink-0 text-accent"}),e.jsx("span",{className:"truncate",children:t.agentName})]}),e.jsx("span",{className:"ml-auto shrink-0 text-[11px] text-muted",children:_e(t.updatedAt)})]}),e.jsxs("div",{className:"mt-3 flex items-center gap-2",children:[e.jsx("button",{onClick:n,className:"accent-gradient-bg pressable flex min-h-[44px] flex-1 items-center justify-center rounded-xl text-sm font-bold text-white shadow-sm",children:"Open"}),e.jsx("button",{onClick:l,className:"pressable flex min-h-[44px] w-11 items-center justify-center rounded-xl border border-line/60 text-muted hover:text-red-400","aria-label":`Delete ${t.title}`,children:e.jsx(ue,{size:16})})]})]})]})}export{Ve as default};
