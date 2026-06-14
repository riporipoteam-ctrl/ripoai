// AskAI Skills — named instruction packs the AI can load and follow, à la
// Claude's skills. A skill is just a prompt/instruction set with a slash trigger.
// Users can create them (via the built-in "Skill Creator") or install one from a
// public URL (e.g. a GitHub raw markdown file). Active skills get injected into
// the system prompt for that turn.

export interface Skill {
  id: string
  name: string
  slug: string
  description: string
  content: string
  source: 'builtin' | 'url' | 'manual'
  url?: string
  createdAt: number
}

const KEY = (uid: string) => `ripoai:${uid}:skills`

// Always-available built-in skill that teaches the AI to author new skills.
export const SKILL_CREATOR: Skill = {
  id: 'builtin-skill-creator',
  name: 'Skill Creator',
  slug: 'skill-creator',
  description: 'Helps you design a new AskAI skill, ready to save.',
  source: 'builtin',
  createdAt: 0,
  content: `You are the AskAI Skill Creator. Help the user design a new "skill" — a reusable instruction pack AskAI can follow.
Ask 1-2 quick questions if the goal is unclear, then output the finished skill in EXACTLY this format inside a fenced \`\`\`skill code block:
\`\`\`skill
name: <Short Name>
slug: <kebab-case-trigger>
description: <one line>
---
<the full instructions the AI should follow when this skill is active — be specific and actionable>
\`\`\`
After the block, tell the user they can tap "Install skill" or copy it into Settings → Skills.`,
}

// Curated, always-available skills shipped with AskAI — usable in any chat (and
// by agents) via their slash trigger, e.g. `/proofread`, or by name. Each is a
// focused instruction pack the model loads for that turn.
const B = (
  name: string,
  slug: string,
  description: string,
  content: string,
): Skill => ({ id: `builtin-${slug}`, name, slug, description, content, source: 'builtin', createdAt: 0 })

