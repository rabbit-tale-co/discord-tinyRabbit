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

// Build the main server file (production build)
await $`bun build src/server.ts --outdir ./dist --target bun --minify --sourcemap --splitting`

// Build the deploy-commands script (production build)
await $`bun build src/deploy-commands.ts --outdir ./dist --target bun --minify --sourcemap`

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

// Create production package.json with only runtime dependencies
const packageJsonContent = await Bun.file('package.json').text()
const packageJson = JSON.parse(packageJsonContent)

const prodPackageJson = {
	name: packageJson.name,
	version: packageJson.version,
	description: packageJson.description,
	type: 'module',
	main: 'server.js',
	scripts: {
		start: 'bun start.js',
		deploy:
			"pm2 start server.js --name discord --log-date-format 'DD-MM' --interpreter ~/.bun/bin/bun",
		stop: 'pm2 stop discord',
		restart: 'pm2 restart discord --time',
	},
	dependencies: packageJson.dependencies,
	author: packageJson.author,
	license: packageJson.license,
}

await writeFile('dist/package.json', JSON.stringify(prodPackageJson, null, 2))

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
