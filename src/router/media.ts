import { setCorsHeaders } from '../utils/cors.js'
import { randomUUIDv7 } from 'bun'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import supabase from '@/db/supabase.js'
import { spawn } from 'child_process'

const BUCKET = 'social-art'

async function resolveFfmpegCmd(): Promise<string> {
  const fromEnv = (process.env.FFMPEG_PATH || '').trim()
  if (fromEnv) return fromEnv
  return 'ffmpeg'
}

async function ensureFolderCleared(prefix: string) {
  try {
    const { data: listed } = await supabase.storage.from(BUCKET).list(prefix)
    if (listed && listed.length > 0) {
      const toRemove = listed.map((it) => `${prefix}/${it.name}`)
      await supabase.storage.from(BUCKET).remove(toRemove)
    }
  } catch {}
}

async function uploadPublic(pathKey: string, body: Blob, contentType: string) {
  const { error } = await supabase.storage.from(BUCKET).upload(pathKey, body, { upsert: true, contentType })
  if (error) throw new Error(error.message)
  const publicUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${pathKey}`
  return publicUrl
}

async function convertGifToWebM(inputBuf: Buffer, crop?: { x: number; y: number; w: number; h: number }) {
  const cmd = await resolveFfmpegCmd()
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'media-'))
  const inPath = path.join(tmpDir, 'in.gif')
  const outPath = path.join(tmpDir, 'out.webm')
  await fs.writeFile(inPath, inputBuf)
  const args: string[] = ['-y', '-i', inPath]
  if (crop && crop.w > 0 && crop.h > 0) {
    args.push('-vf', `crop=${Math.floor(crop.w)}:${Math.floor(crop.h)}:${Math.floor(crop.x)}:${Math.floor(crop.y)}`)
  }
  args.push('-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '32', '-pix_fmt', 'yuv420p', '-an', outPath)
  await new Promise<void>((resolve, reject) => {
    const p = spawn(cmd, args)
    let stderr = ''
    p.stderr.on('data', (d) => { try { stderr += String(d) } catch {} })
    p.on('error', reject)
    p.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg exited ${code}: ${stderr}`))
    })
  })
  const out = await fs.readFile(outPath)
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  return out
}

async function handleProfile(req: Request, kind: 'avatar' | 'cover'): Promise<Response> {
  try {
    const form = await req.formData()
    const userId = String(form.get('userId') || '')
    const f = form.get('file')
    const cropX = Number(form.get('crop_x') || 0)
    const cropY = Number(form.get('crop_y') || 0)
    const cropW = Number(form.get('crop_w') || 0)
    const cropH = Number(form.get('crop_h') || 0)
    if (!userId) return new Response(JSON.stringify({
      error: 'Missing userId' }), { status: 400, headers: setCorsHeaders()
    })
    if (!(f instanceof File)) return new Response(JSON.stringify({
      error: 'No file'
    }), {
      status: 400, headers: setCorsHeaders()
    })

    const ab = await f.arrayBuffer()
    const input = Buffer.from(ab)
    const isGif = (f.type || '').toLowerCase() === 'image/gif' || (f.name || '').toLowerCase().endsWith('.gif')

    const uid = randomUUIDv7()
    const folder = kind === 'avatar' ? `avatar/${userId}` : `covers/${userId}`
    await ensureFolderCleared(folder)

    let pathKey = ''
    let mime = ''
    if (isGif) {
      const out = await convertGifToWebM(input, cropW > 0 && cropH > 0 ? { x: cropX, y: cropY, w: cropW, h: cropH } : undefined)
      pathKey = `${folder}/${kind}-${uid}.webm`
      mime = 'video/webm'
      const url = await uploadPublic(pathKey, new Blob([out], { type: mime }), mime)
      // update profile row
      if (kind === 'avatar') await supabase.from('profiles').update({ avatar_url: url }).eq('user_id', userId)
      else await supabase.from('profiles').update({ cover_url: url }).eq('user_id', userId)
      return new Response(JSON.stringify({ path: pathKey, mime }), { headers: setCorsHeaders() })
    }

    // Non-GIF: pass-through upload
    const ext = (f.name.split('.').pop() || 'bin').toLowerCase()
    pathKey = `${folder}/${kind}-${uid}.${ext}`
    mime = f.type || 'application/octet-stream'
    const url = await uploadPublic(pathKey, new Blob([input], { type: mime }), mime)
    if (kind === 'avatar') await supabase.from('profiles').update({ avatar_url: url }).eq('user_id', userId)
    else await supabase.from('profiles').update({ cover_url: url }).eq('user_id', userId)
    return new Response(JSON.stringify({ path: pathKey, mime }), { headers: setCorsHeaders() })
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: setCorsHeaders() })
  }
}

export async function mediaRouter(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const pathName = url.pathname

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: setCorsHeaders() })

  if (req.method === 'GET' && pathName === '/media/health') {
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: setCorsHeaders({ 'Content-Type': 'application/json' }) })
  }

  if (req.method === 'POST' && pathName.startsWith('/media/profile/avatar')) {
    return await handleProfile(req, 'avatar')
  }
  if (req.method === 'POST' && pathName.startsWith('/media/profile/cover')) {
    return await handleProfile(req, 'cover')
  }

  return new Response('Not Found', { status: 404, headers: setCorsHeaders() })
}
