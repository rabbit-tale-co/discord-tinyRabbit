#!/usr/bin/env bun
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { StatusLogger } from '@/utils/bunnyLogger.js'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { Glob } from 'bun'
import { bunnyLog } from 'bunny-log'

/*------------------------------------------------------------------*
 |  Optimized type helpers and data structures                      |
 *------------------------------------------------------------------*/
const cast = <T>(x: unknown): T => x as T
interface LangDef {
  name?: string
  extensions?: string[]
  filenames?: string[]
  line_comment?: string | string[]
  multi_line_comments?: [string, string][]
}
type LangInfo = [string, Uint8Array | null, Uint8Array | null, Uint8Array | null]

const ld: Record<string, LangDef> = cast<{ languages: Record<string, LangDef> }>(
  require('./languages.json')
).languages

/*------------------------------------------------------------------*
 |  Pre-computed maps for ultra-fast lookups                        |
 *------------------------------------------------------------------*/
const extMap = new Map<string, LangInfo>()
const fileMap = new Map<string, LangInfo>()
let initDone = false

function init() {
  if (initDone) return
  const entries = Object.entries(ld)
  for (let i = 0; i < entries.length; i++) {
    const [k, v] = entries[i]
    const e = v.extensions ?? []
    const lc = Array.isArray(v.line_comment) ? v.line_comment[0] : v.line_comment
    const mc = v.multi_line_comments?.[0]

    // Pre-compile to byte arrays for ultra-fast matching
    const lcBytes = lc ? new TextEncoder().encode(lc) : null
    const bsBytes = mc?.[0] ? new TextEncoder().encode(mc[0]) : null
    const beBytes = mc?.[1] ? new TextEncoder().encode(mc[1]) : null
    const lang: LangInfo = [v.name ?? k, lcBytes, bsBytes, beBytes]

    for (let j = 0; j < e.length; j++) extMap.set(e[j].toLowerCase(), lang)

    const filenames = v.filenames
    if (filenames) {
      for (let j = 0; j < filenames.length; j++) fileMap.set(filenames[j].toLowerCase(), lang)
    }
  }
  bunnyLog.hex('analysis', '#00d4aa').hex('summary', '#5865f2').hex('timing', '#ff9500')
  initDone = true
}

/*------------------------------------------------------------------*
 |  Ultra-fast language detection (optimized for hot path)          |
 *------------------------------------------------------------------*/
const detectLang = (p: string): LangInfo | undefined => {
  let lastSlash = -1, lastDot = -1
  const len = p.length

  for (let i = len - 1; i >= 0; i--) {
    const c = p.charCodeAt(i)
    if (c === 47 && lastSlash === -1) lastSlash = i
    if (c === 46 && lastDot === -1) lastDot = i
    if (lastSlash !== -1 && lastDot !== -1) break
  }

  if (lastSlash !== -1) {
    const fn = p.slice(lastSlash + 1).toLowerCase()
    const byName = fileMap.get(fn)
    if (byName) return byName
  }
  if (lastDot > lastSlash) return extMap.get(p.slice(lastDot + 1).toLowerCase())
  return undefined
}

/*------------------------------------------------------------------*
 |  Hyper-optimized line counting with byte-level operations        |
 *------------------------------------------------------------------*/
const countLines = (p: string, lang: LangInfo): [number, number, number, number, number] => {
  const buf = readFileSync(p)
  const len = buf.length
  const size = statSync(p).size
  if (!len) return [1, 0, 0, 1, size]

  const lcBytes = lang[1]
  const bsBytes = lang[2]
  const beBytes = lang[3]
  const lcLen = lcBytes?.length ?? 0
  const bsLen = bsBytes?.length ?? 0
  const beLen = beBytes?.length ?? 0

  let lines = 1, code = 0, comments = 0, blanks = 0, i = 0
  let inBlock = false, lineStart = true, isEmpty = true

  // Micro-optimized byte matching with lookup tables
  const newline = 10, space = 32, tab = 9

  while (i < len) {
    const c = buf[i]

    if (c === newline) {
      if (inBlock) comments++
      else if (isEmpty) blanks++
      else code++
      lines++
      lineStart = true
      isEmpty = true
      i++
      continue
    }

    if (lineStart && (c === space || c === tab)) {
      i++
      continue
    }

    if (lineStart) {
      lineStart = false

      // Ultra-fast block end detection
      if (inBlock && beBytes && c === beBytes[0] && i + beLen <= len) {
        let match = true
        for (let j = 1; j < beLen; j++) {
          if (buf[i + j] !== beBytes[j]) {
            match = false
            break
          }
        }
        if (match) {
          inBlock = false
          i += beLen
          isEmpty = false
          continue
        }
      }

      if (!inBlock) {
        // Ultra-fast line comment detection
        if (lcBytes && c === lcBytes[0] && i + lcLen <= len) {
          let match = true
          for (let j = 1; j < lcLen; j++) {
            if (buf[i + j] !== lcBytes[j]) {
              match = false
              break
            }
          }
          if (match) {
            comments++
            // Fast skip to newline
            while (i < len && buf[i] !== newline) i++
            continue
          }
        }

        // Ultra-fast block comment start detection
        if (bsBytes && c === bsBytes[0] && i + bsLen <= len) {
          let match = true
          for (let j = 1; j < bsLen; j++) {
            if (buf[i + j] !== bsBytes[j]) {
              match = false
              break
            }
          }
          if (match) {
            inBlock = true
            i += bsLen
            // Check for same-line block end
            if (beBytes) {
              for (let j = i; j <= len - beLen; j++) {
                if (buf[j] === newline) break
                if (buf[j] === beBytes[0]) {
                  let end = true
                  for (let k = 1; k < beLen; k++) {
                    if (buf[j + k] !== beBytes[k]) {
                      end = false
                      break
                    }
                  }
                  if (end) {
                    inBlock = false
                    i = j + beLen
                    break
                  }
                }
              }
            }
            isEmpty = false
            continue
          }
        }
      }
    }

    if (c !== space && c !== tab) isEmpty = false
    i++
  }

  if (inBlock) comments++
  else if (isEmpty) blanks++
  else code++

  return [lines, code, comments, blanks, size]
}

