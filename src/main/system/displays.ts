import { screen } from 'electron'
import type { DetailedInfo } from '../../shared/types'

export function getDisplays(): DetailedInfo['displays'] {
  const primaryId = screen.getPrimaryDisplay().id
  return screen.getAllDisplays().map((display) => {
    const pixels = screen.dipToScreenRect(null, display.bounds)
    return {
      id: String(display.id),
      model: display.label.trim(),
      main: display.id === primaryId,
      resX: pixels.width,
      resY: pixels.height,
      hz: Number.isFinite(display.displayFrequency) && display.displayFrequency > 0 ? display.displayFrequency : 0,
      connection: ''
    }
  })
}
