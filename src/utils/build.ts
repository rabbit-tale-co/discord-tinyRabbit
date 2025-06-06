#!/usr/bin/env bun
import { $ } from 'bun'
import { existsSync } from 'node:fs'
import { mkdir, copyFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

console.log('🤖 Building Discord Bot...')

// Clean and create dist directory
if (existsSync('dist')) {
	console.log('🧹 Cleaning previous build...')
	await $`rm -rf dist`
}
await mkdir('dist', { recursive: true })

console.log('📦 Building TypeScript files for production...')

// Build the main server file (production build) - exclude Discord.js from bundling
await $`bun build src/server.ts --outdir ./dist --target bun --sourcemap --external discord.js --external @discordjs/rest --external @discordjs/builders`

// Build the deploy-commands script (production build) - exclude Discord.js from bundling
await $`bun build src/deploy-commands.ts --outdir ./dist --target bun --sourcemap --external discord.js --external @discordjs/rest --external @discordjs/builders`

console.log('📁 Copying essential files...')

// Copy package.json and other necessary files
const essentialFiles = ['package.json', 'bun.lockb']
for (const file of essentialFiles) {
	if (existsSync(file)) {
		await copyFile(file, join('dist', file))
		console.log(`📄 Copied ${file}`)
	}
}

// Create start script for production
const startScript = `#!/usr/bin/env bun
// Production start script
import "./server.js";
`

await writeFile('dist/start.js', startScript)

console.log('✅ Build completed successfully!')
console.log('📁 Output directory: dist/')
console.log('📋 Built files:')
console.log('  - server.js (main Discord bot)')
console.log('  - deploy-commands.js (command deployer)')
console.log('  - start.js (production starter)')
console.log('  - package.json (production dependencies)')
console.log('')
console.log('🚀 To run in production:')
console.log('  cd dist && bun install --production && bun start')
