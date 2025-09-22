import * as fs from 'node:fs/promises'
import * as os from 'os'
import * as path from 'node:path'
import { spawn } from 'node:child_process'
import { S3Client, write, env } from 'bun'

const getEnv = (k: string): string => {
  const v = (env as Record<string, string | undefined>)[k]
  return (v ?? '').trim()
}

const S3_BUCKET = getEnv('SOCIAL_S3_BUCKET') || getEnv('S3_BUCKET')
const S3_ENDPOINT = (getEnv('SOCIAL_S3_ENDPOINT') || getEnv('S3_ENDPOINT')).replace(/\/$/, '')
const S3_ACCESS_KEY = getEnv('SOCIAL_S3_ACCESS_KEY') || getEnv('S3_ACCESS_KEY')
const S3_SECRET_KEY = getEnv('SOCIAL_S3_SECRET_KEY') || getEnv('S3_SECRET_KEY')

export const s3 = new S3Client({
  accessKeyId: S3_ACCESS_KEY,
  secretAccessKey: S3_SECRET_KEY,
  bucket: S3_BUCKET,
  region: getEnv('SOCIAL_S3_REGION') || getEnv('S3_REGION') || 'auto',
  endpoint: S3_ENDPOINT,
  virtualHostedStyle: true,
  acl: 'public-read-write',
})

export async function s3PutBuffer(key: string, buf: Buffer, contentType: string) {
  const file = s3.file(key)
  await write(file, new Blob([buf], { type: contentType }))
  return { key, contentType }
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
  args.push('-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '31', '-pix_fmt', 'yuv420p', '-an', outPath)
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
  args.push('-c:v', 'libwebp', '-q:v', '100', '-lossless', '1', outPath)
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
  const args: string[] = ['-y', '-i', inPath, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '31', '-pix_fmt', 'yuv420p', outPath]
  await runFfmpeg(args, tmpDir)
  const out = await fs.readFile(outPath)
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  return out
}

export async function transcodeAudioToOgg(inputBuf: Buffer) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'social-'))
  const inPath = path.join(tmpDir, 'in.bin')
  const outPath = path.join(tmpDir, 'out.ogg')
  await fs.writeFile(inPath, inputBuf)
  const args: string[] = ['-y', '-i', inPath, '-c:a', 'libopus', '-b:a', '128k', outPath]
  await runFfmpeg(args, tmpDir)
  const out = await fs.readFile(outPath)
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  return out
}

export async function generateThumbnail(inputBuf: Buffer, isAudio: boolean = false) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'social-'))
  const inPath = path.join(tmpDir, 'in.bin')
  const outPath = path.join(tmpDir, 'thumbnail.webp')
  await fs.writeFile(inPath, inputBuf)
  
  // For audio files, generate a waveform thumbnail
  const args: string[] = ['-y', '-i', inPath]
  
  if (isAudio) {
    // Generate waveform visualization for audio
    args.push('-filter_complex', 'showwavespic=s=640x240:colors=#3498db', '-frames:v', '1')
  } else {
    // For video, extract a frame from 1 second in
    args.push('-ss', '00:00:01', '-vframes', '1')
  }
  
  args.push('-c:v', 'libwebp', '-q:v', '90', outPath)
  
  try {
    await runFfmpeg(args, tmpDir)
    const out = await fs.readFile(outPath)
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    return out
  } catch (error) {
    // If thumbnail generation fails, return null
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    return null
  }
}
