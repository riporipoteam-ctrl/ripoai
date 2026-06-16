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
  return `\n\n--- TEAM IN THIS CHAT ---\nYou, ${lead.name}, are the lead. You have these specialist agents available and should DELEGATE the relevant parts of the user's request to them, then synthesize a single coherent answer. When a specialist contributes, label their part on its own line like "**${team[0]?.name} (${team[0]?.role || 'Specialist'}):** …".\nTeam:\n${roster}\nCoordinate them, assign each the part that fits their expertise, and present the combined result. Do not claim you are the only agent available.`
}
