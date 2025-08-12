// rankCard.ts – v2.1 (TypeScript)
// -----------------------------------------------------------------------------
// npm i canvas
// -----------------------------------------------------------------------------
// If you use ts-node / tsup / ESBuild just import this file directly.
// Otherwise compile with tsc and import the .js output in your bot.
// -----------------------------------------------------------------------------

import {
	createCanvas,
	loadImage,
	registerFont,
	CanvasRenderingContext2D,
} from 'canvas'
import { registerGeistFonts } from './fontSetup.js'

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

type GradientBackground = { type: 'gradient'; colors: [string, string] }
type SolidBackground = { type: 'solid'; colors: [string] }
type ImageBackground = { type: 'image'; url: string }

export type Background = GradientBackground | SolidBackground | ImageBackground

export interface RankCardOptions {
	avatarURL: string
	displayName: string
	level: number
	globalRank: number
	serverRank: number
	currentXP: number
	requiredXP: number

	width?: number // default 1200
	height?: number // default 400
	background?: Background // default dark gradient

	badges?: string[] // optional badge URLs (max 3)
	fontPath?: string // register custom TTF / OTF
	fontFamily?: string // custom family name (default "Inter")
	additionalData?: Record<string, unknown> // future-proof
}

/* -------------------------------------------------------------------------- */
/*  Public API – generateRankCard                                             */
/* -------------------------------------------------------------------------- */