export const BUILTIN_SKILLS: Skill[] = [
  B('Proofread', 'proofread', 'Fix grammar, spelling & clarity — keep the voice.',
    'Act as a meticulous copy editor. Correct grammar, spelling, punctuation and awkward phrasing while preserving the author\'s voice, meaning and formatting. Return ONLY the corrected text first. Then, under a short "Changes" heading, list the notable fixes as brief bullets. Do not rewrite content that is already correct.'),
  B('Summarize', 'summarize', 'Tight, faithful summary of any text or link.',
    'Summarize the provided content faithfully and concisely. Lead with a one-sentence TL;DR, then 3-6 bullet points capturing the key facts, arguments or steps — no fluff, no invented details. Preserve names, numbers and dates exactly. Match the summary length to the source: short input → short summary.'),
  B('Explain Like I\'m 5', 'eli5', 'Explain anything in simple, friendly terms.',
    'Explain the topic as if to a curious beginner. Use plain language, short sentences, and one vivid everyday analogy. Avoid jargon; if a technical term is unavoidable, define it in a few words. Keep it warm and encouraging, and end with a one-line "In short:" recap.'),
  B('Code Review', 'code-review', 'Senior-engineer review of code for bugs & quality.',
    'Act as a staff software engineer reviewing the provided code. Identify correctness bugs, security issues, edge cases, performance problems and readability concerns. For each finding: name the issue, why it matters, and a concrete fix (with a short code snippet). Order findings by severity. End with a brief "Looks good" list of what is already done well. Be direct and specific; never invent APIs.'),
  B('Debug Helper', 'debug', 'Diagnose an error and propose a fix.',
    'Act as a debugging partner. Given an error message, stack trace or misbehaving code: (1) state the most likely root cause in one line, (2) explain the reasoning briefly, (3) give the exact fix as a minimal diff or corrected snippet, (4) list 1-2 things to check if that does not resolve it. Ask for the specific missing detail only if you truly cannot proceed.'),
  B('Regex Builder', 'regex', 'Build & explain a regular expression.',
    'Produce a correct regular expression for the user\'s requirement. Output: the regex in a fenced block, a plain-English explanation of each part, 2-3 matching examples and 2-3 non-matching examples, and any flags needed. Note dialect differences (JS/PCRE/Python) if relevant. Prefer clarity over cleverness.'),
  B('SQL Helper', 'sql', 'Write & optimize SQL queries.',
    'Act as a SQL expert. Write a correct, readable query for the request using standard SQL (note the dialect if it matters). Explain what it does in one or two sentences, call out indexes or performance considerations, and warn about anything destructive (UPDATE/DELETE without WHERE). Format SQL in a fenced ```sql block.'),
  B('Email Writer', 'email', 'Draft a clear, professional email.',
    'Write a polished email for the user\'s goal. Ask for the recipient/tone only if essential; otherwise infer a sensible professional-but-friendly tone. Provide a concise subject line, a tight body (greeting, purpose, key points, clear ask, sign-off), and keep it skimmable. Offer a shorter variant if the draft runs long.'),
  B('Translate', 'translate', 'Translate accurately, preserving tone.',
    'Translate the provided text into the requested target language (ask which language only if not given). Preserve meaning, tone, formatting and proper nouns. Produce natural, idiomatic phrasing rather than a literal word-for-word rendering. Output only the translation unless the user asks for notes.'),
  B('Brainstorm', 'brainstorm', 'Generate diverse, high-quality ideas.',
    'Act as a creative strategist. Generate a diverse set of 8-12 distinct ideas for the user\'s prompt, ranging from safe to bold. Group them if helpful, give each a punchy one-line description, and mark your top 3 picks with why. Avoid repetition and obvious filler; favor originality and usefulness.'),
  B('Study Notes', 'study', 'Turn material into clean study notes.',
    'Transform the provided material into clear study notes: a short overview, key concepts as headed bullet points with crisp definitions, any formulas or steps, and a 5-question self-quiz at the end (questions only, answers in a collapsible "Answers" list). Keep it accurate and well-structured for revision.'),
  B('Flashcards', 'flashcards', 'Create Q&A flashcards from any topic.',
    'Create 10-20 high-quality flashcards from the provided topic or text. Format each as a bullet "**Q:** … — **A:** …". Cover the most important, testable facts; keep questions specific and answers concise. Avoid duplicates and trivia. If the source is short, generate fewer but sharper cards.'),
  B('Resume Polish', 'resume', 'Sharpen resume bullets with impact & metrics.',
    'Act as an expert resume coach. Rewrite the provided experience into strong, results-oriented bullet points using action verbs and quantified impact (add a [metric] placeholder where numbers are unknown). Keep each bullet to one line, cut filler and clichés, and match the target role if given. Return the polished bullets, then 2-3 quick tips.'),
  B('Meeting Notes', 'meeting', 'Turn a transcript into notes & action items.',
    'Convert the provided meeting transcript or notes into a clean summary: a one-line purpose, key decisions, discussion highlights as bullets, and a clear "Action items" list formatted as "- [ ] Owner — task — due". Be faithful; do not invent owners or dates. Keep it brief and scannable.'),
  B('Social Post', 'social', 'Write platform-ready social posts.',
    'Write engaging social media copy for the user\'s goal. Ask for the platform only if unclear; otherwise tailor length and tone (X/Twitter: punchy; LinkedIn: professional + insight; Instagram: warm + emoji). Provide the post, a few relevant hashtags, and a strong hook first line. Offer 1-2 alternative angles.'),
  B('Recipe Chef', 'recipe', 'Create a recipe from ingredients or a craving.',
    'Act as a friendly chef. From the user\'s ingredients, cuisine or craving, produce a single appealing recipe: a short intro, an ingredients list with quantities, numbered steps, approximate time and servings, and one tip or variation. Keep it practical and accurate; suggest substitutions for anything unusual.'),
  B('Plan My Day', 'plan', 'Turn goals into a realistic schedule.',
    'Act as a productivity coach. Turn the user\'s tasks and goals into a realistic, time-blocked plan for the day (or stated period). Prioritize ruthlessly (most important first), batch similar work, include short breaks, and flag anything that likely won\'t fit. Present it as a simple time-ordered list with a one-line rationale for the ordering.'),
]

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40)
}

