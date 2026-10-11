import type { TweakInfo, TweakState } from '../../../shared/types'

export type OptimizationProfile = 'gaming' | 'desktop' | 'recommended'
export type Exclusion = 'unknown' | 'applied' | 'admin' | 'laptop'

const PROFILE_IDS = {
  gaming: ['gamemode-on'],
  desktop: ['menu-delay', 'transparency-off']
}

export function exclusionFor(
  tweak: TweakInfo, state: TweakState | undefined, isAdmin: boolean, isLaptop: boolean | null
): Exclusion | null {
  if (isLaptop === null || !state?.available) return 'unknown'
  if (state.applied) return 'applied'
  if (tweak.needsAdmin && !isAdmin) return 'admin'
  if (tweak.laptopWarning && isLaptop) return 'laptop'
  return null
}

export function profileSelection(
  profile: OptimizationProfile, tweaks: TweakInfo[], states: Record<string, TweakState>,
  isAdmin: boolean, isLaptop: boolean | null
): string[] {
  return tweaks.filter((tweak) => {
    const included = profile === 'recommended' ? tweak.recommended : PROFILE_IDS[profile].includes(tweak.id)
    return included && exclusionFor(tweak, states[tweak.id], isAdmin, isLaptop) === null
  }).map((tweak) => tweak.id)
}
