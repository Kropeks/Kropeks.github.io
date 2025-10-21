import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { query, transaction } from '@/lib/db'

export async function DELETE(_request, { params }) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const conversationId = Number(params?.conversationId)

  if (!Number.isFinite(conversationId) || conversationId <= 0) {
    return NextResponse.json({ error: 'conversationId is required' }, { status: 400 })
  }

  try {
    const participants = await query(
      'SELECT id FROM chat_participants WHERE conversation_id = ? AND user_id = ? LIMIT 1',
      [conversationId, session.user.id]
    )

    if (!participants?.length) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await transaction(async (connection) => {
      await connection.query('DELETE FROM chat_messages WHERE conversation_id = ?', [conversationId])
      await connection.query('DELETE FROM chat_participants WHERE conversation_id = ?', [conversationId])
      await connection.query('DELETE FROM chat_conversations WHERE id = ?', [conversationId])
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete conversation:', error)
    return NextResponse.json({ error: 'Failed to delete conversation' }, { status: 500 })
  }
}
