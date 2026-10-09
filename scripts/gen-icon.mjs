import sharp from 'sharp'
import { mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
mkdirSync(join(root, 'build'), { recursive: true })

const svg = join(root, 'resources', 'icon.svg')
await sharp(svg, { density: 300 }).resize(512, 512).png().toFile(join(root, 'build', 'icon.png'))
await sharp(svg, { density: 300 }).resize(256, 256).png().toFile(join(root, 'build', 'icon-256.png'))
console.log('Icônes générées dans build/')
