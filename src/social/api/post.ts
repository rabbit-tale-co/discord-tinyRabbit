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
    const requestedPostId = String(form.get('postId') || '')
    const userId = String(form.get('userId') || '')
    const f = form.get('file')
    if (!userId) return new Response(JSON.stringify({ error: 'Missing userId' }), { status: 400, headers: setCorsHeaders({ 'Content-Type': 'application/json' }) })
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

    // Use requestedPostId if provided, otherwise generate new one
    const postId = requestedPostId || randomUUIDv7()

    console.log(`[POST UPLOAD] Request details:`, {
      requestedPostId,
      finalPostId: postId,
      userId,
      fileName: f.name,
      fileType: f.type,
      fileSize: f.size
    })

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

    console.log(`[POST UPLOAD] Upload completed:`, {
      postId,
      imageId,
      storagePath: key,
      mime
    })

    APILogger.response(200, endpoint)
    return new Response(JSON.stringify({ path: key, mime, imageId, postId }), { headers: setCorsHeaders({ 'Content-Type': 'application/json' }) })
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

export async function postDeleteFolder(req: Request): Promise<Response> {
  const endpoint = '/social/v1/post/delete-folder'
  APILogger.request(req.method, endpoint)

  try {
    const form = await req.formData()
    const postId = String(form.get('postId') || '')

    if (!postId) {
      return new Response(JSON.stringify({ error: 'Missing postId' }), {
        status: 400,
        headers: setCorsHeaders({ 'Content-Type': 'application/json' })
      })
    }

    console.log(`[POST DELETE FOLDER] Deleting folder for post:`, { postId })
    bunnyLog.log('api', `post delete folder: postId=${postId}`)

    // List all files in the post folder
    const folderPrefix = `posts/${postId}/`
    const response = await s3.list({ prefix: folderPrefix })
    const files = response.contents || []

    if (files.length > 0) {
      // Delete all files in the folder
      const deletePromises = files.map(file => s3.delete(file.key))
      await Promise.all(deletePromises)

      console.log(`[POST DELETE FOLDER] Deleted ${files.length} files for post:`, { postId, fileCount: files.length })
      bunnyLog.log('api', `post delete folder completed: postId=${postId} files=${files.length}`)
    } else {
      console.log(`[POST DELETE FOLDER] No files found for post:`, { postId })
    }

    APILogger.response(200, endpoint)
    return new Response(JSON.stringify({
      ok: true,
      deletedFiles: files.length,
      postId
    }), {
      headers: setCorsHeaders({ 'Content-Type': 'application/json' })
    })
  } catch (error) {
    console.error(`[POST DELETE FOLDER] Error:`, error)
    APILogger.error(error as Error, endpoint)
    return new Response(JSON.stringify({
      error: (error as Error).message
    }), {
      status: 500,
      headers: setCorsHeaders({ 'Content-Type': 'application/json' })
    })
  }
}
