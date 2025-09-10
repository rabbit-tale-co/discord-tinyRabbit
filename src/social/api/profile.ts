import { setCorsHeaders } from '@/utils/cors.js'
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

    // Validate file type and prevent MIME manipulation
    const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']

    if (!allowedImageTypes.includes(f.type)) {
      return new Response(JSON.stringify({
        error: 'Invalid file type',
        message: 'Only image files are allowed for profile pictures'
      }), { status: 400, headers: setCorsHeaders({ 'Content-Type': 'application/json' }) })
    }

    // Additional validation: check if MIME type matches file extension
    const fileExt = f.name.split('.').pop()?.toLowerCase()
    const expectedImageExts = ['jpg', 'jpeg', 'png', 'webp', 'gif']

    if (fileExt && !expectedImageExts.includes(fileExt)) {
      return new Response(JSON.stringify({
        error: 'MIME type mismatch',
        message: 'Image file extension does not match MIME type'
      }), { status: 400, headers: setCorsHeaders({ 'Content-Type': 'application/json' }) })
    }

    const ab = await f.arrayBuffer()
    const input = Buffer.from(ab)
    const isGif = f.type.toLowerCase() === 'image/gif' || f.name.toLowerCase().endsWith('.gif')
    const folder = kind === 'avatar' ? `avatar/${userId}` : `covers/${userId}`
    const baseName = kind // stable filename without random suffix

    if (isGif) {
      const out = await convertGifToWebM(input, cropW > 0 && cropH > 0 ? { x: cropX, y: cropY, w: cropW, h: cropH } : undefined)
      const key = `${folder}/${baseName}.webm`
      const file = s3.file(key)
      await write(file, new Blob([out], { type: 'video/webm' }))
      APILogger.response(200, endpoint)
      return new Response(JSON.stringify({ path: key, mime: 'video/webm', imageId: baseName }), { headers: setCorsHeaders({ 'Content-Type': 'application/json' }) })
    }

    const outImg = await convertImageToWebP(input, cropW > 0 && cropH > 0 ? { x: cropX, y: cropY, w: cropW, h: cropH } : undefined)
    const key = `${folder}/${baseName}.webp`
    const file = s3.file(key)
    await write(file, new Blob([outImg], { type: 'image/webp' }))
    APILogger.response(200, endpoint)
    return new Response(JSON.stringify({ path: key, mime: 'image/webp', imageId: baseName }), { headers: setCorsHeaders({ 'Content-Type': 'application/json' }) })
  } catch (error) {
    APILogger.error(error as Error, endpoint)
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500, headers: setCorsHeaders({ 'Content-Type': 'application/json' }) })
  }
}

export async function profileAvatar(req: Request) { return handleProfile(req, 'avatar') }
export async function profileCover(req: Request) { return handleProfile(req, 'cover') }
