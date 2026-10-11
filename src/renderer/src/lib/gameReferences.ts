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

const CYBERPUNK_SOURCE = {
  publisher: 'TechSpot / Hardware Unboxed',
  title: 'Cyberpunk 2077 2.0: Phantom Liberty GPU Benchmark',
  url: 'https://www.techspot.com/review/2743-cyberpunk-phantom-liberty-benchmark/',
  published: '2023-09', verified: '2026-10-11',
  cpu: 'AMD Ryzen 7 7800X3D', memory: '32 GB DDR5-6000 CL30',
  os: null, drivers: 'NVIDIA 537.42 / AMD 23.9.2'
} as const

const ARC_SOURCE = {
  publisher: 'TechSpot / Hardware Unboxed',
  title: 'Intel Arc B580 Review',
  url: 'https://www.techspot.com/review/2935-intel-arc-b580/',
  followUpUrl: 'https://www.techspot.com/review/2940-intel-arc-b580-rereview/',
  published: '2024-12', verified: '2026-10-11',
  cpu: 'AMD Ryzen 7 9800X3D', memory: 'DDR5-6000 CL30',
  os: 'Windows 11 24H2', drivers: 'NVIDIA 566.36 / AMD 24.12.1 / Intel 32.0.101.6319'
} as const

export const REFERENCE_SOURCES = [REFERENCE_SOURCE, COMPARISON_SOURCE, CYBERPUNK_SOURCE, ARC_SOURCE] as const

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

// 1080p, 1440p, 4K average/1% low. Medium preset, native rendering, FSR disabled.
const CYBERPUNK_OBSERVATIONS: Record<string, readonly [number, number, number, number, number, number]> = {
  'RTX 4090': [208, 164, 192, 157, 106, 94],
  'RX 7900 XTX': [218, 177, 158, 133, 87, 77],
  'RTX 4080': [205, 162, 146, 119, 78, 72],
  'RX 7900 XT': [191, 165, 133, 118, 70, 61],
  'RTX 4070 Ti': [184, 154, 124, 113, 65, 56],
  'RTX 3090 Ti': [167, 142, 124, 109, 67, 58],
  'RX 6950 XT': [166, 146, 118, 106, 61, 54],
  'RX 7800 XT': [162, 139, 115, 102, 59, 51],
  'RX 6900 XT': [161, 138, 114, 102, 57, 50],
  'RTX 3090': [162, 136, 113, 95, 61, 53],
  'RX 6800 XT': [150, 133, 106, 95, 55, 48],
  'RTX 3080 Ti': [145, 126, 105, 87, 56, 49],
  'RTX 3080 10GB': [135, 113, 98, 83, 53, 46],
  'RTX 4070': [143, 124, 96, 83, 49, 41],
  'RX 7700 XT': [133, 112, 92, 80, 48, 40],
  'RX 6800': [132, 112, 92, 79, 46, 39],
  'RTX 3070 Ti': [123, 109, 81, 75, 41, 33],
  'RTX 3070': [118, 105, 78, 72, 39, 32],
  'RTX 4060 Ti 8GB': [111, 97, 75, 67, 36, 31],
  'RTX 4060 Ti 16GB': [111, 97, 75, 67, 36, 31],
  'RX 6750 XT': [110, 96, 74, 66, 37, 32],
  'RTX 2080 Ti': [100, 87, 70, 62, 38, 31],
  'RX 6700 XT': [103, 90, 69, 61, 34, 30],
  'RTX 3060 Ti': [96, 84, 64, 55, 33, 29],
  'RX 7600': [95, 83, 62, 53, 30, 26],
  'RTX 4060': [97, 85, 61, 52, 28, 22],
  'GTX 1080 Ti': [81, 71, 56, 49, 30, 26],
  'RX 6650 XT': [87, 77, 55, 48, 26, 20],
  'RX 6600 XT': [85, 75, 53, 46, 25, 19],
  'RTX 3060 12GB': [77, 67, 50, 42, 25, 21],
  'RX 6600': [75, 65, 47, 39, 22, 17],
  'RX 5700 XT': [68, 60, 46, 39, 23, 19],
  'RTX 3050 8GB': [56, 49, 36, 31, 18, 14],
  'RX 6500 XT 4GB': [36, 32, 18, 8, 2, 1]
}

