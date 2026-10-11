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

export const REFERENCE_GAMES = [
  { id: 'cs2', name: 'Counter-Strike 2', preset: 'Medium', chart: 'CS2', cpuSensitive: true },
  { id: 'cyberpunk', name: 'Cyberpunk 2077: Phantom Liberty', preset: 'High', chart: 'CP2077', cpuSensitive: false },
  { id: 'warthunder', name: 'War Thunder', preset: 'Movie', chart: 'WT', cpuSensitive: false }
] as const

// Selected factual observations, not a fitted FPS model. Order: CS2, Cyberpunk, War Thunder.
// Each tuple: 1440p average / 1% low, 4K average / 1% low.
const OBSERVATIONS: Record<string, readonly (readonly [number, number, number, number])[]> = {
  'RTX 5070 Ti': [[479, 296, 332, 157], [124, 109, 67, 58], [378, 307, 226, 204]],
  'RTX 5080': [[504, 302, 368, 188], [146, 124, 80, 66], [403, 321, 250, 227]],
  'RTX 4070 Super': [[437, 238, 272, 113], [100, 88, 48, 42], [324, 284, 175, 153]],
  'RTX 4070': [[394, 221, 234, 104], [81, 67, 37, 32], [273, 226, 149, 131]],
  'RX 7900 XT': [[520, 307, 317, 170], [113, 98, 59, 50], [265, 232, 208, 173]],
  'RX 7800 XT': [[427, 258, 257, 141], [92, 82, 46, 42], [257, 211, 161, 144]]
}

export const SUPPORTED_GPUS = Object.keys(OBSERVATIONS)

export function referenceGpu(model: string, isLaptop: boolean | null): string | null {
  if (isLaptop !== false || /laptop|mobile|max-q|notebook/i.test(model)) return null
  const normalized = model.replace(/™|®/g, '').replace(/^(?:NVIDIA\s+)?GeForce\s+|^NVIDIA\s+|^(?:AMD\s+)?Radeon\s+|^AMD\s+/i, '')
    .trim().replace(/\s+/g, ' ').toLowerCase()
  return SUPPORTED_GPUS.find((gpu) => gpu.toLowerCase() === normalized) ?? null
}

export function referencesFor(model: string, isLaptop: boolean | null, width: number, height: number) {
  const gpu = referenceGpu(model, isLaptop)
  if (!gpu || !((width === 2560 && height === 1440) || (width === 3840 && height === 2160))) return []
  const offset = width === 2560 ? 0 : 2
  return REFERENCE_GAMES.map((game, index) => ({
    ...game, gpu, width, height,
    average: OBSERVATIONS[gpu][index][offset],
    low1: OBSERVATIONS[gpu][index][offset + 1],
    chartUrl: `https://www.techspot.com/articles-info/2955/bench/${game.chart}${offset ? '-4K' : ''}.png`
  }))
}

export function roundedFps(value: number): number {
  return Math.round(value / 5) * 5
}

export function referenceScreenVerdict(average: number, low1: number, hz: number): 'unknown' | 'below' | 'variable' | 'headroom' {
  if (![average, low1, hz].every((value) => Number.isFinite(value) && value > 0)) return 'unknown'
  if (average < hz) return 'below'
  if (low1 < hz) return 'variable'
  return 'headroom'
}