export async function generateRankCard(opts: RankCardOptions): Promise<Buffer> {
	/* ---- de-structure with defaults --------------------------------------- */

	const {
		avatarURL,
		displayName,
		level,
		globalRank,
		serverRank,
		currentXP,
		requiredXP,

		width = 1200,
		height = 400,
		background = {
			type: 'gradient',
			colors: ['#0f172a', '#1e293b'],
		} as GradientBackground,

		badges = [],
		fontPath,
		fontFamily: initialFontFamily = 'Inter',
	} = opts

	/* ---- Canvas bootstrap -------------------------------------------------- */

	const canvas = createCanvas(width, height)
	const ctx = canvas.getContext('2d')

	ctx.antialias = 'subpixel'
	ctx.textBaseline = 'top'

	/* ---- Fonts ------------------------------------------------------------- */

	let fontFamily = initialFontFamily

	if (!fontPath) {
		registerGeistFonts()
		fontFamily = 'Geist-Bold'
	} else {
		try {
			registerFont(fontPath, { family: initialFontFamily })
			console.log(`[rankCard] custom font loaded: ${fontPath}`)
		} catch (err) {
			console.warn(`[rankCard] failed to load custom font, falling back`, err)
			registerGeistFonts()
			fontFamily = 'Geist-Bold'
		}
	}

	/* ---- 1. Background ----------------------------------------------------- */

	await paintBackground(ctx, width, height, background)

	/* ---- Enhance readability: right-side panel ---------------------------- */

	const AVATAR_SIDE = height - 80
	const AVATAR_X = 40
	const AVATAR_Y = 40
	const AVATAR_RADIUS = 25

	const PANEL_X = AVATAR_X + AVATAR_SIDE + 20
	const PANEL_Y = 30
	const PANEL_W = width - PANEL_X - 30
	const PANEL_H = height - 60

	ctx.save()
	ctx.fillStyle = 'rgba(15, 23, 42, 0.55)'
	ctx.roundRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 24)
	ctx.fill()
	ctx.strokeStyle = 'rgba(255,255,255,0.06)'
	ctx.lineWidth = 1
	ctx.stroke()
	ctx.restore()

	/* ---- 2. Avatar --------------------------------------------------------- */

	const avatarSafeURL = enforcePngAvatar(avatarURL)

	await drawRoundedImage(
		ctx,
		avatarSafeURL,
		AVATAR_X,
		AVATAR_Y,
		AVATAR_SIDE,
		AVATAR_SIDE,
		AVATAR_RADIUS,
		() =>
			drawFallbackAvatar(
				ctx,
				AVATAR_X,
				AVATAR_Y,
				AVATAR_SIDE,
				AVATAR_RADIUS,
				displayName
			)
	)

	// subtle avatar border
	ctx.save()
	ctx.beginPath()
	ctx.roundRect(AVATAR_X, AVATAR_Y, AVATAR_SIDE, AVATAR_SIDE, AVATAR_RADIUS)
	ctx.strokeStyle = 'rgba(255,255,255,0.08)'
	ctx.lineWidth = 2
	ctx.stroke()
	ctx.restore()

	/* ---- 3. Display name + badges ----------------------------------------- */

	const cursorX = AVATAR_X + AVATAR_SIDE + 50
	const nameY = 50

	ctx.font = `56px "${fontFamily}", sans-serif`
	ctx.fillStyle = '#ffffff'

	const truncatedName = truncate(displayName, 18)
	ctx.fillText(truncatedName, cursorX, nameY)
	const nameW = ctx.measureText(truncatedName).width

	if (badges.length) {
		const BADGE_SIZE = 40
		let badgeX = cursorX + nameW + 15

		for (const src of badges.slice(0, 3)) {
			await drawRoundedImage(
				ctx,
				src,
				badgeX,
				nameY + 8,
				BADGE_SIZE,
				BADGE_SIZE,
				6,
				() => {}
			)
			badgeX += BADGE_SIZE + 10
		}
	}

	/* ---- 4. Level ---------------------------------------------------------- */

	const LEVEL_LABEL_Y = nameY + 70

	ctx.font = `28px "${fontFamily}", sans-serif`
	ctx.fillStyle = '#9ca3af'
	ctx.fillText('LEVEL:', cursorX, LEVEL_LABEL_Y)

	ctx.font = `42px "${fontFamily}", sans-serif`
	ctx.fillStyle = '#ffffff'
	ctx.fillText(String(level), cursorX + 120, LEVEL_LABEL_Y - 4)

	/* ---- 5. Rankings ------------------------------------------------------- */

	ctx.textAlign = 'right'
	const RANK_X = width - 60
	const GLOBAL_Y = 50

	ctx.font = `24px "${fontFamily}", sans-serif`
	ctx.fillStyle = '#9ca3af'
	ctx.fillText('GLOBAL RANKING:', RANK_X, GLOBAL_Y)
	ctx.fillText('SERVER RANKING:', RANK_X, GLOBAL_Y + 50)

	ctx.font = `40px "${fontFamily}", sans-serif`
	ctx.fillStyle = '#ffffff'
	ctx.fillText(`#${formatNumber(globalRank)}`, RANK_X, GLOBAL_Y - 4)
	ctx.fillText(`#${formatNumber(serverRank)}`, RANK_X, GLOBAL_Y + 46)
	ctx.textAlign = 'left'

	/* ---- 6. XP bar --------------------------------------------------------- */

	const BAR_HEIGHT = 60
	const BAR_RADIUS = 30
	const BAR_X = cursorX
	const BAR_Y = height - BAR_HEIGHT - 50
	const BAR_WIDTH = width - BAR_X - 60

	// XP pill
	const PILL_W = 120

	ctx.fillStyle = '#ffffff'
	ctx.roundRect(BAR_X, BAR_Y, PILL_W, BAR_HEIGHT, BAR_RADIUS)
	ctx.fill()

	ctx.font = `32px "${fontFamily}", sans-serif`
	ctx.fillStyle = '#000000'
	ctx.textAlign = 'center'
	ctx.fillText('XP', BAR_X + PILL_W / 2, BAR_Y + 15)
	ctx.textAlign = 'left'

	// track
	ctx.fillStyle = 'rgba(255,255,255,0.15)'
	ctx.roundRect(
		BAR_X + PILL_W + 20,
		BAR_Y,
		BAR_WIDTH - PILL_W - 20,
		BAR_HEIGHT,
		BAR_RADIUS
	)
	ctx.fill()
	ctx.save()
	ctx.strokeStyle = 'rgba(255,255,255,0.10)'
	ctx.lineWidth = 2
	ctx.roundRect(
		BAR_X + PILL_W + 20,
		BAR_Y,
		BAR_WIDTH - PILL_W - 20,
		BAR_HEIGHT,
		BAR_RADIUS
	)
	ctx.stroke()
	ctx.restore()

	// progress
	const pct = Math.min(currentXP / requiredXP, 1)
	const progressWidth = (BAR_WIDTH - PILL_W - 20) * pct
	const grad = ctx.createLinearGradient(
		BAR_X + PILL_W + 20,
		0,
		BAR_X + PILL_W + 20 + progressWidth,
		0
	)
	grad.addColorStop(0, '#60a5fa') // blue-400
	grad.addColorStop(1, '#a78bfa') // violet-400
	ctx.fillStyle = grad
	ctx.roundRect(
		BAR_X + PILL_W + 20,
		BAR_Y,
		progressWidth,
		BAR_HEIGHT,
		BAR_RADIUS
	)
	ctx.fill()
	// subtle gloss
	ctx.save()
	ctx.globalAlpha = 0.15
	ctx.fillStyle = '#ffffff'
	ctx.roundRect(
		BAR_X + PILL_W + 20,
		BAR_Y,
		progressWidth,
		BAR_HEIGHT / 2,
		BAR_RADIUS
	)
	ctx.fill()
	ctx.restore()

	// XP text
	ctx.font = `28px "${fontFamily}", sans-serif`
	ctx.fillStyle = '#ffffff'
	ctx.textAlign = 'center'
	ctx.fillText(
		`${formatNumber(currentXP)} / ${formatNumber(requiredXP)} (${Math.round(
			pct * 100
		)}%)`,
		BAR_X + PILL_W + 20 + (BAR_WIDTH - PILL_W - 20) / 2,
		BAR_Y + 15
	)
	ctx.textAlign = 'left'

	/* ---- Done ------------------------------------------------------------- */

	return canvas.toBuffer('image/png')
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

