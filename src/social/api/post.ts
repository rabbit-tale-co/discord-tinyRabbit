import { setCorsHeaders } from '@/utils/cors.js'
import { APILogger, bunnyLog } from '@/utils/bunnyLogger.js'
import { randomUUIDv7 } from 'bun'
import { write } from 'bun'
import { transcodeToWebM, convertImageToWebP, s3PublicUrl, s3 } from '@/social/lib/media.js'

export async function postUpload(req: Request): Promise<Response> {
  const endpoint = '/social/v1/post/upload'
  APILogger.request(req.method, endpoint)
  try {
    const form = await req.formData()
    const postId = String(form.get('postId') || '')
    const userId = String(form.get('userId') || '')
    const f = form.get('file')
    if (!postId || !userId) return new Response(JSON.stringify({ error: 'Missing ids' }), { status: 400, headers: setCorsHeaders({ 'Content-Type': 'application/json' }) })
    if (!(f instanceof File)) return new Response(JSON.stringify({ error: 'No file' }), { status: 400, headers: setCorsHeaders({ 'Content-Type': 'application/json' }) })

    bunnyLog.log('api', `post upload: userId=${userId} postId=${postId} name=${(f as File).name} type=${(f as File).type} size=${(f as File).size}`)

    const ab = await (f as File).arrayBuffer()
    const input = Buffer.from(ab)
    const ext = ((f as File).name.split('.').pop() || '').toLowerCase()
    const type = ((f as File).type || '').toLowerCase()

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
    APILogger.response(200, endpoint)
    return new Response(JSON.stringify({ path: key, url, mime }), { headers: setCorsHeaders({ 'Content-Type': 'application/json' }) })
  } catch (error) {
    APILogger.error(error as Error, '/social/v1/post/upload')
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500, headers: setCorsHeaders({ 'Content-Type': 'application/json' }) })
  }
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
