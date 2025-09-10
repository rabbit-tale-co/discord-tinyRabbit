import { setCorsHeaders } from '@/utils/cors.js'
import { APILogger, bunnyLog } from '@/utils/bunnyLogger.js'
import { randomUUIDv7 } from 'bun'
import { write } from 'bun'
import { transcodeToWebM, convertImageToWebP, s3 } from '@/social/lib/media.js'

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

    // Validate file type and prevent MIME manipulation
    const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
    const allowedVideoTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo']
    const allAllowedTypes = [...allowedImageTypes, ...allowedVideoTypes]

    if (!allAllowedTypes.includes(f.type)) {
      return new Response(JSON.stringify({
        error: 'Invalid file type',
        message: 'Only image and video files are allowed in posts'
      }), { status: 400, headers: setCorsHeaders({ 'Content-Type': 'application/json' }) })
    }

    // Additional validation: check if MIME type matches file extension
    const fileExt = f.name.split('.').pop()?.toLowerCase()
    const expectedVideoExts = ['mp4', 'webm', 'mov', 'avi']
    const expectedImageExts = ['jpg', 'jpeg', 'png', 'webp', 'gif']

    const isVideo = f.type.startsWith('video/')
    const isImage = f.type.startsWith('image/')

    if (isVideo && fileExt && !expectedVideoExts.includes(fileExt)) {
      return new Response(JSON.stringify({
        error: 'MIME type mismatch',
        message: 'Video file extension does not match MIME type'
      }), { status: 400, headers: setCorsHeaders({ 'Content-Type': 'application/json' }) })
    }

    if (isImage && fileExt && !expectedImageExts.includes(fileExt)) {
      return new Response(JSON.stringify({
        error: 'MIME type mismatch',
        message: 'Image file extension does not match MIME type'
      }), { status: 400, headers: setCorsHeaders({ 'Content-Type': 'application/json' }) })
    }

    bunnyLog.log('api', `post upload: userId=${userId} postId=${postId} name=${f.name} type=${f.type} size=${f.size}`)

    const ab = await f.arrayBuffer()
    const input = Buffer.from(ab)
    const ext = (f.name.split('.').pop() || '').toLowerCase()
    const type = (f.type || '').toLowerCase()

    let out: Buffer
    let mime: string
    if (isVideo || ['mp4', 'mov', 'avi'].includes(ext)) {
      out = await transcodeToWebM(input)
      mime = 'video/webm'
    } else if (type === 'image/gif' || ext === 'gif') {
      out = await transcodeToWebM(input)
      mime = 'video/webm'
    } else {
      out = await convertImageToWebP(input)
      mime = 'image/webp'
    }

    const imageId = randomUUIDv7()
    const key = `posts/${postId}/${imageId}.${mime.startsWith('video/') ? 'webm' : 'webp'}`
    const file = s3.file(key)
    await write(file, new Blob([out], { type: mime }))
    APILogger.response(200, endpoint)
    return new Response(JSON.stringify({ path: key, mime, imageId }), { headers: setCorsHeaders({ 'Content-Type': 'application/json' }) })
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
