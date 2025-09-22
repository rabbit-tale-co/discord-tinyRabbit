import { profileAvatar, profileCover } from '@/social/api/profile.js'
import { postUpload, postDelete, postDeleteFolder } from '@/social/api/post.js'
import { setCorsHeaders } from '../utils/cors.js'
import { errorHandler } from '@/utils/errorHandler.js'

// Social API Route Handlers – consistent with discord.ts style
const routes: Record<string, (req: Request) => Promise<Response>> = {
  'GET /social/v1/health': async () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: setCorsHeaders({ 'Content-Type': 'application/json' }) }),

  // Profile media
  'POST /social/v1/profile/avatar': profileAvatar,
  'POST /social/v1/profile/cover': profileCover,

  // Post media
  'POST /social/v1/post/upload': postUpload,
  'POST /social/v1/post/delete': postDelete,
  'POST /social/v1/post/delete-folder': postDeleteFolder,

  // Rabbit Hole (Feed) media
  'POST /social/v1/feed/avatar': profileAvatar, // Reuse profile logic for feed avatars
  'POST /social/v1/feed/cover': profileCover,   // Reuse profile logic for feed covers
}

export async function socialRouter(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: setCorsHeaders() })
  const url = new URL(req.url)
  const routeKey = `${req.method.toUpperCase()} ${url.pathname}`
  const handler = routes[routeKey]
  if (handler) return errorHandler(handler)(req)
  return new Response('Not Found', { status: 404, headers: setCorsHeaders() })
}
