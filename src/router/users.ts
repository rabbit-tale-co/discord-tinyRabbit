import type { DiscordUser } from '../types/user';
import type { APIUser } from 'discord-api-types/v10';
import { env } from 'node:process';

export async function handleCurrentUser(request: Request): Promise<Response> {
  const token = request.headers.get('Authorization')?.split(' ')[1] ||
                getCookie(request.headers.get('Cookie'), 'access_token');

  if (!token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const discordResponse = await fetch('https://discord.com/api/v10/users/@me', {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!discordResponse.ok) {
      throw new Error('Discord API request failed');
    }

    const userData: APIUser = await discordResponse.json();

    // Transform to your user type
    const user: DiscordUser = {
      id: userData.id,
      username: userData.username,
      avatar: userData.avatar
        ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png`
        : null,
      email: userData.email || null,
      premium: userData.premium_type ? userData.premium_type > 0 : false
    };

    return new Response(JSON.stringify(user), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=3600'
      }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to fetch user data' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

function getCookie(cookies: string | null, name: string): string | null {
  return cookies?.match(new RegExp(`(^| )${name}=([^;]+)`))?.[2] || null;
}
