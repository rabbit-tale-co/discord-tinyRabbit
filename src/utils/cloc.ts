#!/usr/bin/env bun
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Glob } from 'bun'
import { bunnyLog } from 'bunny-log'
import { cc, ptr } from 'bun:ffi'

const LANGUAGES_JSON_PATH = './src/utils/languages.json'
const languages: Record<string, LangDef> = JSON.parse(
	readFileSync(LANGUAGES_JSON_PATH, 'utf-8')
).languages

// Compile C code with simplified dynamic language support
const {
	symbols: { add_language, analyze_file, get_language_name },
} = cc({
	source: './src/utils/cloc.c',
	symbols: {
		add_language: {
			args: ['ptr', 'ptr', 'ptr', 'ptr', 'ptr'],
			returns: 'void',
		},
		analyze_file: {
			args: ['ptr', 'ptr', 'i32', 'ptr'],
			returns: 'void',
		},
		get_language_name: {
			args: ['ptr', 'ptr', 'i32'],
			returns: 'void',
		},
	},
})

interface LangDef {
	name?: string
	extensions?: string[]
	filenames?: string[]
	line_comment?: string | string[]
	multi_line_comments?: [string, string][]
}

// Initialize C language database
let langDataInitialized = false
function initLanguageDatabase() {
	if (langDataInitialized) return

	let count = 0
	for (const [key, langDef] of Object.entries(languages)) {
		const name = langDef.name || key

		// Extensions (comma-separated)
		const extensions = (langDef.extensions || []).join(',')

		// Line comment (use first one if array)
		const lineComment = Array.isArray(langDef.line_comment)
			? langDef.line_comment[0] || ''
			: langDef.line_comment || ''

		// Block comments (use first one if multiple)
		const blockComments = langDef.multi_line_comments?.[0]
		const blockStart = blockComments?.[0] || ''
		const blockEnd = blockComments?.[1] || ''

		// Add language to C database (convert strings to C pointers)
		add_language(
			ptr(new TextEncoder().encode(`${name}\0`)),
			ptr(new TextEncoder().encode(`${extensions}\0`)),
			ptr(new TextEncoder().encode(`${lineComment}\0`)),
			ptr(new TextEncoder().encode(`${blockStart}\0`)),
			ptr(new TextEncoder().encode(`${blockEnd}\0`))
		)
		count++
	}

	langDataInitialized = true
	bunnyLog.log(
		'language',
		`🗣️ Initialized ${count} language definitions from JSON`
	)
}

// --------- FORMATTERS ---------
const fmt = (n: number) => n.toLocaleString()
const fmtBytes = (b: number): string => {
	if (b < 1024) return `${b} B`
	if (b < 1048576) return `${(b / 1024).toFixed(2)} KB`
	if (b < 1073741824) return `${(b / 1048576).toFixed(2)} MB`
	return `${(b / 1073741824).toFixed(2)} GB`
}

