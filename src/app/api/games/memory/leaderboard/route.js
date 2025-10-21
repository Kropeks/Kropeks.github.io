import { NextResponse } from 'next/server';

import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const rows = await query(
      'SELECT id, name, moves, time_seconds AS time, created_at AS date FROM memory_game_leaderboard ORDER BY moves ASC, time_seconds ASC, created_at ASC LIMIT 10'
    );

    return NextResponse.json({ entries: rows });
  } catch (error) {
    console.error('[memory-leaderboard] GET error', error);
    return NextResponse.json({ error: 'Failed to load leaderboard' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const moves = Number.parseInt(body.moves, 10);
    const time = Number.parseInt(body.time, 10);

    if (!name || Number.isNaN(moves) || moves < 0 || Number.isNaN(time) || time < 0) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    await query(
      'INSERT INTO memory_game_leaderboard (name, moves, time_seconds) VALUES (?, ?, ?)',
      [name, moves, time]
    );

    const rows = await query(
      'SELECT id, name, moves, time_seconds AS time, created_at AS date FROM memory_game_leaderboard ORDER BY moves ASC, time_seconds ASC, created_at ASC LIMIT 10'
    );

    return NextResponse.json({ entries: rows });
  } catch (error) {
    console.error('[memory-leaderboard] POST error', error);
    return NextResponse.json({ error: 'Failed to save score' }, { status: 500 });
  }
}
