import { setCorsHeaders } from '@/utils/cors.js'
import { write, randomUUIDv7 } from 'bun'
import { convertGifToWebM, convertImageToWebP, s3 } from '@/social/lib/media.js'
import { APILogger, bunnyLog } from '@/utils/bunnyLogger.js'

async function handleRabbitHole(req: Request, kind: 'avatar' | 'cover'): Promise<Response> {
  const endpoint = `/social/v1/rabbit-holes/${kind}`
  APILogger.request(req.method, endpoint)
  try {
    const form = await req.formData()
    const rabbitHoleId = String(form.get('rabbitHoleId') || form.get('rabbit_hole_id') || '')
    const f = form.get('file')
    const cropX = Number(form.get('crop_x') || 0)
    const cropY = Number(form.get('crop_y') || 0)
    const cropW = Number(form.get('crop_w') || 0)
    const cropH = Number(form.get('crop_h') || 0)
    if (!rabbitHoleId) return new Response(JSON.stringify({ error: 'Missing rabbitHoleId' }), { status: 400, headers: setCorsHeaders({ 'Content-Type': 'application/json' }) })
    if (!(f instanceof File)) return new Response(JSON.stringify({ error: 'No file' }), { status: 400, headers: setCorsHeaders({ 'Content-Type': 'application/json' }) })

    bunnyLog.log('api', `rabbit-hole ${kind} upload: rabbitHoleId=${rabbitHoleId} name=${(f as File).name} type=${(f as File).type} size=${(f as File).size}`)

    // Validate file type
    const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
    if (!allowedImageTypes.includes((f as File).type)) {
      return new Response(JSON.stringify({ error: 'Invalid file type', message: 'Only image files are allowed' }), { status: 400, headers: setCorsHeaders({ 'Content-Type': 'application/json' }) })
    }

    // Optional additional validation
    const fileExt = (f as File).name.split('.').pop()?.toLowerCase()
    const expectedImageExts = ['jpg', 'jpeg', 'png', 'webp', 'gif']
    if (fileExt && !expectedImageExts.includes(fileExt)) {
      return new Response(JSON.stringify({ error: 'MIME type mismatch', message: 'Image file extension does not match MIME type' }), { status: 400, headers: setCorsHeaders({ 'Content-Type': 'application/json' }) })
    }

    const ab = await (f as File).arrayBuffer()
    const input = Buffer.from(ab)
    const isGif = (f as File).type.toLowerCase() === 'image/gif' || (f as File).name.toLowerCase().endsWith('.gif')

    // Paths like in profile: rabbit-hole/avatar/{id}/avatar.webp and covers/{id}/cover.webp
    const folder = kind === 'avatar' ? `rabbit-hole/avatar/${rabbitHoleId}` : `rabbit-hole/covers/${rabbitHoleId}`
    const baseName = kind === 'avatar' ? 'avatar' : 'cover'
    const imageId = randomUUIDv7()

    if (isGif) {
      const out = await convertGifToWebM(input, cropW > 0 && cropH > 0 ? { x: cropX, y: cropY, w: cropW, h: cropH } : undefined)
      const key = `${folder}/${baseName}.webm`
      const file = s3.file(key)
      const u8 = new Uint8Array(out)
      await write(file, new Blob([u8], { type: 'video/webm' }))
      APILogger.response(200, endpoint)
      return new Response(JSON.stringify({ path: key, mime: 'video/webm', imageId }), { headers: setCorsHeaders({ 'Content-Type': 'application/json' }) })
    }

    const outImg = await convertImageToWebP(input, cropW > 0 && cropH > 0 ? { x: cropX, y: cropY, w: cropW, h: cropH } : undefined)
    const key = `${folder}/${baseName}.webp`
    const file = s3.file(key)
    const u8img = new Uint8Array(outImg)
    await write(file, new Blob([u8img], { type: 'image/webp' }))
    APILogger.response(200, endpoint)
    return new Response(JSON.stringify({ path: key, mime: 'image/webp', imageId }), { headers: setCorsHeaders({ 'Content-Type': 'application/json' }) })
  } catch (error) {
    APILogger.error(error as Error, endpoint)
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500, headers: setCorsHeaders({ 'Content-Type': 'application/json' }) })
  }
}

export async function rabbitHoleAvatar(req: Request) { return handleRabbitHole(req, 'avatar') }
export async function rabbitHoleCover(req: Request) { return handleRabbitHole(req, 'cover') }
