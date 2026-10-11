export const REFERENCE_SOURCE = {
  publisher: 'TechSpot / Hardware Unboxed',
  title: 'Nvidia GeForce RTX 5070 Ti Review',
  url: 'https://www.techspot.com/review/2955-nvidia-geforce-rtx-5070-ti/',
  published: '2025-02',
  verified: '2026-10-11',
  cpu: 'AMD Ryzen 7 9800X3D',
  memory: 'DDR5-6000 CL30',
  os: 'Windows 11 24H2',
  drivers: 'NVIDIA 572.42 / AMD 24.12.1'
} as const

const COMPARISON_SOURCE = {
  publisher: 'TechSpot / Hardware Unboxed',
  title: 'Nvidia RTX 5070 Ti vs AMD Radeon 9070 XT: Massive 52 Game Benchmark',
  url: 'https://www.techspot.com/review/3130-geforce-rtx-5070-ti-vs-radeon-rx-9070-xt/',
  published: '2026-05',
  verified: '2026-10-11',
  cpu: 'AMD Ryzen 7 9800X3D',
  memory: 'DDR5-6000 CL30',
  os: 'Windows 11 25H2',
  drivers: 'NVIDIA 596.49 WHQL / AMD 26.5.2 WHQL'
} as const

export const REFERENCE_SOURCES = [REFERENCE_SOURCE, COMPARISON_SOURCE] as const

const ORIGINAL_GAMES = [
  { id: 'cs2', name: 'Counter-Strike 2', preset: 'Medium', chart: 'CS2', cpuSensitive: true },
  { id: 'cyberpunk', name: 'Cyberpunk 2077: Phantom Liberty', preset: 'High', chart: 'CP2077', cpuSensitive: false },
  { id: 'warthunder', name: 'War Thunder', preset: 'Movie', chart: 'WT', cpuSensitive: false },
  { id: 'marvel-rivals', name: 'Marvel Rivals', preset: 'Ultra, Lumen', chart: 'MR', cpuSensitive: false },
  { id: 'hogwarts', name: 'Hogwarts Legacy', preset: 'High', chart: 'Hogwarts', cpuSensitive: false }
] as const

// Factual observations, never fitted or interpolated: 1440p average/1% low, 4K average/1% low.
type Observation = readonly [number, number, number, number]

// Same order as ORIGINAL_GAMES.
const OBSERVATIONS: Record<string, readonly Observation[]> = {
  'RTX 5070 Ti': [[479, 296, 332, 157], [124, 109, 67, 58], [378, 307, 226, 204], [95, 61, 57, 39], [125, 69, 81, 51]],
  'RTX 5080': [[504, 302, 368, 188], [146, 124, 80, 66], [403, 321, 250, 227], [108, 70, 65, 41], [144, 82, 100, 57]],
  'RTX 4070 Super': [[437, 238, 272, 113], [100, 88, 48, 42], [324, 284, 175, 153], [76, 48, 43, 30], [98, 57, 61, 38]],
  'RTX 4070': [[394, 221, 234, 104], [81, 67, 37, 32], [273, 226, 149, 131], [68, 45, 38, 27], [83, 53, 51, 36]],
  'RX 7900 XT': [[520, 307, 317, 170], [113, 98, 59, 50], [265, 232, 208, 173], [83, 59, 47, 36], [147, 92, 81, 60]],
  'RX 7800 XT': [[427, 258, 257, 141], [92, 82, 46, 42], [257, 211, 161, 144], [67, 49, 37, 29], [118, 76, 61, 46]]
}

interface ComparisonGame {
  id: string
  name: string
  chart: string
  scene: 'in-game' | 'built-in'
  cpuSensitive?: boolean
  capFps?: number
  presets: readonly { name: string; nvidia: Observation; amd: Observation }[]
}

