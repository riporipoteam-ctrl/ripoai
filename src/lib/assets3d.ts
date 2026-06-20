// Curated catalog of REAL, high-quality 3D models the Projects agent can load.
//
// Hard constraint: the browser sandbox can only load models served with permissive
// CORS (`access-control-allow-origin: *`). Random Sketchfab / Free3D links do NOT
// qualify (no CORS, often gated behind a download/login). The reliable universe is
// `.glb`/`.gltf` files hosted on GitHub and served through jsDelivr, which adds
// CORS for everyone. Every URL below was verified to return 206 + CORS `*`.
//
// When the user wants "3D", we score this catalog against their request and feed
// the best matches into the coding prompt, so the agent loads a real, good-looking
// model instead of a bare wireframe primitive.

export interface Model3D {
  name: string
  url: string
  /** Has built-in animation clips (play via AnimationMixer). */
  animated: boolean
  /** Category + keywords used to match the user's request. */
  tags: string[]
  /** Short hint shown to the model about scale/use. */
  note: string
}

export const CATALOG: Model3D[] = [
  // ── Animated creatures & characters (built-in clips) ──────────────────
  {
    name: 'Fox',
    url: 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Models@master/2.0/Fox/glTF-Binary/Fox.glb',
    animated: true,
    tags: ['fox', 'animal', 'creature', 'pet', 'wildlife', 'nature', 'run', 'walk', 'cute', 'mascot'],
    note: 'Stylised fox with Survey/Walk/Run clips. Scale ~0.025.',
  },
  {
    name: 'Horse',
    url: 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/models/gltf/Horse.glb',
    animated: true,
    tags: ['horse', 'animal', 'gallop', 'run', 'stallion', 'equestrian', 'nature'],
    note: 'Low-poly galloping horse. Scale ~0.018.',
  },
  {
    name: 'Parrot',
    url: 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/models/gltf/Parrot.glb',
    animated: true,
    tags: ['parrot', 'bird', 'fly', 'flying', 'animal', 'tropical', 'wings', 'nature'],
    note: 'Flapping parrot. Scale ~0.02.',
  },
  {
    name: 'Flamingo',
    url: 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/models/gltf/Flamingo.glb',
    animated: true,
    tags: ['flamingo', 'bird', 'fly', 'flying', 'pink', 'tropical', 'elegant', 'nature'],
    note: 'Flying flamingo. Scale ~0.02.',
  },
  {
    name: 'Stork',
    url: 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/models/gltf/Stork.glb',
    animated: true,
    tags: ['stork', 'bird', 'fly', 'flying', 'white', 'nature'],
    note: 'Flying stork. Scale ~0.02.',
  },
  {
    name: 'Soldier',
    url: 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/models/gltf/Soldier.glb',
    animated: true,
    tags: ['soldier', 'human', 'person', 'character', 'walk', 'run', 'idle', 'man', 'people', 'game'],
    note: 'Walking/running human with Idle/Walk/Run clips. Scale ~1.',
  },
  {
    name: 'RobotExpressive',
    url: 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/models/gltf/RobotExpressive/RobotExpressive.glb',
    animated: true,
    tags: ['robot', 'character', 'tech', 'ai', 'mascot', 'cute', 'dance', 'wave', 'jump', 'startup', 'app'],
    note: 'Expressive robot with many clips (Dance, Wave, Jump, Idle…). Scale ~0.5.',
  },
  {
    name: 'BrainStem',
    url: 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@main/Models/BrainStem/glTF-Binary/BrainStem.glb',
    animated: true,
    tags: ['robot', 'cyborg', 'character', 'walk', 'tech', 'sci-fi', 'futuristic'],
    note: 'Walking rigged cyborg. Scale ~1.',
  },
  {
    name: 'CesiumMan',
    url: 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@main/Models/CesiumMan/glTF-Binary/CesiumMan.glb',
    animated: true,
    tags: ['man', 'human', 'person', 'walk', 'character', 'people'],
    note: 'Walking human. Scale ~1.',
  },
  {
    name: 'LittlestTokyo',
    url: 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/models/gltf/LittlestTokyo.glb',
    animated: true,
    tags: ['city', 'tokyo', 'diorama', 'scene', 'street', 'building', 'japan', 'urban', 'travel', 'cars'],
    note: 'Detailed animated city diorama (DRACO-compressed → also add DRACOLoader). Scale ~0.01.',
  },

  // ── Static PBR objects (no clips — rotate/float via code) ─────────────
  {
    name: 'DamagedHelmet',
    url: 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@main/Models/DamagedHelmet/glTF-Binary/DamagedHelmet.glb',
    animated: false,
    tags: ['helmet', 'sci-fi', 'space', 'futuristic', 'tech', 'pbr', 'metal', 'gaming', 'hero', 'product'],
    note: 'Photoreal PBR sci-fi helmet — gorgeous hero object. Scale ~1.5.',
  },
  {
    name: 'FlightHelmet',
    url: 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@main/Models/FlightHelmet/glTF/FlightHelmet.gltf',
    animated: false,
    tags: ['helmet', 'aviation', 'vintage', 'pilot', 'leather', 'pbr', 'product', 'museum'],
    note: 'High-detail vintage flight helmet (multi-file glTF). Scale ~3.',
  },
  {
    name: 'BoomBox',
    url: 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@main/Models/BoomBox/glTF-Binary/BoomBox.glb',
    animated: false,
    tags: ['boombox', 'music', 'audio', 'retro', 'speaker', 'product', 'gadget', 'electronics'],
    note: 'Photoreal retro boombox. Tiny — scale ~80.',
  },
  {
    name: 'ToyCar',
    url: 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@main/Models/ToyCar/glTF-Binary/ToyCar.glb',
    animated: false,
    tags: ['car', 'vehicle', 'auto', 'toy', 'racing', 'transport', 'product'],
    note: 'Glossy clear-coat toy car. Tiny — scale ~120.',
  },
  {
    name: 'MaterialsVariantsShoe',
    url: 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@main/Models/MaterialsVariantsShoe/glTF-Binary/MaterialsVariantsShoe.glb',
    animated: false,
    tags: ['shoe', 'sneaker', 'fashion', 'product', 'ecommerce', 'footwear', 'store', 'nike', 'apparel'],
    note: 'Photoreal sneaker — perfect ecommerce/product hero. Scale ~8.',
  },
  {
    name: 'SheenChair',
    url: 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@main/Models/SheenChair/glTF-Binary/SheenChair.glb',
    animated: false,
    tags: ['chair', 'furniture', 'interior', 'velvet', 'product', 'design', 'home', 'decor'],
    note: 'Velvet sheen chair — great for furniture/interior sites. Scale ~3.',
  },
  {
    name: 'WaterBottle',
    url: 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@main/Models/WaterBottle/glTF-Binary/WaterBottle.glb',
    animated: false,
    tags: ['bottle', 'water', 'drink', 'product', 'beverage', 'metal', 'flask'],
    note: 'Metal water bottle. Tiny — scale ~12.',
  },
  {
    name: 'AntiqueCamera',
    url: 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@main/Models/AntiqueCamera/glTF-Binary/AntiqueCamera.glb',
    animated: false,
    tags: ['camera', 'vintage', 'photography', 'retro', 'product', 'film', 'antique'],
    note: 'Vintage bellows camera. Scale ~6.',
  },
  {
    name: 'Avocado',
    url: 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@main/Models/Avocado/glTF-Binary/Avocado.glb',
    animated: false,
    tags: ['avocado', 'food', 'fruit', 'organic', 'healthy', 'product', 'restaurant', 'green'],
    note: 'Photoreal avocado. Tiny — scale ~30.',
  },
  {
    name: 'Lantern',
    url: 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@main/Models/Lantern/glTF-Binary/Lantern.glb',
    animated: false,
    tags: ['lantern', 'lamp', 'light', 'metal', 'vintage', 'product', 'decor'],
    note: 'Metal lantern. Scale ~0.2.',
  },
  {
    name: 'Duck',
    url: 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Models@master/2.0/Duck/glTF-Binary/Duck.glb',
    animated: false,
    tags: ['duck', 'toy', 'animal', 'cute', 'mascot', 'yellow', 'bath'],
    note: 'Classic rubber duck. Scale ~1.5.',
  },
]