// --------- MAIN ANALYZER ---------
export async function analyzeCodebase(dir = './dist') {
	const start = performance.now()

	// Initialize language database from JSON
	initLanguageDatabase()

	const files = [...new Glob('**/*').scanSync(dir)]
	bunnyLog.log(
		'analysis',
		`⚡ Ultra-fast analyzing ${files.length} files with parallel C-powered counting (${Object.keys(languages).length} languages supported)`
	)

	// OPTIMIZATION 1: Lightweight filtering (only skip obvious non-code files)
	const candidateFiles = files.filter((file) => {
		// Quick check - only filter out obviously non-code files to avoid over-filtering
		const lowerFile = file.toLowerCase()
		return !(
			lowerFile.endsWith('.png') ||
			lowerFile.endsWith('.jpg') ||
			lowerFile.endsWith('.gif') ||
			lowerFile.endsWith('.pdf') ||
			lowerFile.endsWith('.zip') ||
			lowerFile.endsWith('.exe') ||
			lowerFile.includes('node_modules') ||
			lowerFile.includes('.git/')
		)
	})

	bunnyLog.log(
		'analysis',
		`📁 Quick-filtered to ${candidateFiles.length} candidate files (${files.length - candidateFiles.length} obvious non-code files skipped)`
	)

	if (candidateFiles.length === 0) {
		bunnyLog.log('warning', 'No valid files found to analyze')
		return
	}

	// OPTIMIZATION 2: Fast synchronous file reading (async overhead not worth it)
	const validFiles: { path: string; buffer: Uint8Array }[] = []

	for (const file of candidateFiles) {
		try {
			const buffer = readFileSync(join(dir, file))
			validFiles.push({ path: file, buffer })
		} catch {
			// Skip files that can't be read
		}
	}

	if (validFiles.length === 0) {
		bunnyLog.log('warning', 'No valid files could be read')
		return
	}

	// OPTIMIZATION 3: Maximum efficiency with smart caching and buffer reuse
	const langStats = new Map<string, [number, number, number, number, number]>()

	// Pre-allocate reusable buffers for maximum performance
	const pathBuffer = new Uint8Array(512)
	const langBuffer = new Uint8Array(64)
	const resultBuffer = new Int32Array(5)
	const encoder = new TextEncoder()
	const decoder = new TextDecoder()

	// Cache encoded paths to avoid repeated encoding
	const pathEncodingCache = new Map<string, Uint8Array>()

	for (const { path, buffer } of validFiles) {
		// Use cached encoded path or create new one
		let encodedPath = pathEncodingCache.get(path)
		if (!encodedPath) {
			encodedPath = encoder.encode(`${path}\0`)
			pathEncodingCache.set(path, encodedPath)
		}

		// Efficiently reuse path buffer
		pathBuffer.fill(0) // Clear previous data
		pathBuffer.set(encodedPath.slice(0, 511))

		// Get language name using buffer reuse
		get_language_name(pathBuffer, langBuffer, 64)

		// Fast language extraction
		const nameEnd = langBuffer.indexOf(0)
		const langName = decoder.decode(
			langBuffer.slice(0, nameEnd > 0 ? nameEnd : 64)
		)

		if (langName === 'Unknown') continue

		// Analyze file with efficient buffer reuse
		analyze_file(pathBuffer, buffer, buffer.length, resultBuffer)

		// Efficient result aggregation
		if (!langStats.has(langName)) {
			langStats.set(langName, [0, 0, 0, 0, 0])
		}

		const stats = langStats.get(langName)
		if (!stats) continue
		stats[0]++ // files
		stats[1] += resultBuffer[0] // lines
		stats[2] += resultBuffer[1] // code
		stats[3] += resultBuffer[2] // comments
		stats[4] += resultBuffer[4] // size
	}

	// Display results
	bunnyLog.log(
		'analysis',
		'📊 Code Analysis Results (Dynamic C-powered + JSON)'
	)

	let totalF = 0
	let totalL = 0
	let totalC = 0
	let totalM = 0
	let totalS = 0

	const table = Array.from(langStats.entries())
		.map(([lang, stats]) => {
			const [files, lines, code, comments, size] = stats
			totalF += files
			totalL += lines
			totalC += code
			totalM += comments
			totalS += size

			return {
				Language: lang,
				Files: fmt(files),
				Lines: fmt(lines),
				Code: fmt(code),
				Comments: fmt(comments),
				Size: fmtBytes(size),
			}
		})
		.sort(
			(a, b) =>
				Number.parseInt(b.Code.replace(/,/g, '')) -
				Number.parseInt(a.Code.replace(/,/g, ''))
		)

	table.push({
		Language: 'Total',
		Files: fmt(totalF),
		Lines: fmt(totalL),
		Code: fmt(totalC),
		Comments: fmt(totalM),
		Size: fmtBytes(totalS),
	})

	bunnyLog.table(table)

	const pct = totalL ? 100 / totalL : 0
	const totalB = totalL - totalC - totalM // blanks
	bunnyLog.log('summary', `Files: ${fmt(totalF)}`)
	bunnyLog.log('summary', `Lines: ${fmt(totalL)}`)
	bunnyLog.log(
		'summary',
		`Code: ${fmt(totalC)} (${(totalC * pct).toFixed(1)}%)`
	)
	bunnyLog.log(
		'summary',
		`Comments: ${fmt(totalM)} (${(totalM * pct).toFixed(1)}%)`
	)
	bunnyLog.log(
		'summary',
		`Blanks: ${fmt(totalB)} (${(totalB * pct).toFixed(1)}%)`
	)
	bunnyLog.log('summary', `Size: ${fmtBytes(totalS)}`)
	bunnyLog.log('summary', `Languages: ${langStats.size}`)
	bunnyLog.log('timing', `Time: ${(performance.now() - start).toFixed(2)}ms`)
	bunnyLog.log(
		'success',
		`⚡ Optimized analysis completed! (${Object.keys(languages).length} languages available, efficient caching + buffer reuse)`
	)
}

// Cleanup function
process.on('exit', () => {
	if (langDataInitialized) {
		// cleanup_languages()
	}
})

// ---- CLI Entrypoint ----
if (import.meta.main) {
	const dir = Bun.argv[2] || './dist'
	await analyzeCodebase(dir)
}
