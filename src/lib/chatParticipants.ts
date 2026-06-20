// Extra agents invited into the current chat. The lead agent coordinates them
// and delegates parts of the task; their personas get woven into the system
// prompt (see useChat) so replies are a real multi-agent collaboration without
// changing the chat engine. Scoped to the active chat; cleared when it changes.
import type { Agent } from './agents'

let invited: Agent[] = []
let scopeKey = ''
const EVT = 'askai-participants-changed'

export function setInvitedScope(key: string) {
  if (key !== scopeKey) {
    scopeKey = key
    invited = []
    fire()
  }
}

export function getInvitedAgents(): Agent[] {
  return invited
}

export function inviteAgent(a: Agent) {
  if (!invited.some((x) => x.id === a.id)) {
    invited = [...invited, a]
    fire()
  }
}

export function removeInvitedAgent(id: string) {
  invited = invited.filter((a) => a.id !== id)
  fire()
}

export function clearInvited() {
  if (invited.length) {
    invited = []
    fire()
  }
}

export function onParticipantsChanged(cb: () => void): () => void {
  window.addEventListener(EVT, cb)
  return () => window.removeEventListener(EVT, cb)
}

function fire() {
  window.dispatchEvent(new Event(EVT))
}

/** Build the delegation block appended to the lead agent's system prompt. */
export function delegationPrompt(lead: { name: string }, team: Agent[]): string {
  if (!team.length) return ''
  const roster = team
    .map((a) => `- ${a.name} (${a.role || 'Specialist'}): ${(a.personality || a.about || '').slice(0, 200)}`)
    .join('\n')
  const first = team[0]
  return `\n\n--- YOUR TEAM IN THIS CHAT ---
You, ${lead.name}, are the Chief of Staff leading this chat. You are NOT a solo assistant — you ORCHESTRATE the specialist agents below. The user expects you to delegate, exactly like Nebula's chief-of-staff does.

Team you can assign work to:
${roster}

HOW TO RESPOND (required):
1. Open with ONE short line as ${lead.name} acknowledging the request and saying which teammate(s) you're putting on it (e.g. "On it — bringing in ${first?.name} (${first?.role || 'Specialist'}) for this.").
2. Then let each assigned specialist answer in their OWN labeled section, written in their voice and expertise. Start each on its own line as a bold header exactly like:
   **${first?.name} (${first?.role || 'Specialist'}):**
   …their actual work/answer…
3. If more than one teammate is relevant, give each their own labeled section.
4. Close with a brief ${lead.name} wrap-up only if it adds something.

RULES:
- When the user explicitly asks you to "assign / get / bring in" a kind of agent, you MUST route the task to that teammate and let THEM deliver the substantive answer — do not just answer it yourself under your own name.
- Never say you're the only agent, that you "can't delegate", or that the teammates aren't real. They are your team; assign and present their work.`
}
