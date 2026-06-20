/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GROQ_API_KEY?: string
  readonly VITE_OPENROUTER_API_KEY?: string
  readonly VITE_NVIDIA_BASE?: string
  readonly VITE_NVIDIA_API_KEY?: string
  readonly VITE_RIPOAI_PROXY_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
