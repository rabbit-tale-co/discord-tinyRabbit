import { setCorsHeaders } from '@/utils/cors.js'
import { randomUUIDv7 } from 'bun'
import { S3Client, write } from 'bun'
import { transcodeToWebM, convertImageToWebP, s3PublicUrl } from '@/social/lib/media.js'

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


export async function postUpload(req: Request): Promise<Response> {
  const form = await req.formData()
  const postId = String(form.get('postId') || '')
  const userId = String(form.get('userId') || '')
  const f = form.get('file')
  if (!postId || !userId) return new Response(JSON.stringify({ error: 'Missing ids' }), { status: 400, headers: setCorsHeaders() })
  if (!(f instanceof File)) return new Response(JSON.stringify({ error: 'No file' }), { status: 400, headers: setCorsHeaders() })

  const ab = await f.arrayBuffer()
  const input = Buffer.from(ab)
  const ext = (f.name.split('.').pop() || '').toLowerCase()
  const type = (f.type || '').toLowerCase()

  let out: Buffer
  let mime: string
  if (type.startsWith('video/') || ['mp4', 'mov', 'avi'].includes(ext)) {
    out = await transcodeToWebM(input)
    mime = 'video/webm'
  } else if (type === 'image/gif' || ext === 'gif') {
    out = await transcodeToWebM(input)
    mime = 'video/webm'
  } else {
    out = await convertImageToWebP(input)
    mime = 'image/webp'
  }

  const key = `posts/${postId}/${randomUUIDv7()}.${mime.startsWith('video/') ? 'webm' : 'webp'}`
  const file = s3.file(key)
  await write(file, new Blob([out], { type: mime }))
  const url = s3PublicUrl(key)
  return new Response(JSON.stringify({ path: key, url, mime }), { headers: setCorsHeaders() })
}

export async function postDelete(req: Request): Promise<Response> {
  const form = await req.formData()
  const key = String(form.get('key') || '')
  if (!key) return new Response(JSON.stringify({ error: 'Missing key' }), { status: 400, headers: setCorsHeaders() })
  try {
    await s3.delete(key)
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: setCorsHeaders() })
  }
  return new Response(JSON.stringify({ ok: true }), { headers: setCorsHeaders() })
}