/** Enforce a PNG Discord-CDN URL so libwebp isn’t required */
function enforcePngAvatar(url: string): string {
	try {
		const u = new URL(url)
		if (/discord(?:app)?\.com$/.test(u.hostname)) {
			u.search = ''
			u.pathname = u.pathname.replace(/\.(webp|jpe?g|gif)$/i, '.png')
			u.searchParams.set('size', '256')
			return u.toString()
		}
	} catch {
		/* noop */
	}
	return url
}

/** Draw gradient | solid | image background */
async function paintBackground(
	ctx: CanvasRenderingContext2D,
	w: number,
	h: number,
	bg: Background
): Promise<void> {
	if (bg.type === 'gradient') {
		paintGradient(ctx, w, h, bg.colors)
	} else if (bg.type === 'solid') {
		ctx.fillStyle = bg.colors[0] ?? '#111827'
		ctx.fillRect(0, 0, w, h)
	} else {
		// image
		try {
			const img = await loadImage(bg.url)
			ctx.drawImage(img, 0, 0, w, h)
		} catch {
			console.warn('[rankCard] bg image failed – using fallback gradient')
			paintGradient(ctx, w, h, ['#1e293b', '#0f172a'])
		}
	}
}

function paintGradient(
	ctx: CanvasRenderingContext2D,
	w: number,
	h: number,
	colors: [string, string]
): void {
	const grad = ctx.createLinearGradient(0, 0, w, h)
	grad.addColorStop(0, colors[0])
	grad.addColorStop(1, colors[1])
	ctx.fillStyle = grad
	ctx.fillRect(0, 0, w, h)
}

type FetchResponseShape = {
	ok: boolean
	status: number
	arrayBuffer: () => Promise<ArrayBuffer>
}

async function fetchImageBuffer(url: string): Promise<Buffer> {
	const gFetch = (globalThis as { fetch?: typeof fetch }).fetch
	if (!gFetch) throw new Error('fetch not available')
	const res = (await gFetch(url, {
		headers: {
			Accept: 'image/*,*/*;q=0.5',
			'User-Agent': 'rank-card/2.1',
		},
		redirect: 'follow',
	})) as unknown as FetchResponseShape
	if (!res.ok) throw new Error(`HTTP ${res.status}`)
	const arr = await res.arrayBuffer()
	return Buffer.from(arr)
}

