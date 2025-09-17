import { profileAvatar, profileCover } from '@/social/api/profile.js'
import { postUpload, postDelete } from '@/social/api/post.js'
import { setCorsHeaders } from '../utils/cors.js'
import { errorHandler } from '@/utils/errorHandler.js'
import { rabbitHoleAvatar, rabbitHoleCover } from '@/social/api/rabbitHoles.js'

// Social API Route Handlers – consistent with discord.ts style
const routes: Record<string, (req: Request) => Promise<Response>> = {
  'GET /social/v1/health': async () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: setCorsHeaders({ 'Content-Type': 'application/json' }) }),

  // Profile media
  'POST /social/v1/profile/avatar': profileAvatar,
  'POST /social/v1/profile/cover': profileCover,

  // Rabbit Hole media
  'POST /social/v1/rabbit-holes/avatar': rabbitHoleAvatar,
  'POST /social/v1/rabbit-holes/cover': rabbitHoleCover,

  // Post media
  'POST /social/v1/post/upload': postUpload,
  'POST /social/v1/post/delete': postDelete,
}

export async function socialRouter(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: setCorsHeaders() })
  const url = new URL(req.url)
  const routeKey = `${req.method.toUpperCase()} ${url.pathname}`
  const handler = routes[routeKey]
  if (handler) return errorHandler(handler)(req)
  return new Response('Not Found', { status: 404, headers: setCorsHeaders() })
}
