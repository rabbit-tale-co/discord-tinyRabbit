import { bunnyLog } from 'bunny-log'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { Glob } from 'bun'

interface FileInfo {
	path: string
	lines: number
	size: number
}

export class CodebaseAnalyzer {
	private directory: string
	private filePattern: string
	private fileInfos: FileInfo[] = []

	constructor(directory: string, filePattern = '**/*.{ts,js}') {
		this.directory = directory
		this.filePattern = filePattern
	}

	// Private method to count lines of code in a file.
	// It ignores empty lines and comments.
	private countLines(filePath: string): number {
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

	// Private method to get the file size in bytes.
	private getFileSize(filePath: string): number {
		return statSync(filePath).size
	}

	// Analyze the codebase in the given directory using the file pattern.
	// The analysis is processed in parallel and results are output to the console.
	public async analyze(): Promise<void> {
		const glob = new Glob(this.filePattern)
		const files = Array.from(glob.scanSync(this.directory))
		const startTime = performance.now()

		this.fileInfos = new Array(files.length)

		await Promise.all(
			files.map(async (file, i) => {
				const filePath = join(this.directory, file)
				const lines = this.countLines(filePath)
				const size = this.getFileSize(filePath)
				this.fileInfos[i] = { path: file, lines, size }
			})
		)

		// Sort by lines descending
		this.fileInfos.sort((a, b) => b.lines - a.lines)

		// Display results in a table
		console.table(
			this.fileInfos.map((file) => ({
				path: file.path,
				lines: file.lines,
				size: `${(file.size / 1024).toFixed(2)} KB`,
			}))
		)

		// Calculate the total lines and size
		const totalLines = this.fileInfos.reduce((sum, f) => sum + f.lines, 0)
		const totalSize = this.fileInfos.reduce((sum, f) => sum + f.size, 0)

		// Display the results
		bunnyLog.server(`Total lines: ${totalLines}`)
		bunnyLog.server(`Total size: ${(totalSize / 1024).toFixed(2)} KB`)
		bunnyLog.server(`Time: ${(performance.now() - startTime).toFixed(2)}ms`)
	}
}

// To run the analysis, you can instantiate and call it like so:
;(async () => {
	const analyzer = new CodebaseAnalyzer('./src')
	await analyzer.analyze()
})()
