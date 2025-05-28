import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Gets the package version from the package.json file.
 * @returns {string} The package version.
 */
export default function getPackageVersion(): string {
	// Get the package version from the package.json file
	const packageJsonPath = resolve(process.cwd(), 'package.json')
	const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))

	// Return the package version
	return packageJson.version
}