/** Draw an image clipped to a rounded-rect – guaranteed to fall back on error */
async function drawRoundedImage(
	ctx: CanvasRenderingContext2D,
	src: string,
	x: number,
	y: number,
	w: number,
	h: number,
	radius: number,
	onError: () => void
): Promise<void> {
	ctx.save()
	ctx.beginPath()
	ctx.roundRect(x, y, w, h, radius)
	ctx.clip()

	try {
		const candidates: string[] = [src]
		const enforced = enforcePngAvatar(src)
		if (enforced !== src) candidates.push(enforced)

		let drawn = false
		for (const u of candidates) {
			try {
				const buf = await fetchImageBuffer(u)
				const img = await loadImage(buf)
				ctx.drawImage(img, x, y, w, h)
				drawn = true
				break
			} catch {
				// try next
			}
		}
		if (!drawn) throw new Error('All avatar fetch attempts failed')
	} catch (err) {
		console.warn(`[rankCard] avatar failed: ${src}`, err)
		onError()
	}

	ctx.restore()
}

function truncate(str: string, max: number): string {
	return str.length > max ? str.slice(0, max - 1) + '…' : str
}

function formatNumber(n: number): string {
	try {
		return new Intl.NumberFormat('en-US').format(n)
	} catch {
		return String(n)
	}
}

/** fallback initials avatar */
function drawFallbackAvatar(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	size: number,
	radius: number,
	displayName: string
): void {
	ctx.save()
	ctx.beginPath()
	ctx.roundRect(x, y, size, size, radius)
	ctx.clip()

	// gradient bg
	const g = ctx.createLinearGradient(x, y, x + size, y + size)
	g.addColorStop(0, '#6366f1')
	g.addColorStop(1, '#8b5cf6')
	ctx.fillStyle = g
	ctx.fillRect(x, y, size, size)

	// initials
	const initials = displayName
		.split(' ')
		.slice(0, 2)
		.map((w) => w[0]?.toUpperCase() ?? '')
		.join('')

	ctx.fillStyle = '#ffffff'
	ctx.font = `${size / 3}px "Geist-Bold", sans-serif`
	ctx.textAlign = 'center'
	ctx.textBaseline = 'middle'
	ctx.fillText(initials, x + size / 2, y + size / 2)

	ctx.restore()
}

/* -------------------------------------------------------------------------- */
/*  Patch roundRect for very old node-canvas builds                            */
/* -------------------------------------------------------------------------- */

// Extend the existing CanvasRenderingContext2D interface
declare module 'canvas' {
	interface CanvasRenderingContext2D {
		roundRect(
			x: number,
			y: number,
			w: number,
			h: number,
			r?: number
		): CanvasRenderingContext2D
	}
}

/* eslint-disable-next-line @typescript-eslint/no-redeclare */
// Poly-fill for very old node-canvas builds:
if (!CanvasRenderingContext2D.prototype.roundRect) {
	CanvasRenderingContext2D.prototype.roundRect = function (
		x: number,
		y: number,
		w: number,
		h: number,
		r: number = 8
	) {
		if (w < 2 * r) r = w / 2
		if (h < 2 * r) h = h / 2
		this.beginPath()
		this.moveTo(x + r, y)
		this.arcTo(x + w, y, x + w, y + h, r)
		this.arcTo(x + w, y + h, x, y + h, r)
		this.arcTo(x, y + h, x, y, r)
		this.arcTo(x, y, x + w, y, r)
		this.closePath()
		return this
	}
}

/* -------------------------------------------------------------------------- */
/*  Example (comment-out in production)                                       */
/* -------------------------------------------------------------------------- */
/*
(async () => {
  const buf = await generateRankCard({
    avatarURL:   'https://cdn.discordapp.com/embed/avatars/3.png',
    displayName: 'Hasira 🥃🪴',
    level:       3,
    globalRank:  1,
    serverRank:  1,
    currentXP:   5550,
    requiredXP: 12000,
    badges: [
      'https://cdn-icons-png.flaticon.com/256/741/741407.png',
      'https://cdn-icons-png.flaticon.com/512/2909/2909825.png'
    ]
  });

  await import('fs/promises').then(fs => fs.writeFile('rank_card_ts.png', buf));
})();
*/
