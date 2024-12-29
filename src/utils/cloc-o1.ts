import { bunnyLog } from 'bunny-log'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { Glob } from 'bun'

function countLines(filePath: string): number {
	const content = readFileSync(filePath, 'utf8')
	const matches = content.match(/^(?!\s*(\/\/|\/\*|\*\/|$)).+/gm)
	return matches ? matches.length : 0
}

function getFileSize(filePath: string): number {
	return statSync(filePath).size
}

interface FileInfo {
	path: string
	lines: number
	size: number // Size in bytes
}

const fileInfos: FileInfo[] = []
const glob = new Glob('**/*.{ts,js}')
;(async () => {
	const startTime = performance.now()

	const files: string[] = []
	for await (const file of glob.scan('./src')) {
		files.push(file)
	}

	await Promise.all(
		files.map((file) => {
			const filePath = join('./src', file)
			const lines = countLines(filePath)
			const size = getFileSize(filePath)

			fileInfos.push({
				path: file,
				lines,
				size,
			})
		})
	)

	// Sort files by number of lines (descending)
	fileInfos.sort((a, b) => b.lines - a.lines)

	// Display table
	console.table(
		fileInfos.map((file) => ({
			path: file.path,
			lines: file.lines,
			size: `${(file.size / 1024).toFixed(2)} KB`,
		}))
	)

	const totalLines = fileInfos.reduce((sum, file) => sum + file.lines, 0)
	const totalSizeKB = (
		fileInfos.reduce((sum, file) => sum + file.size, 0) / 1024
	).toFixed(2)

	bunnyLog.server(`Total lines of code: ${totalLines}`)
	bunnyLog.server(`Total size of files: ${totalSizeKB} KB`)

	const endTime = performance.now()
	const executionTime = (endTime - startTime).toFixed(2)
	bunnyLog.server(`Execution time: ${executionTime} ms`)
})()
