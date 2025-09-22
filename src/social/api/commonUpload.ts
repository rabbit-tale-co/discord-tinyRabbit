import { setCorsHeaders } from '@/utils/cors.js'
import { write, randomUUIDv7 } from 'bun'
import { convertGifToWebM, convertImageToWebP, generateThumbnail, s3 } from '@/social/lib/media.js'
import { APILogger, bunnyLog } from '@/utils/bunnyLogger.js'

type Entity = 'profile' | 'rabbit-hole' | 'feed'
type Kind = 'avatar' | 'cover'

function buildFolder(entity: Entity, kind: Kind, id: string): { folder: string; baseName: string } {
  if (entity === 'profile') {
    return { folder: kind === 'avatar' ? `avatar/profile/${id}` : `covers/profile/${id}`, baseName: kind }
  }
  if (entity === 'rabbit-hole') {
    return { folder: kind === 'avatar' ? `avatar/rabbit-hole/${id}` : `covers/rabbit-hole/${id}`, baseName: kind === 'avatar' ? 'avatar' : 'cover' }
  }
  // feed - use same structure as rabbit-hole but under feed root
  return { folder: kind === 'avatar' ? `avatar/feed/${id}` : `covers/feed/${id}`, baseName: kind === 'avatar' ? 'avatar' : 'cover' }
}

function publicBase(): string {
  const envs = [
    (process.env.SOCIAL_PUBLIC_BASE || '').trim(),
    (process.env.SOCIAL_S3_ENDPOINT || '').trim(),
    (process.env.S3_ENDPOINT || '').trim(),
  ]
  const v = envs.find(Boolean) || ''
  const cleaned = v.replace(/\/$/, '')
  // Ensure URL has protocol
  if (cleaned && !cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
    return `https://${cleaned}`
  }
  return cleaned
}

export async function handleEntityUpload(req: Request, defaultEntity: Entity, kind: Kind): Promise<Response> {
  const endpoint = `/social/v1/${defaultEntity}/${kind}`
  APILogger.request(req.method, endpoint)
  try {
    const form = await req.formData()
    // auto-detect entity by presence of id fields; fall back to defaultEntity
    const userId = String(form.get('userId') || '')
    const rhId = String((form.get('rabbitHoleId') || form.get('rabbit_hole_id') || '') as string)
    const feedId = String((form.get('feedId') || form.get('feed_id') || '') as string)
    const entity: Entity = feedId ? 'feed' : (rhId ? 'rabbit-hole' : (userId ? 'profile' : defaultEntity))
    const id = feedId || rhId || userId || ''
    const f = form.get('file')
    const cropX = Number(form.get('crop_x') || 0)
    const cropY = Number(form.get('crop_y') || 0)
    const cropW = Number(form.get('crop_w') || 0)
    const cropH = Number(form.get('crop_h') || 0)
    if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400, headers: setCorsHeaders({ 'Content-Type': 'application/json' }) })
    if (!(f instanceof File)) return new Response(JSON.stringify({ error: 'No file' }), { status: 400, headers: setCorsHeaders({ 'Content-Type': 'application/json' }) })

    bunnyLog.log('api', `${entity} ${kind} upload: id=${id} name=${(f as File).name} type=${(f as File).type} size=${(f as File).size}`)

    const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
    if (!allowedImageTypes.includes((f as File).type)) {
      return new Response(JSON.stringify({ error: 'Invalid file type', message: 'Only image files are allowed' }), { status: 400, headers: setCorsHeaders({ 'Content-Type': 'application/json' }) })
    }

    const ab = await (f as File).arrayBuffer()
    const input = Buffer.from(ab)
    const isGif = (f as File).type.toLowerCase() === 'image/gif' || (f as File).name.toLowerCase().endsWith('.gif')

    const { folder, baseName } = buildFolder(entity, kind, id)
    const imageId = randomUUIDv7()
    const key = `${folder}/${baseName}.${isGif ? 'webm' : 'webp'}`

    // Generate thumbnail for the uploaded media
    let thumbnail: Buffer | undefined
    let thumbnailKey: string | undefined

    if (isGif) {
      const out = await convertGifToWebM(input, cropW > 0 && cropH > 0 ? { x: cropX, y: cropY, w: cropW, h: cropH } : undefined)
      const file = s3.file(key)
      await write(file, new Blob([new Uint8Array(out)], { type: 'video/webm' }))

      // Generate thumbnail for GIF (converted to WebM)
      thumbnail = await generateThumbnail(out, true)
      if (thumbnail) {
        thumbnailKey = `${folder}/${baseName}_thumbnail.webp`
        const thumbnailFile = s3.file(thumbnailKey)
        await write(thumbnailFile, new Blob([new Uint8Array(thumbnail)], { type: 'image/webp' }))
      }
    } else {
      const outImg = await convertImageToWebP(input, cropW > 0 && cropH > 0 ? { x: cropX, y: cropY, w: cropW, h: cropH } : undefined)
      const file = s3.file(key)
      await write(file, new Blob([new Uint8Array(outImg)], { type: 'image/webp' }))

      // For regular images, we don't need a separate thumbnail as they're already optimized
      // But we could generate one if needed for consistency
    }

    const base = publicBase()
    // Add bucket name to URL for rabbit-hole and feed entities
    const bucketPrefix = entity === 'rabbit-hole' ? 'rabbit-hole/' : (entity === 'feed' ? 'feed/' : '')
    const url = base ? `${base}/${bucketPrefix}${key}?v=${imageId}` : `/${bucketPrefix}${key}`

    // Add thumbnail URL if available
    let thumbnailUrl: string | undefined
    if (thumbnailKey) {
      thumbnailUrl = base ? `${base}/${bucketPrefix}${thumbnailKey}?v=${imageId}` : `/${bucketPrefix}${thumbnailKey}`
    }

    APILogger.response(200, endpoint)
    return new Response(JSON.stringify({
      path: key,
      url,
      mime: isGif ? 'video/webm' : 'image/webp',
      imageId,
      thumbnailPath: thumbnailKey,
      thumbnailUrl
    }), { headers: setCorsHeaders({ 'Content-Type': 'application/json' }) })
  } catch (error) {
    APILogger.error(error as Error, endpoint)
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500, headers: setCorsHeaders({ 'Content-Type': 'application/json' }) })
  }
}
