const availablePlugins = [
	// Moderation Category
	{
		id: 'moderation',
		title: 'Moderation Suite',
		description: 'Tools for moderation',
		iconSolid: 'SolidShield',
		iconOutline: 'OutlineShield',
		badge: 'SolidCarrot',
		category: 'Moderation',
		premium: true,
	},
	{
		id: 'slowmode',
		title: 'Slowmode',
		description: 'Control message spam with slowmode',
		iconSolid: 'SolidClock',
		iconOutline: 'OutlineClock',
		badge: 'SolidCarrot',
		category: 'Moderation',
		premium: false,
	},

	// Analytics Category
	{
		id: 'levels',
		title: 'Levels',
		description: 'Reward members with roles and perks as they level up',
		iconSolid: 'SolidTrendingUp',
		iconOutline: 'OutlineTrendingUp',
		badge: 'SolidCarrot',
		category: 'Fun',
		premium: true,
	},

	// Community Category
	{
		id: 'welcome-goodbye',
		title: 'Welcome & Goodbye',
		description: 'Automatically send messages when members join or leave',
		iconSolid: 'SolidSend',
		iconOutline: 'OutlineSend',
		badge: 'SolidCarrot',
		category: 'Community',
		premium: true,
	},
	{
		id: 'tickets',
		title: 'Tickets',
		description: 'Allow members to open tickets for support',
		iconSolid: 'SolidTicket',
		iconOutline: 'OutlineTicket',
		badge: 'SolidCarrot',
		category: 'Community',
		premium: true,
	},
	{
		id: 'birthday',
		title: 'Birthday',
		description: 'Celebrate member birthdays automatically',
		iconSolid: 'SolidGift',
		iconOutline: 'OutlineGift',
		badge: 'SolidCarrot',
		category: 'Community',
		premium: false,
	},
	{
		id: 'starboard',
		title: 'Starboard',
		description: 'Pin most starred messages to a dedicated channel',
		iconSolid: 'SolidStar',
		iconOutline: 'OutlineStar',
		badge: 'SolidCarrot',
		category: 'Community',
		premium: true,
	},

	// Voice Category
	{
		id: 'music',
		title: 'Music Player',
		description: 'Play music in voice channels',
		iconSolid: 'SolidMusic',
		iconOutline: 'OutlineMusic',
		badge: 'SolidCarrot',
		category: 'Voice',
		premium: true,
	},
	{
		id: 'tempvc',
		title: 'Temporary Voice',
		description: 'Create temporary voice channels',
		iconSolid: 'SolidMicrophone',
		iconOutline: 'OutlineMicrophone',
		badge: 'SolidCarrot',
		category: 'Voice',
		premium: false,
	},
]

type Plugin = {
	id: string
	title: string
	description: string
	iconSolid: string
	iconOutline: string
	badge: string
	category: string
	premium: boolean
}

/**
 * Fetches the available plugins.
 * @returns {Promise<Plugin[]>} - A promise that resolves to an array of plugins.
 */
export const fetchAvailablePlugins = async (): Promise<Plugin[]> => {
	return availablePlugins as Plugin[]
}
