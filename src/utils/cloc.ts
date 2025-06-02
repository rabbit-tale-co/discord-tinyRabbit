#!/usr/bin/env bun
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { StatusLogger } from '@/utils/bunnyLogger.js'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { Glob } from 'bun'
import { bunnyLog } from 'bunny-log'

/*------------------------------------------------------------------*
 |  Type helpers (tiny but silences all “unknown” complaints)       |
 *------------------------------------------------------------------*/
const cast = <T>(x: unknown): T => x as T

interface LangDef {
  name?: string
  extensions?: string[]
  filenames?: string[]
  line_comment?: string | string[]
  multi_line_comments?: [string, string][]
}
type LangInfo = [string, string | undefined, string | undefined, string | undefined]

const ld: Record<string, LangDef> = cast<{ languages: Record<string, LangDef> }>(
  require('./languages.json')
).languages

/*------------------------------------------------------------------*/
const extMap = new Map<string, LangInfo>()
const fileMap = new Map<string, LangInfo>()
let initDone = false

function init() {
  if (initDone) return
  for (const k in ld) {
    const v = ld[k]
    const e = v.extensions ?? []
    const lc = Array.isArray(v.line_comment) ? v.line_comment[0] : v.line_comment
    const mc = v.multi_line_comments?.[0]
    const lang: LangInfo = [v.name ?? k, lc, mc?.[0], mc?.[1]]
    for (let i = 0; i < e.length; i++) extMap.set(e[i].toLowerCase(), lang)
    if (v.filenames) {
      for (let i = 0; i < v.filenames.length; i++) fileMap.set(v.filenames[i].toLowerCase(), lang)
    }
  }
  bunnyLog.hex('analysis', '#00d4aa').hex('summary', '#5865f2').hex('timing', '#ff9500')
  initDone = true
}

/*------------------------------------------------------------------*
 |  Language detection (unchanged)                                  |
 *------------------------------------------------------------------*/
const detectLang = (p: string): LangInfo | undefined => {
  let lastSlash = -1,
    lastDot = -1
  for (let i = p.length - 1; i >= 0; i--) {
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
 |  Ultra-tight counter (unchanged)                                 |
 *------------------------------------------------------------------*/
const countLines = (p: string, lang: LangInfo): [number, number, number, number, number] => {
  const buf = readFileSync(p)
  const len = buf.length
  const size = statSync(p).size
  if (!len) return [1, 0, 0, 1, size]

  const lc = lang[1],
    bs = lang[2],
    be = lang[3]
  const lcLen = lc?.length ?? 0,
    bsLen = bs?.length ?? 0,
    beLen = be?.length ?? 0

  let lines = 1,
    code = 0,
    comments = 0,
    blanks = 0,
    i = 0
  let inBlock = false,
    lineStart = true,
    isEmpty = true

  const lcCodes = lc ? Uint8Array.from(lc, (c) => c.charCodeAt(0)) : undefined
  const bsCodes = bs ? Uint8Array.from(bs, (c) => c.charCodeAt(0)) : undefined
  const beCodes = be ? Uint8Array.from(be, (c) => c.charCodeAt(0)) : undefined

  while (i < len) {
    const c = buf[i]

    if (c === 10) {
      if (inBlock) comments++
      else if (isEmpty) blanks++
      else code++
      lines++
      lineStart = true
      isEmpty = true
      i++
      continue
    }

    if (lineStart && (c === 32 || c === 9)) {
      i++
      continue
    }

    if (lineStart) {
      lineStart = false

      if (inBlock && beCodes && c === beCodes[0] && i + beLen <= len) {
        let match = true
        for (let j = 1; j < beLen; j++) if (buf[i + j] !== beCodes[j]) { match = false; break }
        if (match) {
          inBlock = false
          i += beLen
          isEmpty = false
          continue
        }
      }

      if (!inBlock) {
        if (lcCodes && c === lcCodes[0] && i + lcLen <= len) {
          let match = true
          for (let j = 1; j < lcLen; j++) if (buf[i + j] !== lcCodes[j]) { match = false; break }
          if (match) {
            comments++
            while (i < len && buf[i] !== 10) i++
            continue
          }
        }

        if (bsCodes && c === bsCodes[0] && i + bsLen <= len) {
          let match = true
          for (let j = 1; j < bsLen; j++) if (buf[i + j] !== bsCodes[j]) { match = false; break }
          if (match) {
            inBlock = true
            i += bsLen
            if (beCodes) {
              for (let j = i; j <= len - beLen; j++) {
                if (buf[j] === 10) break
                if (buf[j] === beCodes[0]) {
                  let end = true
                  for (let k = 1; k < beLen; k++) if (buf[j + k] !== beCodes[k]) { end = false; break }
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

    if (c !== 32 && c !== 9) isEmpty = false
    i++
  }

  if (inBlock) comments++
  else if (isEmpty) blanks++
  else code++

  return [lines, code, comments, blanks, size]
}

/*------------------------------------------------------------------*/
const processBatch = (
  files: string[],
  dir: string,
  start: number,
  end: number
): [string, [number, number, number, number, number]][] => {
  const results: [string, [number, number, number, number, number]][] = []
  for (let i = start; i < end; i++) {
    const file = files[i]
    const lang = detectLang(file)
    if (!lang) continue
    try {
      results.push([lang[0], countLines(join(dir, file), lang)])
    } catch {
      /* ignore unreadables */
    }
  }
  return results
}

/*------------------------------------------------------------------*/
const fmt = (n: number) => n.toLocaleString()
const fmtBytes = (b: number): string =>
  b < 1024
    ? b + ' B'
    : b < 1048576
    ? (b / 1024).toFixed(2) + ' KB'
    : b < 1073741824
    ? (b / 1048576).toFixed(2) + ' MB'
    : (b / 1073741824).toFixed(2) + ' GB'

/*------------------------------------------------------------------*/
export class CodebaseAnalyzer {
  constructor(
    private dir: string,
    private pattern =
      '**/*.{ts,js,tsx,jsx,py,go,rs,cpp,c,h,hpp,java,kt,swift,rb,php,cs,html,css,scss,sass,less,sql,sh,bash,zsh,fish,ps1,bat,cmd,yml,yaml,json,xml,md,txt,zig}'
  ) {
    init()
  }

  async analyze() {
    const start = performance.now()
    const files = [...new Glob(this.pattern).scanSync(this.dir)]
    StatusLogger.success(`🔍 Analyzing ${files.length} files`)

    const cpu = navigator?.hardwareConcurrency || 4
    const batch = Math.max(16, Math.ceil(files.length / cpu))
    const runs: Promise<[string, [number, number, number, number, number]][]>[] = []

    for (let i = 0; i < files.length; i += batch)
      runs.push(Promise.resolve(processBatch(files, this.dir, i, Math.min(i + batch, files.length))))

    const batches = await Promise.all(runs)

    const langStats = new Map<string, [number, number, number, number, number]>()
    let totalF = 0,
      totalL = 0,
      totalC = 0,
      totalM = 0,
      totalB = 0,
      totalS = 0

    for (const batch of batches) {
      for (const [lang, [l, c, m, b, s]] of batch) {
        const acc = langStats.get(lang) ?? [0, 0, 0, 0, 0]
        acc[0]++
        acc[1] += l
        acc[2] += c
        acc[3] += m
        acc[4] += s
        langStats.set(lang, acc)

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

/*------------------------------------------------------------------*/
if (import.meta.main) await new CodebaseAnalyzer('./src').analyze()
