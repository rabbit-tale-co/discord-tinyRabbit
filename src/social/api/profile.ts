import { handleEntityUpload } from '@/social/api/commonUpload.js'

async function handleProfile(req: Request, kind: 'avatar' | 'cover'): Promise<Response> {
  return handleEntityUpload(req, 'profile', kind)
}

export async function profileAvatar(req: Request) { return handleProfile(req, 'avatar') }
export async function profileCover(req: Request) { return handleProfile(req, 'cover') }