const BUDGET_GAMES = [
  { id: 'cyberpunk', name: 'Cyberpunk 2077: Phantom Liberty', preset: 'High', chart: 'CP2077' },
  { id: 'warthunder', name: 'War Thunder', preset: 'Movie', chart: 'WT' },
  { id: 'hogwarts', name: 'Hogwarts Legacy', preset: 'High', chart: 'HL' },
  { id: 'spider-remastered', name: "Marvel's Spider-Man Remastered", preset: 'Very High', chart: 'Spider' }
] as const

// Same order as BUDGET_GAMES; each tuple is 1080p average/1% low, 1440p average/1% low.
// The review's unspecified RTX 3060 variant is deliberately not assigned to the 12GB model.
const BUDGET_OBSERVATIONS: Record<string, readonly Observation[]> = {
  'RTX 4070': [[129, 93, 81, 67], [365, 298, 273, 226], [106, 72, 83, 53], [191, 137, 141, 97]],
  'RX 7700 XT': [[111, 92, 78, 66], [255, 220, 250, 195], [105, 77, 83, 60], [137, 98, 106, 79]],
  'RTX 4060 Ti 8GB': [[100, 81, 64, 55], [285, 224, 203, 177], [82, 52, 63, 43], [153, 111, 109, 86]],
  'RTX 4060 Ti 16GB': [[100, 81, 64, 55], [286, 224, 205, 179], [83, 60, 66, 44], [153, 111, 109, 86]],
  'RTX 3070': [[98, 77, 67, 57], [282, 239, 213, 177], [122, 75, 76, 47], [144, 99, 108, 85]],
  'Arc B580': [[90, 70, 63, 51], [255, 220, 191, 167], [71, 47, 59, 42], [152, 105, 110, 83]],
  'RX 6700 XT': [[89, 75, 59, 50], [243, 207, 204, 170], [82, 57, 64, 43], [110, 80, 85, 67]],
  'RTX 3060 Ti': [[88, 73, 58, 49], [257, 215, 195, 161], [87, 61, 69, 45], [138, 96, 98, 76]],
  'RX 7600 XT': [[81, 68, 53, 47], [247, 212, 178, 154], [76, 50, 59, 42], [102, 73, 75, 63]],
  'RX 7600': [[81, 68, 53, 47], [244, 210, 172, 151], [76, 50, 59, 42], [102, 73, 75, 63]],
  'RTX 4060': [[78, 64, 49, 41], [238, 204, 165, 135], [70, 45, 53, 36], [90, 68, 77, 58]],
  'Arc A770 16GB': [[73, 63, 54, 46], [210, 171, 160, 134], [61, 40, 50, 34], [109, 79, 86, 69]],
  'RX 6650 XT': [[72, 63, 43, 38], [244, 189, 169, 143], [68, 42, 52, 36], [95, 68, 57, 34]],
  'RX 6600': [[60, 52, 36, 26], [202, 168, 131, 102], [55, 39, 43, 34], [82, 64, 49, 26]]
}

export const REFERENCE_GAMES = [...new Map([...ORIGINAL_GAMES, ...COMPARISON_GAMES, ...BUDGET_GAMES]
  .map(({ id, name }) => [id, { id, name }])).values()]
export const SUPPORTED_GPUS = [...new Set([...Object.keys(OBSERVATIONS), 'RX 9070 XT',
  ...Object.keys(CYBERPUNK_OBSERVATIONS), ...Object.keys(BUDGET_OBSERVATIONS)])]

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

