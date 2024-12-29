import { bunnyLog } from 'bunny-log'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { Glob } from 'bun'

function countLines(filePath: string): number {
	const content = readFileSync(filePath, 'utf8')
	return content
		.split('\n')
		.filter((line) => line.trim() && !line.trim().startsWith('//')).length
}

function getFileSize(filePath: string): number {
	return statSync(filePath).size
}

interface FileInfo {
	path: string
	lines: number
	size: string
}

const fileInfos: FileInfo[] = []
const glob = new Glob('**/*.{ts,js}')
;(async () => {
	const startTime = performance.now()

	for await (const file of glob.scan('./src')) {
		const filePath = join('./src', file)
		fileInfos.push({
			path: file,
			lines: countLines(filePath),
			size: `${(getFileSize(filePath) / 1024).toFixed(2)} KB`,
		})
	}

	// Sortuj pliki według liczby linii (malejąco)
	fileInfos.sort((a, b) => b.lines - a.lines)

	// Wyświetl tabelkę
	console.table(fileInfos)

	const totalLines = fileInfos.reduce((sum, file) => sum + file.lines, 0)
	const totalSize = fileInfos.reduce(
		(sum, file) => sum + Number.parseFloat(file.size),
		0
	)
	bunnyLog.server(`Total lines of code: ${totalLines}`)
	bunnyLog.server(`Total size of files: ${totalSize.toFixed(2)} KB`)

	const endTime = performance.now()
	const executionTime = (endTime - startTime).toFixed(2)
	bunnyLog.server(`Execution time: ${executionTime} ms`)
})()
