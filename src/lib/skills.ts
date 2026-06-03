// RipoAI Skills — named instruction packs the AI can load and follow, à la
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
  description: 'Helps you design a new RipoAI skill, ready to save.',
  source: 'builtin',
  createdAt: 0,
  content: `You are the RipoAI Skill Creator. Help the user design a new "skill" — a reusable instruction pack RipoAI can follow.
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

/** All skills (built-ins first), newest custom on top. */
export function loadSkills(uid: string): Skill[] {
  const custom = read(uid).sort((a, b) => b.createdAt - a.createdAt)
  return [SKILL_CREATOR, ...custom]
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