const COMPARISON_GAMES: readonly ComparisonGame[] = [
  { id: 'apex', name: 'Apex Legends', chart: 'Apex', scene: 'in-game', capFps: 300, presets: [
    { name: 'Medium / Low', nvidia: [300, 268, 264, 231], amd: [300, 263, 240, 207] },
    { name: 'Maximum', nvidia: [300, 260, 233, 205], amd: [300, 255, 211, 188] }
  ] },
  { id: 'fortnite', name: 'Fortnite', chart: 'Fortnite', scene: 'in-game', cpuSensitive: true, presets: [
    { name: 'Performance Mode', nvidia: [733, 398, 638, 363], amd: [728, 362, 528, 343] },
    { name: 'Epic, Ray Tracing', nvidia: [87, 75, 50, 40], amd: [85, 74, 45, 38] }
  ] },
  { id: 'valorant', name: 'VALORANT', chart: 'Valorant', scene: 'in-game', cpuSensitive: true, presets: [
    { name: 'Medium', nvidia: [697, 470, 686, 457], amd: [633, 440, 632, 401] },
    { name: 'High, MSAA 4x', nvidia: [694, 468, 541, 424], amd: [628, 436, 533, 398] }
  ] },
  { id: 'pubg', name: 'PUBG: Battlegrounds', chart: 'PUBG', scene: 'in-game', presets: [
    { name: 'Medium', nvidia: [334, 155, 212, 142], amd: [326, 191, 192, 166] },
    { name: 'Ultra', nvidia: [267, 144, 153, 111], amd: [234, 158, 133, 116] }
  ] },
  { id: 'rust', name: 'Rust', chart: 'Rust', scene: 'in-game', presets: [
    { name: 'High', nvidia: [154, 81, 99, 57], amd: [144, 65, 78, 44] },
    { name: 'Maximum', nvidia: [138, 76, 95, 54], amd: [118, 69, 66, 42] }
  ] },
  { id: 'rainbow-six', name: "Tom Clancy's Rainbow Six Siege X", chart: 'RSS', scene: 'built-in', presets: [
    { name: 'Medium, 100% Render Scale', nvidia: [370, 304, 199, 169], amd: [348, 290, 181, 160] },
    { name: 'Ultra+', nvidia: [226, 172, 114, 87], amd: [208, 158, 103, 80] }
  ] },
  { id: 'overwatch', name: 'Overwatch', chart: 'OW', scene: 'in-game', presets: [
    { name: 'Medium, DX11', nvidia: [569, 466, 303, 265], amd: [581, 462, 291, 221] },
    { name: 'Epic, DX11', nvidia: [300, 254, 169, 147], amd: [258, 223, 137, 115] }
  ] },
  { id: 'gta-enhanced', name: 'Grand Theft Auto V Enhanced', chart: 'GTA', scene: 'in-game', capFps: 160, presets: [
    { name: 'Very High', nvidia: [163, 143, 139, 122], amd: [162, 143, 121, 108] },
    { name: 'Maximum Ray Tracing', nvidia: [112, 96, 55, 48], amd: [89, 78, 44, 37] }
  ] },
  { id: 'rdr2', name: 'Red Dead Redemption 2', chart: 'RDR', scene: 'built-in', presets: [
    { name: 'High', nvidia: [204, 126, 129, 101], amd: [191, 111, 116, 92] },
    { name: 'Ultra', nvidia: [149, 91, 103, 67], amd: [126, 62, 83, 48] }
  ] },
  { id: 'bg3', name: "Baldur's Gate 3", chart: 'BG3', scene: 'in-game', presets: [
    { name: 'Medium, DX11', nvidia: [185, 164, 111, 100], amd: [171, 152, 104, 91] },
    { name: 'Ultra, DX11', nvidia: [144, 124, 91, 79], amd: [170, 146, 98, 88] }
  ] },
  { id: 'helldivers2', name: 'Helldivers 2', chart: 'Helldivers', scene: 'in-game', presets: [
    { name: 'Medium', nvidia: [161, 141, 104, 92], amd: [162, 143, 98, 86] },
    { name: 'Ultra', nvidia: [124, 97, 82, 70], amd: [133, 101, 85, 74] }
  ] },
  { id: 'forza5', name: 'Forza Horizon 5', chart: 'FH5', scene: 'built-in', presets: [
    { name: 'Ultra', nvidia: [213, 184, 151, 134], amd: [229, 188, 162, 138] },
    { name: 'Maximum', nvidia: [164, 141, 109, 92], amd: [170, 142, 114, 94] }
  ] },
  { id: 'delta-force', name: 'Delta Force', chart: 'Delta', scene: 'in-game', presets: [
    { name: 'Very High', nvidia: [218, 146, 111, 81], amd: [222, 150, 112, 84] },
    { name: 'Ultimate', nvidia: [187, 132, 101, 75], amd: [184, 127, 90, 67] }
  ] },
  { id: 'space-marine2', name: 'Warhammer 40,000: Space Marine 2', chart: 'SM2', scene: 'in-game', cpuSensitive: true, presets: [
    { name: 'Medium', nvidia: [137, 126, 94, 81], amd: [136, 124, 85, 74] },
    { name: 'Ultra', nvidia: [131, 117, 75, 64], amd: [114, 101, 67, 57] }
  ] },
  { id: 'stalker2', name: 'S.T.A.L.K.E.R. 2: Heart of Chornobyl', chart: 'Stalker', scene: 'in-game', presets: [
    { name: 'Medium, 100% Render Scale', nvidia: [95, 57, 56, 38], amd: [87, 51, 50, 34] },
    { name: 'Epic, 100% Render Scale', nvidia: [71, 45, 42, 31], amd: [65, 40, 38, 28] }
  ] }
]