function read(uid: string): Skill[] {
  try {
    const v = localStorage.getItem(KEY(uid))
    return v ? (JSON.parse(v) as Skill[]) : []
  } catch {
    return []
  }
}
function write(uid: string, skills: Skill[]) {
  try {
    localStorage.setItem(KEY(uid), JSON.stringify(skills))
  } catch {
    /* ignore */
  }
}

/** All skills (built-ins first), newest custom on top. The Skill Creator leads,
 *  followed by the curated prebuilt skills, then the user's own. */
export function loadSkills(uid: string): Skill[] {
  const custom = read(uid).sort((a, b) => b.createdAt - a.createdAt)
  // A user-saved skill with the same slug as a builtin overrides it.
  const taken = new Set(custom.map((s) => s.slug))
  const builtins = BUILTIN_SKILLS.filter((s) => !taken.has(s.slug))
  return [SKILL_CREATOR, ...builtins, ...custom]
}

export function saveSkill(uid: string, skill: Skill) {
  const all = read(uid).filter((s) => s.id !== skill.id && s.slug !== skill.slug)
  all.push(skill)
  write(uid, all)
}

export function deleteSkill(uid: string, id: string) {
  write(uid, read(uid).filter((s) => s.id !== id))
}

export function findSkill(uid: string, slug: string): Skill | null {
  const s = slug.toLowerCase()
  return loadSkills(uid).find((x) => x.slug === s) ?? null
}

export function matchSkills(uid: string, query: string): Skill[] {
  const q = query.trim().toLowerCase()
  const all = loadSkills(uid)
  if (!q) return all
  return all.filter(
    (s) => s.slug.includes(q) || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
  )
}

// Parse a `skill` block (the Skill Creator output) into a Skill.
export function parseSkillBlock(text: string): Skill | null {
  const m = text.match(/```skill\s*([\s\S]*?)```/i)
  const body = m ? m[1] : text
  const headerPart = body.split(/\n---\n/)[0] ?? ''
  const content = body.includes('\n---\n') ? body.split(/\n---\n/).slice(1).join('\n---\n').trim() : body.trim()
  const get = (k: string) => headerPart.match(new RegExp(`${k}\\s*:\\s*(.+)`, 'i'))?.[1]?.trim()
  const name = get('name')
  if (!name || !content) return null
  const slug = slugify(get('slug') || name)
  return {
    id: crypto.randomUUID(),
    name,
    slug,
    description: get('description') || '',
    content,
    source: 'manual',
    createdAt: Date.now(),
  }
}

// github.com blocks browser fetches (no CORS); raw.githubusercontent.com allows
// them. Turn any GitHub URL — a file (/blob/), a tree, or a bare repo — into a
// list of candidate RAW urls to try (common skill filenames on main/master).
function candidateUrls(url: string): string[] {
  const u = url.trim().replace(/[)>\].,]+$/, '')
  const blob = u.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/i)
  if (blob) return [`https://raw.githubusercontent.com/${blob[1]}/${blob[2]}/${blob[3]}`]
  const files = ['SKILL.md', 'skill.md', 'README.md', 'readme.md', 'ripoai-skill.md', 'skill.json']
  const tree = u.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/?(.*)$/i)
  if (tree) {
    const dir = tree[4] ? tree[4].replace(/\/$/, '') + '/' : ''
    return files.map((f) => `https://raw.githubusercontent.com/${tree[1]}/${tree[2]}/${tree[3]}/${dir}${f}`)
  }
  const repo = u.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/?$/i)
  if (repo) {
    const out: string[] = []
    for (const br of ['main', 'master']) for (const f of files) out.push(`https://raw.githubusercontent.com/${repo[1]}/${repo[2]}/${br}/${f}`)
    return out
  }
  return [u]
}

