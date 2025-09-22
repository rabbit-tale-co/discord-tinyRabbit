import { setCorsHeaders } from '@/utils/cors.js'
import { APILogger, bunnyLog } from '@/utils/bunnyLogger.js'
import { randomUUIDv7 } from 'bun'
import { write } from 'bun'
import { transcodeToWebM, convertImageToWebP, transcodeAudioToOgg, generateThumbnail, s3 } from '@/social/lib/media.js'

export async function postUpload(req: Request): Promise<Response> {
  const endpoint = '/social/v1/post/upload'
  APILogger.request(req.method, endpoint)
  try {
    const form = await req.formData()
    const requestedPostId = String(form.get('postId') || '')
    const userId = String(form.get('userId') || '')
    const feedId = String(form.get('feedId') || form.get('feed_id') || '')
    const f = form.get('file')
    if (!userId) return new Response(JSON.stringify({ error: 'Missing userId' }), { status: 400, headers: setCorsHeaders({ 'Content-Type': 'application/json' }) })
    if (!(f instanceof File)) return new Response(JSON.stringify({ error: 'No file' }), { status: 400, headers: setCorsHeaders({ 'Content-Type': 'application/json' }) })

    // Validate file type and prevent MIME manipulation
    const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
    const allowedVideoTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo']
    const allowedAudioTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/flac', 'audio/aac']
    const allAllowedTypes = [...allowedImageTypes, ...allowedVideoTypes, ...allowedAudioTypes]

    if (!allAllowedTypes.includes(f.type)) {
      return new Response(JSON.stringify({
        error: 'Invalid file type',
        message: 'Only image, video, and audio files are allowed in posts'
      }), { status: 400, headers: setCorsHeaders({ 'Content-Type': 'application/json' }) })
    }

    // Additional validation: check if MIME type matches file extension
    const fileExt = f.name.split('.').pop()?.toLowerCase()
    const expectedVideoExts = ['mp4', 'webm', 'mov', 'avi']
    const expectedImageExts = ['jpg', 'jpeg', 'png', 'webp', 'gif']
    const expectedAudioExts = ['mp3', 'wav', 'ogg', 'flac', 'aac']

    const isVideo = f.type.startsWith('video/')
    const isImage = f.type.startsWith('image/')
    const isAudio = f.type.startsWith('audio/')

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

    if (isAudio && fileExt && !expectedAudioExts.includes(fileExt)) {
      return new Response(JSON.stringify({
        error: 'MIME type mismatch',
        message: 'Audio file extension does not match MIME type'
      }), { status: 400, headers: setCorsHeaders({ 'Content-Type': 'application/json' }) })
    }

    // Use requestedPostId if provided, otherwise generate new one
    const postId = requestedPostId || randomUUIDv7()

    console.log(`[POST UPLOAD] Request details:`, {
      requestedPostId,
      finalPostId: postId,
      userId,
      feedId,
      fileName: f.name,
      fileType: f.type,
      fileSize: f.size
    })

    bunnyLog.log('api', `post upload: userId=${userId} postId=${postId} feedId=${feedId} name=${f.name} type=${f.type} size=${f.size}`)

    const ab = await f.arrayBuffer()
    const input = Buffer.from(ab)
    const ext = (f.name.split('.').pop() || '').toLowerCase()
    const type = (f.type || '').toLowerCase()

    let out: Buffer
    let mime: string
    let thumbnail: Buffer | null = null

    if (isVideo || ['mp4', 'mov', 'avi'].includes(ext)) {
      out = await transcodeToWebM(input)
      mime = 'video/webm'
      thumbnail = await generateThumbnail(input, false)
    } else if (type === 'image/gif' || ext === 'gif') {
      out = await transcodeToWebM(input)
      mime = 'video/webm'
      thumbnail = await generateThumbnail(input, false)
    } else if (isAudio || ['mp3', 'wav', 'ogg', 'flac', 'aac'].includes(ext)) {
      out = await transcodeAudioToOgg(input)
      mime = 'audio/ogg'
      thumbnail = await generateThumbnail(input, true)
    } else {
      out = await convertImageToWebP(input)
      mime = 'image/webp'
      // No thumbnail needed for images
    }

    const imageId = randomUUIDv7()
    // Use feed-specific path if feedId is provided
    const basePath = feedId ? `feeds/${feedId}/posts/${postId}` : `posts/${postId}`
    const key = `${basePath}/${imageId}.${mime.startsWith('video/') ? 'webm' : mime.startsWith('audio/') ? 'ogg' : 'webp'}`
    const file = s3.file(key)
    await write(file, new Blob([new Uint8Array(out)], { type: mime }))

    // Upload thumbnail if available
    let thumbnailKey = null
    if (thumbnail) {
      thumbnailKey = `${basePath}/${imageId}_thumbnail.webp`
      const thumbnailFile = s3.file(thumbnailKey)
      await write(thumbnailFile, new Blob([new Uint8Array(thumbnail)], { type: 'image/webp' }))
    }

    console.log(`[POST UPLOAD] Upload completed:`, {
      postId,
      imageId,
      storagePath: key,
      thumbnailPath: thumbnailKey,
      mime
    })

    APILogger.response(200, endpoint)
    return new Response(JSON.stringify({
      path: key,
      mime,
      imageId,
      postId,
      thumbnailPath: thumbnailKey || undefined
    }), { headers: setCorsHeaders({ 'Content-Type': 'application/json' }) })
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
