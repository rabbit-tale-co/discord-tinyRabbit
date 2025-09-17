import { s3 } from '@/social/lib/media.js'

async function removePrefix(prefix: string) {
  const normalized = prefix.endsWith('/') ? prefix : `${prefix}/`
  console.log(`[S3] Listing objects with prefix: ${normalized}`)

  const list = await s3.list({ prefix: normalized })
  const files = list.contents || []
  if (files.length === 0) {
    console.log('[S3] No objects found')
    return
  }

  console.log(`[S3] Deleting ${files.length} objects...`)
  for (const f of files) {
    try {
      await s3.delete(f.key)
      console.log(' - deleted', f.key)
    } catch (e) {
      console.error(' ! failed', f.key, e)
    }
  }
  console.log('[S3] Done')
}

async function main() {
  const arg = process.argv[2]
  if (arg) {
    await removePrefix(arg)
    return
  }

  // Default: remove both legacy and current folders
  await removePrefix('rabbit-hole/')
  await removePrefix('rabbit-holes/')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
