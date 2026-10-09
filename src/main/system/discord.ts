import { Client } from '@xhayper/discord-rpc'

// Application créée sur discord.com/developers (nom + images affichés dans le profil).
const CLIENT_ID = '1425912345678901234'

let client: Client | null = null
let connected = false

/** Active la Rich Presence Discord (silencieux si Discord n'est pas lancé). */
export async function initDiscordPresence(): Promise<void> {
  try {
    client = new Client({ clientId: CLIENT_ID })
    client.on('ready', () => {
      connected = true
      void updatePresence('Optimizing PC performance')
    })
    client.on('disconnected', () => {
      connected = false
    })
    await client.login()
  } catch {
    // Discord fermé ou RPC indisponible : on réessaie plus tard, sans bruit.
    setTimeout(() => void initDiscordPresence(), 5 * 60_000)
  }
}

export async function updatePresence(details: string): Promise<void> {
  if (!client || !connected) return
  try {
    await client.user?.setActivity({
      details,
      state: 'FPS boost · drivers · cleanup',
      largeImageKey: 'pkaizen',
      largeImageText: 'Pkaizen Forge — safe & reversible PC optimization',
      startTimestamp: Date.now(),
      buttons: [{ label: 'Get Pkaizen Forge', url: 'https://github.com/sh1wyn/pkaizen-forge' }]
    })
  } catch {
    // présence non critique
  }
}

export function destroyPresence(): void {
  client?.destroy().catch(() => undefined)
  client = null
  connected = false
}