export const REFERENCE_GAMES = [...ORIGINAL_GAMES, ...COMPARISON_GAMES].map(({ id, name }) => ({ id, name }))
export const SUPPORTED_GPUS = [...Object.keys(OBSERVATIONS), 'RX 9070 XT']

export interface GameReference {
  id: string
  name: string
  preset: string
  gpu: string
  width: number
  height: number
  average: number
  low1: number
  chartUrl: string
  source: (typeof REFERENCE_SOURCES)[number]
  scene: ComparisonGame['scene'] | 'unspecified'
  cpuSensitive: boolean
  capFps?: number
}

export function referenceGpu(model: string, isLaptop: boolean | null): string | null {
  if (isLaptop !== false || /laptop|mobile|max-q|notebook/i.test(model)) return null
  const normalized = model.replace(/™|®/g, '').replace(/^(?:NVIDIA\s+)?GeForce\s+|^NVIDIA\s+|^(?:AMD\s+)?Radeon\s+|^AMD\s+/i, '')
    .trim().replace(/\s+/g, ' ').toLowerCase()
  return SUPPORTED_GPUS.find((gpu) => gpu.toLowerCase() === normalized) ?? null
}

export function referencesFor(model: string, isLaptop: boolean | null, width: number, height: number): GameReference[] {
  const gpu = referenceGpu(model, isLaptop)
  if (!gpu || !((width === 2560 && height === 1440) || (width === 3840 && height === 2160))) return []
  const offset = width === 2560 ? 0 : 2
  const original = OBSERVATIONS[gpu]
  const rows: GameReference[] = original ? ORIGINAL_GAMES.map((game, index) => ({
    ...game, gpu, width, height,
    average: original[index][offset],
    low1: original[index][offset + 1],
    source: REFERENCE_SOURCE,
    scene: 'unspecified',
    chartUrl: `https://www.techspot.com/articles-info/2955/bench/${game.chart}${offset ? '-4K' : ''}.png`
  })) : []
  if (gpu === 'RTX 5070 Ti' || gpu === 'RX 9070 XT') {
    for (const game of COMPARISON_GAMES) {
      for (const preset of game.presets) {
        const values = gpu === 'RTX 5070 Ti' ? preset.nvidia : preset.amd
        rows.push({
          id: game.id, name: game.name, preset: preset.name, gpu, width, height,
          average: values[offset], low1: values[offset + 1],
          source: COMPARISON_SOURCE, scene: game.scene,
          cpuSensitive: game.cpuSensitive ?? false, capFps: game.capFps,
          chartUrl: `https://www.techspot.com/articles-info/3130/bench/${game.chart}.png`
        })
      }
    }
  }
  return rows
}

export function roundedFps(value: number): number {
  return Math.round(value / 5) * 5
}

export function referenceScreenVerdict(average: number, low1: number, hz: number, capFps?: number): 'unknown' | 'below' | 'variable' | 'headroom' | 'capped' {
  if (![average, low1, hz].every((value) => Number.isFinite(value) && value > 0)) return 'unknown'
  if (capFps && Number.isFinite(capFps) && capFps > 0 && hz > capFps) return 'capped'
  if (average < hz) return 'below'
  if (low1 < hz) return 'variable'
  return 'headroom'
}
