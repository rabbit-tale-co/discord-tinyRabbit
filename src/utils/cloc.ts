import { bunnyLog } from 'bunny-log'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { Glob } from 'bun'

/**
 * Count the lines of code in a file
 * @param filePath - The path to the file
 * @returns The number of lines of code in the file
 */
function countLines(filePath: string): number {
	const content = readFileSync(filePath, 'utf8')
	let count = 0
	let pos = 0

	// Count the lines of code in the file
	while (pos < content.length) {
		const next = content.indexOf('\n', pos)
		const line = next !== -1 ? content.slice(pos, next) : content.slice(pos)

		// Check if the line is not empty and does not start with a comment
		if (
			line.trim() &&
			!line.trim().startsWith('//') &&
			!line.trim().startsWith('/*') &&
			!line.trim().startsWith('*')
		) {
			count++
		}

		// Move to the next line
		pos = next === -1 ? content.length : next + 1
	}

	// Return the number of lines of code in the file
	return count
}

/**
 * Get the size of a file
 * @param filePath - The path to the file
 * @returns The size of the file in bytes
 */
function getFileSize(filePath: string): number {
	return statSync(filePath).size
}

// Scan the src directory for all files
const glob = new Glob('**/*.{ts,js}')
const files = Array.from(glob.scanSync('./src'))
const fileInfos = new Array(files.length)

// Start the timer
const startTime = performance.now()

// Process files in parallel using Bun's thread pool
await Promise.all(
	files.map(async (file, i) => {
		const filePath = join('./src', file)
		const lines = countLines(filePath)
		const size = getFileSize(filePath)
		fileInfos[i] = { path: file, lines, size }
	})
)

// Sort by lines descending
fileInfos.sort((a, b) => b.lines - a.lines)

// Display results
console.table(
	fileInfos.map((file) => ({
		path: file.path,
		lines: file.lines,
		size: `${(file.size / 1024).toFixed(2)} KB`,
	}))
)

// Calculate the total lines and size
const totalLines = fileInfos.reduce((sum, f) => sum + f.lines, 0)
const totalSize = fileInfos.reduce((sum, f) => sum + f.size, 0)

// Display the results
bunnyLog.server(`Total lines: ${totalLines}`)
bunnyLog.server(`Total size: ${(totalSize / 1024).toFixed(2)} KB`)
bunnyLog.server(`Time: ${(performance.now() - startTime).toFixed(2)}ms`)
