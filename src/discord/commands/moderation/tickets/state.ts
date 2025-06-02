import type * as Discord from 'discord.js'
import type { ThreadMetadata } from '@/types/tickets.js'

/* -------------------------------------------------------------------------- */
/*                                   CACHE                                    */
/* -------------------------------------------------------------------------- */

export const threadMetadataStore = new Map<string, ThreadMetadata>()

export const ticketStore = {
	get: (thread_id: Discord.ThreadChannel['id']) =>
		threadMetadataStore.get(thread_id),
	set: (thread_id: Discord.ThreadChannel['id'], metadata: ThreadMetadata) =>
		threadMetadataStore.set(thread_id, metadata),
	delete: (thread_id: Discord.ThreadChannel['id']) =>
		threadMetadataStore.delete(thread_id),
	has: (thread_id: Discord.ThreadChannel['id']) =>
		threadMetadataStore.has(thread_id),
	values: () => Array.from(threadMetadataStore.values()),
	clearClosed: () => {
		for (const [id, meta] of threadMetadataStore.entries()) {
			if (meta.status === 'closed') threadMetadataStore.delete(id)
		}
	},
}

export type ThreadStore = typeof ticketStore
