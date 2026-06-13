import Foundation

/// Master list of user-facing UI strings that get translated for the whole app.
/// Any string wrapped with `store.t("…")` should appear here so it gets
/// translated; unknown strings simply fall back to English.
enum UIStrings {
    static let all: [String] = [
        // Navigation / titles
        "Settings", "Projects", "Agents", "Voice call", "AskAI+", "New chat", "Tools",
        // Settings sections
        "Account", "Personalization", "Language", "Web access", "Appearance", "Model",
        "Notifications & Personalization",
        // Settings content
        "Sign in to sync your chats", "Sign out", "Synced across web, Android & iOS",
        "Response length", "Tone", "Custom instructions",
        "App language", "Auto web search",
        "AskAI replies in this language. “Auto” follows your device language.",
        "AskAI automatically searches the live web when a question needs current info (news, prices, weather, scores…).",
        "Notify when a task finishes", "AI check-ins",
        "AskAI sends a friendly nudge to help with your chats.",
        "Use my location for personalization",
        "System", "Light", "Dark",
        "concise", "balanced", "detailed",
        "professional", "friendly", "playful", "direct",
        "off", "daily", "weekly", "monthly",
        // Greetings / empty chat
        "Up late?", "Good morning.", "Good afternoon.", "Good evening.",
        "What are we making?",
        // Composer placeholders
        "Message AskAI…", "Search the web…", "Describe an image…", "Give OpenClaw a task…",
        // Tools sheet
        "Attach", "Modes", "Talk", "Take photo", "Photo library", "Live camera",
        "Share screen", "Chat", "Web search", "Create image", "OpenClaw Agent",
        "Standard conversation", "Answer with live results from the web",
        "Generate an image from a prompt", "Multi-step work with live web access",
        "Talk to AskAI hands-free", "Let AskAI see through your camera",
        "Let AskAI see your screen across apps", "Live browsing — searches, opens & reads pages",
        "Snap a picture to attach", "Add images from your library",
        // Projects
        "New project", "No projects yet", "Create", "Cancel", "Delete", "Save", "Done",
        "Create a project to start building. It's saved on your device.",
        "Creates a starter web project saved on your device.", "Project name",
        // Agents
        "The team room",
        "Give your agents a task. The best-fit specialist picks it up and delivers.",
        "Give the team a task…",
        // Status
        "Thinking", "Searching the web", "Writing the answer", "Creating image", "Working",
        // Menu
        "Search chats", "Library", "Help", "Upgrade",
    ]
}