/** Fetch a skill from a public URL (raw markdown / skill block) and save it. */
export async function installSkillFromUrl(uid: string, url: string): Promise<Skill> {
  let text = ''
  for (const c of candidateUrls(url)) {
    try {
      const res = await fetch(c)
      if (res.ok) {
        text = (await res.text()).slice(0, 20000)
        break
      }
    } catch {
      /* CORS / network — try the next candidate */
    }
  }
  if (!text.trim())
    throw new Error(
      "Couldn't find a skill at that URL. Use a public GitHub repo, or a raw file link to a SKILL.md / README.md.",
    )
  // Prefer an explicit skill block; else derive from markdown frontmatter/heading.
  let skill = parseSkillBlock(text)
  if (!skill) {
    const fm = text.match(/^---\n([\s\S]*?)\n---/)
    const get = (k: string) =>
      (fm?.[1] || '').match(new RegExp(`${k}\\s*:\\s*(.+)`, 'i'))?.[1]?.replace(/^["']|["']$/g, '').trim()
    const heading = text.match(/^#\s+(.+)$/m)?.[1]?.trim()
    const name = get('name') || get('title') || heading || url.split('/').pop()?.replace(/\.\w+$/, '') || 'Skill'
    skill = {
      id: crypto.randomUUID(),
      name,
      slug: slugify(get('slug') || name),
      description: get('description') || 'Installed skill',
      content: text,
      source: 'url',
      url,
      createdAt: Date.now(),
    }
  } else {
    skill.source = 'url'
    skill.url = url
  }
  saveSkill(uid, skill)
  return skill
}

// Automatically pick the most relevant USER skill for a message (like auto web
// search). Returns null fast when the user has no custom skills. Uses a keyword
// shortcut, then a quick LLM classifier.
export async function autoPickSkill(
  uid: string,
  text: string,
  classify: (model: string, messages: { role: 'system' | 'user' | 'assistant'; content: string }[], opts?: any) => Promise<string>,
): Promise<Skill | null> {
  const custom = loadSkills(uid).filter((s) => s.source !== 'builtin')
  if (!custom.length || text.trim().length < 8) return null
  const lower = text.toLowerCase()
  for (const s of custom) {
    if (lower.includes(s.name.toLowerCase()) || lower.includes(s.slug.replace(/-/g, ' '))) return s
  }
  try {
    const list = custom.map((s, i) => `${i + 1}. ${s.name} — ${s.description}`).join('\n')
    const ans = await classify(
      'llama-3.1-8b-instant',
      [
        {
          role: 'system',
          content:
            'Pick the single most relevant skill for the user message. Reply with ONLY the skill number, or 0 if none clearly applies.',
        },
        { role: 'user', content: `Skills:\n${list}\n\nMessage: "${text.slice(0, 400)}"\n\nNumber:` },
      ],
      { maxTokens: 4, temperature: 0 },
    )
    const n = parseInt((ans.match(/\d+/) || ['0'])[0], 10)
    return n >= 1 && n <= custom.length ? custom[n - 1] : null
  } catch {
    return null
  }
}

// Detect "install this skill: <url>" in a message.
export function detectSkillInstall(text: string): string | null {
  const m = text.match(/install\s+(?:this\s+)?skill\s*:?\s*(https?:\/\/\S+)/i)
  return m ? m[1] : null
}

// Detect a leading slash command "/slug ..." → returns the slug.
export function detectSlashSkill(text: string): string | null {
  const m = text.trim().match(/^\/([a-z0-9][a-z0-9-]*)\b/i)
  return m ? m[1].toLowerCase() : null
}
