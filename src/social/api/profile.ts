import { setCorsHeaders } from '@/utils/cors.js'
import { randomUUIDv7 } from 'bun'
import { write } from 'bun'
import { convertGifToWebM, convertImageToWebP, s3 } from '@/social/lib/media.js'
import { APILogger, bunnyLog } from '@/utils/bunnyLogger.js'

async function handleProfile(req: Request, kind: 'avatar' | 'cover'): Promise<Response> {
  const endpoint = `/social/v1/profile/${kind}`
  APILogger.request(req.method, endpoint)
  try {
    const form = await req.formData()
    const userId = String(form.get('userId') || '')
    const f = form.get('file')
    const cropX = Number(form.get('crop_x') || 0)
    const cropY = Number(form.get('crop_y') || 0)
    const cropW = Number(form.get('crop_w') || 0)
    const cropH = Number(form.get('crop_h') || 0)
    if (!userId) return new Response(JSON.stringify({ error: 'Missing userId' }), { status: 400, headers: setCorsHeaders({ 'Content-Type': 'application/json' }) })
    if (!(f instanceof File)) return new Response(JSON.stringify({ error: 'No file' }), { status: 400, headers: setCorsHeaders({ 'Content-Type': 'application/json' }) })

    bunnyLog.log('api', `profile ${kind} upload: userId=${userId} name=${(f as File).name} type=${(f as File).type} size=${(f as File).size}`)

    const ab = await (f as File).arrayBuffer()
    const input = Buffer.from(ab)
    const isGif = ((f as File).type || '').toLowerCase() === 'image/gif' || ((f as File).name || '').toLowerCase().endsWith('.gif')
    const uid = randomUUIDv7()
    const folder = kind === 'avatar' ? `avatar/${userId}` : `covers/${userId}`

    if (isGif) {
      const out = await convertGifToWebM(input, cropW > 0 && cropH > 0 ? { x: cropX, y: cropY, w: cropW, h: cropH } : undefined)
      const key = `${folder}/${kind}-${uid}.webm`
      const file = s3.file(key)
      await write(file, new Blob([out], { type: 'video/webm' }))
      APILogger.response(200, endpoint)
      return new Response(JSON.stringify({ path: key, mime: 'video/webm' }), { headers: setCorsHeaders({ 'Content-Type': 'application/json' }) })
    }

    const outImg = await convertImageToWebP(input, cropW > 0 && cropH > 0 ? { x: cropX, y: cropY, w: cropW, h: cropH } : undefined)
    const key = `${folder}/${kind}-${uid}.webp`
    const file = s3.file(key)
    await write(file, new Blob([outImg], { type: 'image/webp' }))
    APILogger.response(200, endpoint)
    return new Response(JSON.stringify({ path: key, mime: 'image/webp' }), { headers: setCorsHeaders({ 'Content-Type': 'application/json' }) })
  } catch (error) {
    APILogger.error(error as Error, endpoint)
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500, headers: setCorsHeaders({ 'Content-Type': 'application/json' }) })
  }
}

export async function profileAvatar(req: Request) { return handleProfile(req, 'avatar') }
export async function profileCover(req: Request) { return handleProfile(req, 'cover') }