export function referenceGpu(model: string, isLaptop: boolean | null, vramMB?: number): string | null {
  if (isLaptop !== false || /laptop|mobile|max-q|notebook/i.test(model)) return null
  const normalized = model.replace(/™|®|\((?:r|tm)\)/gi, '')
    .replace(/^(?:NVIDIA\s+)?GeForce\s+|^NVIDIA\s+|^(?:AMD\s+)?Radeon\s+|^AMD\s+|^Intel\s+/i, '')
    .replace(/\s+Graphics$/i, '').replace(/\s*[\[(]?\s*(\d+)\s*G(?:B)?[\])]?\s*$/i, ' $1GB')
    .trim().replace(/\s+/g, ' ').toLowerCase()
  const memoryKnown = typeof vramMB === 'number' && Number.isFinite(vramMB) && vramMB > 0
  const candidates = SUPPORTED_GPUS.filter((gpu) => {
    const name = gpu.toLowerCase()
    const memory = name.match(/ (\d+)gb$/)
    if (!memory) return name === normalized
    // Allow a small driver-reserved VRAM deduction, never choose a different memory SKU.
    const matchesMemory = memoryKnown && Math.abs(vramMB - Number(memory[1]) * 1024) <= 256
    return name === normalized ? !memoryKnown || matchesMemory : name.replace(/ \d+gb$/, '') === normalized && matchesMemory
  })
  return candidates.length === 1 ? candidates[0] : null
}

export function referencesFor(model: string, isLaptop: boolean | null, width: number, height: number, vramMB?: number): GameReference[] {
  const gpu = referenceGpu(model, isLaptop, vramMB)
  if (!gpu || !((width === 1920 && height === 1080) || (width === 2560 && height === 1440) || (width === 3840 && height === 2160))) return []
  const offset = width === 2560 ? 0 : 2
  const original = OBSERVATIONS[gpu]
  const rows: GameReference[] = original && width !== 1920 ? ORIGINAL_GAMES.map((game, index) => ({
    ...game, gpu, width, height,
    average: original[index][offset],
    low1: original[index][offset + 1],
    source: REFERENCE_SOURCE,
    scene: 'unspecified',
    chartUrl: `https://www.techspot.com/articles-info/2955/bench/${game.chart}${offset ? '-4K' : ''}.png`
  })) : []
  if (width !== 1920 && (gpu === 'RTX 5070 Ti' || gpu === 'RX 9070 XT')) {
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
  const cyberpunk = CYBERPUNK_OBSERVATIONS[gpu]
  if (cyberpunk) {
    const index = width === 1920 ? 0 : width === 2560 ? 2 : 4
    rows.push({
      id: 'cyberpunk', name: 'Cyberpunk 2077: Phantom Liberty', preset: 'Medium, native (FSR off)',
      gpu, width, height, average: cyberpunk[index], low1: cyberpunk[index + 1],
      source: CYBERPUNK_SOURCE, scene: 'in-game', cpuSensitive: true,
      chartUrl: `https://www.techspot.com/articles-info/2743/bench/Medium_${height}p.png`
    })
  }
  const budget = BUDGET_OBSERVATIONS[gpu]
  if (budget && width !== 3840) {
    const offset = width === 1920 ? 0 : 2
    BUDGET_GAMES.forEach((game, index) => rows.push({
      ...game, gpu, width, height, average: budget[index][offset], low1: budget[index][offset + 1],
      source: ARC_SOURCE, scene: game.id === 'cyberpunk' ? 'in-game' : 'unspecified', cpuSensitive: false,
      chartUrl: `https://www.techspot.com/articles-info/2935/bench/${game.chart}_${height}p.png`
    }))
  }
  const latest = new Map<string, GameReference>()
  for (const row of rows) {
    const key = `${row.id}:${row.preset}`
    const previous = latest.get(key)
    if (!previous || previous.source.published < row.source.published) latest.set(key, row)
  }
  return [...latest.values()]
}

export function roundedFps(value: number): number {
  return value < 5 ? Math.round(value * 10) / 10 : Math.round(value / 5) * 5
}

export function referenceScreenVerdict(average: number, low1: number, hz: number, capFps?: number): 'unknown' | 'below' | 'variable' | 'headroom' | 'capped' {
  if (![average, low1, hz].every((value) => Number.isFinite(value) && value > 0)) return 'unknown'
  if (capFps && Number.isFinite(capFps) && capFps > 0 && hz > capFps) return 'capped'
  if (average < hz) return 'below'
  if (low1 < hz) return 'variable'
  return 'headroom'
}
