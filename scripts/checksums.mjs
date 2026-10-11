import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const folder = join(dirname(fileURLToPath(import.meta.url)), '..', 'release')
const files = ['Pkaizen-Forge-Setup.exe', 'Pkaizen-Forge-Setup.exe.blockmap', 'latest.yml']
const lines = []
for (const name of files) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(join(folder, name))) hash.update(chunk)
  lines.push(`${hash.digest('hex')}  ${name}`)
}
await writeFile(join(folder, 'SHA256SUMS.txt'), `${lines.join('\n')}\n`, 'utf8')
console.log(`SHA256SUMS.txt: ${files.length} artifacts hashed`)
