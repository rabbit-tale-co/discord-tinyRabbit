import { setCorsHeaders } from '@/utils/cors.js'
import { randomUUIDv7 } from 'bun'
import { S3Client, write } from 'bun'
import { convertGifToWebM, convertImageToWebP, s3PublicUrl } from '@/social/lib/media.js'
import { APILogger } from '@/utils/bunnyLogger.js'

const S3_BUCKET = process.env.SOCIAL_S3_BUCKET as string
const S3_ENDPOINT = (process.env.SOCIAL_S3_ENDPOINT as string)?.replace(/\/$/, '')
const S3_REGION = process.env.SOCIAL_S3_REGION || 'auto'
const S3_ACCESS_KEY = process.env.SOCIAL_S3_ACCESS_KEY as string
const S3_SECRET_KEY = process.env.SOCIAL_S3_SECRET_KEY as string

const s3 = new S3Client({
  accessKeyId: S3_ACCESS_KEY,
  secretAccessKey: S3_SECRET_KEY,
  bucket: S3_BUCKET,
  region: S3_REGION,
  endpoint: S3_ENDPOINT,
  acl: 'public-read' as any,
})


async function handleProfile(req: Request, kind: 'avatar' | 'cover'): Promise<Response> {
  const form = await req.formData()
  const userId = String(form.get('userId') || '')
  const f = form.get('file')
  const cropX = Number(form.get('crop_x') || 0)
  const cropY = Number(form.get('crop_y') || 0)
  const cropW = Number(form.get('crop_w') || 0)
  const cropH = Number(form.get('crop_h') || 0)
  if (!userId) return new Response(JSON.stringify({ error: 'Missing userId' }), { status: 400, headers: setCorsHeaders() })
  if (!(f instanceof File)) return new Response(JSON.stringify({ error: 'No file' }), { status: 400, headers: setCorsHeaders() })

  const ab = await f.arrayBuffer()
  const input = Buffer.from(ab)
  const isGif = (f.type || '').toLowerCase() === 'image/gif' || (f.name || '').toLowerCase().endsWith('.gif')
  const uid = randomUUIDv7()
  const folder = kind === 'avatar' ? `avatar/${userId}` : `covers/${userId}`

  if (isGif) {
    const out = await convertGifToWebM(input, cropW > 0 && cropH > 0 ? { x: cropX, y: cropY, w: cropW, h: cropH } : undefined)
    const key = `${folder}/${kind}-${uid}.webm`
    const file = s3.file(key)
    await write(file, new Blob([out], { type: 'video/webm' }))
    const url = s3PublicUrl(key)
    return new Response(JSON.stringify({ path: key, url, mime: 'video/webm' }), { headers: setCorsHeaders() })
  }

  const outImg = await convertImageToWebP(input, cropW > 0 && cropH > 0 ? { x: cropX, y: cropY, w: cropW, h: cropH } : undefined)
  const key = `${folder}/${kind}-${uid}.webp`
  const file = s3.file(key)
  await write(file, new Blob([outImg], { type: 'image/webp' }))
  const url = s3PublicUrl(key)
  return new Response(JSON.stringify({ path: key, url, mime: 'image/webp' }), { headers: setCorsHeaders() })
}

export async function profileAvatar(req: Request) { return handleProfile(req, 'avatar') }
export async function profileCover(req: Request) { return handleProfile(req, 'cover') }