function tokenize(text: string): string[] {
  return (text || '').toLowerCase().match(/[a-z0-9]+/g) ?? []
}

/** Score the catalog against the user's request and return the best matches first. */
export function pickModels(request: string, limit = 6): Model3D[] {
  const words = new Set(tokenize(request))
  const scored = CATALOG.map((m) => {
    let score = 0
    for (const tag of m.tags) {
      for (const w of words) {
        if (tag === w) score += 3
        else if (tag.includes(w) || w.includes(tag)) score += 1
      }
    }
    return { m, score }
  })
  const hits = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score)
  // Always return *something*: if nothing matched, lead with versatile hero models.
  const fallback = ['RobotExpressive', 'DamagedHelmet', 'Fox', 'Soldier', 'MaterialsVariantsShoe', 'LittlestTokyo']
  const chosen = hits.length
    ? hits.map((s) => s.m)
    : fallback.map((n) => CATALOG.find((m) => m.name === n)!).filter(Boolean)
  return chosen.slice(0, limit)
}

/** Build the prompt section: the chosen models + how to load them robustly. */
export function buildAssetPrompt(request: string): string {
  const models = pickModels(request)
  const lines = models.map(
    (m) => `- ${m.name} (${m.animated ? 'ANIMATED — has clips' : 'static — spin/float it yourself'}): ${m.url}\n    ${m.note}`,
  )
  const best = models[0]
  return `REAL 3D ASSETS — pick the BEST match for this request and load it with THREE.GLTFLoader. These .glb/.gltf URLs are verified, free and CORS-enabled (they WILL load in the sandbox; do not invent other URLs):
${lines.join('\n')}

Loading rules (critical so the scene is never empty):
- Use the closest match above. Top pick for this request: ${best.name} → ${best.url}
- If a model is ANIMATED, drive it with THREE.AnimationMixer (mixer.clipAction(gltf.animations[0]).play()) + THREE.Clock. If it is static, animate it yourself: gentle auto-rotate + scroll-scrubbed rotation + a slow float.
- Center & scale the model to fit the viewport (compute its bounding box; use the note's scale hint as a starting point).
- ALWAYS pass an onError callback to loader.load(...). If the model fails, fall back to ${pickModels(request)[1]?.url || best.url} so the hero is never blank.
- For LittlestTokyo (DRACO compressed) also add DRACOLoader: loader.setDRACOLoader(new THREE.DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/js/libs/draco/gltf/')) and include the DRACOLoader script.
- You may also load ANY other model you know of that is hosted on GitHub by using the jsDelivr CORS form: https://cdn.jsdelivr.net/gh/<owner>/<repo>@<ref>/<path>.glb — but ONLY if you are confident the path exists; otherwise use the verified list above.`
}
