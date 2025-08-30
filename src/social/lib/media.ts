import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'path'
import { spawn } from 'node:child_process'
import { S3Client, write, env } from 'bun'

const S3_BUCKET = env.SOCIAL_S3_BUCKET as string
const S3_ENDPOINT = env.SOCIAL_S3_ENDPOINT as string
const S3_ACCESS_KEY = env.SOCIAL_S3_ACCESS_KEY as string
const S3_SECRET_KEY = env.SOCIAL_S3_SECRET_KEY as string

export const s3 = new S3Client({
  accessKeyId: S3_ACCESS_KEY,
  secretAccessKey: S3_SECRET_KEY,
  bucket: S3_BUCKET,
  endpoint: S3_ENDPOINT,
  acl: 'public-read-write',
})

export function s3PublicUrl(key: string): string {
  return `${S3_ENDPOINT}/${S3_BUCKET}/${key}`
}

export async function s3PutBuffer(key: string, buf: Buffer, contentType: string) {
  const file = s3.file(key)
  await write(file, new Blob([buf], { type: contentType }))
  return { key, url: s3PublicUrl(key), contentType }
}

export async function resolveFfmpegCmd(): Promise<string> {
  const fromEnv = (process.env.FFMPEG_PATH || '').trim()
  if (fromEnv) return fromEnv
  return 'ffmpeg'
}

async function runFfmpeg(args: string[], tmpDir: string) {
  const cmd = await resolveFfmpegCmd()
  await new Promise<void>((resolve, reject) => {
    const p = spawn(cmd, args)
    let stderr = ''
    p.stderr.on('data', (d) => { try { stderr += String(d) } catch {} })
    p.on('error', (e) => reject(e))
    p.on('close', (code) => { code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr}`)) })
  })
}

export async function convertGifToWebM(inputBuf: Buffer, crop?: { x: number; y: number; w: number; h: number }) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'social-'))
  const inPath = path.join(tmpDir, 'in.gif')
  const outPath = path.join(tmpDir, 'out.webm')
  await fs.writeFile(inPath, inputBuf)
  const args: string[] = ['-y', '-i', inPath]
  if (crop && crop.w > 0 && crop.h > 0) args.push('-vf', `crop=${Math.floor(crop.w)}:${Math.floor(crop.h)}:${Math.floor(crop.x)}:${Math.floor(crop.y)}`)
  args.push('-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '32', '-pix_fmt', 'yuv420p', '-an', outPath)
  await runFfmpeg(args, tmpDir)
  const out = await fs.readFile(outPath)
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  return out
}

export async function convertImageToWebP(inputBuf: Buffer, crop?: { x: number; y: number; w: number; h: number }) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'social-'))
  const inPath = path.join(tmpDir, 'in.img')
  const outPath = path.join(tmpDir, 'out.webp')
  await fs.writeFile(inPath, inputBuf)
  const args: string[] = ['-y', '-i', inPath]
  if (crop && crop.w > 0 && crop.h > 0) args.push('-vf', `crop=${Math.floor(crop.w)}:${Math.floor(crop.h)}:${Math.floor(crop.x)}:${Math.floor(crop.y)}`)
  args.push('-c:v', 'libwebp', '-q:v', '80', outPath)
  await runFfmpeg(args, tmpDir)
  const out = await fs.readFile(outPath)
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  return out
}

export async function transcodeToWebM(inputBuf: Buffer) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'social-'))
  const inPath = path.join(tmpDir, 'in.bin')
  const outPath = path.join(tmpDir, 'out.webm')
  await fs.writeFile(inPath, inputBuf)
  const args: string[] = ['-y', '-i', inPath, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '32', '-pix_fmt', 'yuv420p', '-an', outPath]
  await runFfmpeg(args, tmpDir)
  const out = await fs.readFile(outPath)
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  return out
}
