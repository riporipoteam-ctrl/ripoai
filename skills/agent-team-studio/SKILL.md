---
name: agent-team-studio
description: Design and orchestrate teams of AI agents inside OpenClaw. Use when the user wants many agents, delegated roles, internal review loops, multi-agent dashboards, or sub-agent workflows instead of a single assistant turn.
---

# Agent Team Studio

Build agent teams that actually fit OpenClaw's runtime instead of pretending every agent is a separate chat bot.

## Core Rules

1. Prefer OpenClaw sub-agents and OpenProse for internal teamwork.
2. Keep the public interface simple: one main assistant for Telegram, many internal workers behind it.
3. When the user wants "lots of agents", define roles, handoff rules, and outputs before spawning work.
4. Use structured tools like `llm-task` for classification, routing, scoring, and schema-shaped outputs.

## What To Build

- Agent rosters with clear roles such as planner, researcher, builder, reviewer, designer, and operator.
- Internal workflows where sub-agents research, critique, or draft in parallel.
- Web dashboards or control panels when the user wants to see many agents working at once.
- Meeting-style interfaces as websites, not as fake Telegram bot identities.

## Telegram Reality

- One Telegram bot token gives one bot identity.
- OpenClaw can coordinate many internal agents behind that one bot.
- A true Telegram group full of separate agents would need separate bot accounts and tokens, plus manual Telegram setup.
- Do not promise that a bot can autonomously create and populate a full Telegram agent swarm from one token.

## Execution Pattern

- Start with a small role graph.
- Spawn only the agents needed for the task.
- Summarize child results back into one coherent answer.
- If the user wants a persistent multi-agent experience, build a web interface or workspace artifacts for it.
