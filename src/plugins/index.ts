const availablePlugins = [
	{
		id: 'welcome',
		title: 'Welcome & Goodbye',
		description:
			'Automatically send messages and give roles to your new members and send a message when a member leaves your server',
		iconSolid: 'SolidSend',
		iconOutline: 'OutlineSend',
		badge: 'SolidCarrot',
		category: 'Essentials',
		premium: true,
	},
	{
		id: 'tickets',
		title: 'Tickets',
		description: 'Allow members to open tickets for support',
		iconSolid: 'SolidCommand',
		iconOutline: 'OutlineCommand',
		badge: 'SolidCarrot',
		category: 'Essentials',
		premium: true,
	},
	{
		id: 'levels',
		title: 'Levels',
		description: 'Reward members with roles and perks as they level up',
		iconSolid: 'SolidTrendingUp',
		iconOutline: 'OutlineTrendingUp',
		badge: 'SolidCarrot',
		category: 'Essentials',
		premium: true,
	},
	{
		id: 'starboard',
		title: 'Starboard',
		description: 'Pin most starred messages to a dedicated channel',
		iconSolid: 'SolidStar',
		iconOutline: 'OutlineStar',
		badge: 'SolidCarrot',
		category: 'Essentials',
		premium: true,
	},
	{
		title: 'Birthday',
		description: 'Set your birthday',
		iconSolid: 'SolidGift',
		iconOutline: 'OutlineGift',
		badge: 'SolidCarrot',
		category: 'Essentials',
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
