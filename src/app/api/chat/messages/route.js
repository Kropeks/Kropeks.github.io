import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { query, transaction } from '@/lib/db'
import { broadcastChatMessage } from '@/lib/notifications/transport'

const messageSelectSql = `
  SELECT m.id,
         m.conversation_id AS conversationId,
         m.sender_id AS senderId,
         u.name AS senderName,
         u.email AS senderEmail,
         m.body,
         m.metadata,
         m.created_at AS createdAt
    FROM chat_messages m
    JOIN users u ON u.id = m.sender_id
   WHERE m.id = ?
   LIMIT 1
`

const messagesForConversationSql = `
  SELECT m.id,
         m.conversation_id AS conversationId,
         m.sender_id AS senderId,
         u.name AS senderName,
         u.email AS senderEmail,
         m.body,
         m.metadata,
         m.created_at AS createdAt
    FROM chat_messages m
    JOIN users u ON u.id = m.sender_id
   WHERE m.conversation_id = ?
   ORDER BY m.created_at ASC
`

async function assertParticipant(conversationId, userId) {
  const rows = await query(
    'SELECT id FROM chat_participants WHERE conversation_id = ? AND user_id = ? LIMIT 1',
    [conversationId, userId]
  )
  return rows?.length ? rows[0] : null
}

export async function GET(request) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const conversationId = Number(searchParams.get('conversationId'))

  if (!Number.isFinite(conversationId) || conversationId <= 0) {
    return NextResponse.json({ error: 'conversationId is required' }, { status: 400 })
  }

  const participant = await assertParticipant(conversationId, session.user.id)
  if (!participant) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const messages = await query(messagesForConversationSql, [conversationId])
    return NextResponse.json({ messages })
  } catch (error) {
    console.error('Failed to load messages:', error)
    return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 })
  }
}

export async function POST(request) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const payload = await request.json()
    const conversationId = Number(payload?.conversationId)
    const body = typeof payload?.body === 'string' ? payload.body.trim() : ''
    const metadata = payload?.metadata && typeof payload.metadata === 'object' ? payload.metadata : null

    if (!Number.isFinite(conversationId) || conversationId <= 0) {
      return NextResponse.json({ error: 'conversationId is required' }, { status: 400 })
    }

    if (!body) {
      return NextResponse.json({ error: 'Message body is required' }, { status: 400 })
    }

    const participant = await assertParticipant(conversationId, session.user.id)
    if (!participant) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const messageId = await transaction(async (connection) => {
      const [result] = await connection.query(
        'INSERT INTO chat_messages (conversation_id, sender_id, body, metadata, created_at) VALUES (?, ?, ?, ?, NOW(3))',
        [conversationId, session.user.id, body, metadata ? JSON.stringify(metadata) : null]
      )

      await connection.query(
        'UPDATE chat_conversations SET last_message_preview = ?, last_message_at = NOW(3), updated_at = NOW(3) WHERE id = ?',
        [body.slice(0, 255), conversationId]
      )

      await connection.query(
        'UPDATE chat_participants SET last_read_at = NOW(3) WHERE conversation_id = ? AND user_id = ?',
        [conversationId, session.user.id]
      )

      return result.insertId
    })

    const [message] = await query(messageSelectSql, [messageId])

    const participantRows = await query(
      'SELECT user_id AS userId FROM chat_participants WHERE conversation_id = ?',
      [conversationId]
    )
    const participantIds = Array.isArray(participantRows)
      ? participantRows.map((row) => row.userId).filter(Boolean)
      : []

    broadcastChatMessage(participantIds, conversationId, message).catch((broadcastError) => {
      console.warn('Chat broadcast failed:', broadcastError)
    })

    return NextResponse.json({ message }, { status: 201 })
  } catch (error) {
    console.error('Failed to send message:', error)
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }
}