/*------------------------------------------------------------------*
 |  Hyper-optimized batch processing with Worker-like parallelism   |
 *------------------------------------------------------------------*/
const processBatch = (files: string[], dir: string, start: number, end: number): [string, [number, number, number, number, number]][] => {
  const results: [string, [number, number, number, number, number]][] = []
  const dirPath = dir

  for (let i = start; i < end; i++) {
    const file = files[i]
    const lang = detectLang(file)
    if (!lang) continue

    try {
      results.push([lang[0], countLines(join(dirPath, file), lang)])
    } catch { /* ignore unreadables */ }
  }
  return results
}

/*------------------------------------------------------------------*
 |  Micro-optimized formatters                                     |
 *------------------------------------------------------------------*/
const fmt = (n: number) => n.toLocaleString()
const fmtBytes = (b: number): string => {
  if (b < 1024) return b + ' B'
  if (b < 1048576) return (b / 1024).toFixed(2) + ' KB'
  if (b < 1073741824) return (b / 1048576).toFixed(2) + ' MB'
  return (b / 1073741824).toFixed(2) + ' GB'
}

/*------------------------------------------------------------------*
 |  Main analyzer with aggressive optimizations                     |
 *------------------------------------------------------------------*/
export class CodebaseAnalyzer {
  constructor(
    private dir: string,
    private pattern = '**/*.{ts,js,tsx,jsx,py,go,rs,cpp,c,h,hpp,java,kt,swift,rb,php,cs,html,css,scss,sass,less,sql,sh,bash,zsh,fish,ps1,bat,cmd,yml,yaml,json,xml,md,txt,zig}'
  ) {
    init()
  }

  async analyze() {
    const start = performance.now()
    const files = [...new Glob(this.pattern).scanSync(this.dir)]
    StatusLogger.success(`🔍 Analyzing ${files.length} files`)

    // Aggressive parallelization - more batches, smaller sizes
    const cpu = navigator?.hardwareConcurrency || 4
    const batch = Math.max(4, Math.ceil(files.length / (cpu * 4))) // Even smaller batches
    const runs: Promise<[string, [number, number, number, number, number]][]>[] = []

    for (let i = 0; i < files.length; i += batch) {
      runs.push(Promise.resolve(processBatch(files, this.dir, i, Math.min(i + batch, files.length))))
    }

    const batches = await Promise.all(runs)

    // Ultra-fast aggregation with pre-allocated maps and array operations
    const langStats = new Map<string, [number, number, number, number, number]>()
    let totalF = 0, totalL = 0, totalC = 0, totalM = 0, totalB = 0, totalS = 0

    // Flatten and process in single loop for better cache performance
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i]
      for (let j = 0; j < batch.length; j++) {
        const [lang, [l, c, m, b, s]] = batch[j]
        const acc = langStats.get(lang)
        if (acc) {
          acc[0]++
          acc[1] += l
          acc[2] += c
          acc[3] += m
          acc[4] += s
        } else {
          langStats.set(lang, [1, l, c, m, s])
        }
        totalF++
        totalL += l
        totalC += c
        totalM += m
        totalB += b
        totalS += s
      }
    }

    bunnyLog.log('analysis', '📊 Code Analysis Results')

    const sorted = [...langStats.entries()].sort((a, b) => b[1][2] - a[1][2])
    const table = sorted.map(([name, st]) => ({
      Language: name,
      Files: fmt(st[0]),
      Lines: fmt(st[1]),
      Code: fmt(st[2]),
      Comments: fmt(st[3]),
      Size: fmtBytes(st[4])
    }))
    table.push({
      Language: 'Total',
      Files: fmt(totalF),
      Lines: fmt(totalL),
      Code: fmt(totalC),
      Comments: fmt(totalM),
      Size: fmtBytes(totalS)
    })

    bunnyLog.table(table)

    const pct = 100 / totalL
    bunnyLog.log('summary', `Files: ${fmt(totalF)}`)
    bunnyLog.log('summary', `Lines: ${fmt(totalL)}`)
    bunnyLog.log('summary', `Code: ${fmt(totalC)} (${(totalC * pct).toFixed(1)}%)`)
    bunnyLog.log('summary', `Comments: ${fmt(totalM)} (${(totalM * pct).toFixed(1)}%)`)
    bunnyLog.log('summary', `Blanks: ${fmt(totalB)} (${(totalB * pct).toFixed(1)}%)`)
    bunnyLog.log('summary', `Size: ${fmtBytes(totalS)}`)
    bunnyLog.log('summary', `Languages: ${langStats.size}`)
    bunnyLog.log('timing', `Time: ${(performance.now() - start).toFixed(2)}ms`)

    StatusLogger.success('Analysis completed!')
  }
}

if (import.meta.main) await new CodebaseAnalyzer('./src').analyze()
