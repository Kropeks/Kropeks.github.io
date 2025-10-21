import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { query, transaction } from '@/lib/db'

const conversationSummarySql = `
  SELECT c.id,
         c.topic,
         c.last_message_preview AS lastMessagePreview,
         c.last_message_at AS lastMessageAt,
         cp.last_read_at AS lastReadAt,
         other_cp.user_id AS otherParticipantId,
         u.name AS otherParticipantName,
         u.email AS otherParticipantEmail,
         COALESCE(u.image, up.avatar) AS otherParticipantAvatar,
         (
           SELECT COUNT(*)
             FROM chat_messages m
            WHERE m.conversation_id = c.id
              AND m.sender_id != cp.user_id
              AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at)
         ) AS unreadCount,
         (
           SELECT m.id
             FROM chat_messages m
            WHERE m.conversation_id = c.id
            ORDER BY m.created_at DESC
            LIMIT 1
         ) AS lastMessageId,
         (
           SELECT m.sender_id
             FROM chat_messages m
            WHERE m.conversation_id = c.id
            ORDER BY m.created_at DESC
            LIMIT 1
         ) AS lastMessageSenderId,
         (
           SELECT m.body
             FROM chat_messages m
            WHERE m.conversation_id = c.id
            ORDER BY m.created_at DESC
            LIMIT 1
         ) AS lastMessageBody
    FROM chat_conversations c
    JOIN chat_participants cp ON cp.conversation_id = c.id
    JOIN chat_participants other_cp ON other_cp.conversation_id = c.id AND other_cp.user_id != cp.user_id
    JOIN users u ON u.id = other_cp.user_id
    LEFT JOIN user_profiles up ON up.user_id = other_cp.user_id
   WHERE c.id = ? AND cp.user_id = ?
   LIMIT 1
`

const conversationSummarySqlFallback = `
  SELECT c.id,
         c.topic,
         c.last_message_preview AS lastMessagePreview,
         c.last_message_at AS lastMessageAt,
         cp.last_read_at AS lastReadAt,
         other_cp.user_id AS otherParticipantId,
         u.name AS otherParticipantName,
         u.email AS otherParticipantEmail,
         u.image AS otherParticipantAvatar,
         (
           SELECT COUNT(*)
             FROM chat_messages m
            WHERE m.conversation_id = c.id
              AND m.sender_id != cp.user_id
              AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at)
         ) AS unreadCount,
         (
           SELECT m.id
             FROM chat_messages m
            WHERE m.conversation_id = c.id
            ORDER BY m.created_at DESC
            LIMIT 1
         ) AS lastMessageId,
         (
           SELECT m.sender_id
             FROM chat_messages m
            WHERE m.conversation_id = c.id
            ORDER BY m.created_at DESC
            LIMIT 1
         ) AS lastMessageSenderId,
         (
           SELECT m.body
             FROM chat_messages m
            WHERE m.conversation_id = c.id
            ORDER BY m.created_at DESC
            LIMIT 1
         ) AS lastMessageBody
    FROM chat_conversations c
    JOIN chat_participants cp ON cp.conversation_id = c.id
    JOIN chat_participants other_cp ON other_cp.conversation_id = c.id AND other_cp.user_id != cp.user_id
    JOIN users u ON u.id = other_cp.user_id
   WHERE c.id = ? AND cp.user_id = ?
   LIMIT 1
`

const listConversationsSql = `
  SELECT c.id,
         c.topic,
         c.last_message_preview AS lastMessagePreview,
         c.last_message_at AS lastMessageAt,
         cp.last_read_at AS lastReadAt,
         other_cp.user_id AS otherParticipantId,
         u.name AS otherParticipantName,
         u.email AS otherParticipantEmail,
         COALESCE(u.image, up.avatar) AS otherParticipantAvatar,
         (
           SELECT COUNT(*)
             FROM chat_messages m
            WHERE m.conversation_id = c.id
              AND m.sender_id != cp.user_id
              AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at)
         ) AS unreadCount,
         (
           SELECT m.id
             FROM chat_messages m
            WHERE m.conversation_id = c.id
            ORDER BY m.created_at DESC
            LIMIT 1
         ) AS lastMessageId,
         (
           SELECT m.sender_id
             FROM chat_messages m
            WHERE m.conversation_id = c.id
            ORDER BY m.created_at DESC
            LIMIT 1
         ) AS lastMessageSenderId,
         (
           SELECT m.body
             FROM chat_messages m
            WHERE m.conversation_id = c.id
            ORDER BY m.created_at DESC
            LIMIT 1
         ) AS lastMessageBody
    FROM chat_conversations c
    JOIN chat_participants cp ON cp.conversation_id = c.id
    JOIN chat_participants other_cp ON other_cp.conversation_id = c.id AND other_cp.user_id != cp.user_id
    JOIN users u ON u.id = other_cp.user_id
   WHERE cp.user_id = ?
   ORDER BY c.last_message_at DESC, c.updated_at DESC
   LIMIT ? OFFSET ?
`

const listConversationsSqlFallback = `
  SELECT c.id,
         c.topic,
         c.last_message_preview AS lastMessagePreview,
         c.last_message_at AS lastMessageAt,
         cp.last_read_at AS lastReadAt,
         other_cp.user_id AS otherParticipantId,
         u.name AS otherParticipantName,
         u.email AS otherParticipantEmail,
         u.image AS otherParticipantAvatar,
         (
           SELECT COUNT(*)
             FROM chat_messages m
            WHERE m.conversation_id = c.id
              AND m.sender_id != cp.user_id
              AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at)
         ) AS unreadCount,
         (
           SELECT m.id
             FROM chat_messages m
            WHERE m.conversation_id = c.id
            ORDER BY m.created_at DESC
            LIMIT 1
         ) AS lastMessageId,
         (
           SELECT m.sender_id
             FROM chat_messages m
            WHERE m.conversation_id = c.id
            ORDER BY m.created_at DESC
            LIMIT 1
         ) AS lastMessageSenderId,
         (
           SELECT m.body
             FROM chat_messages m
            WHERE m.conversation_id = c.id
            ORDER BY m.created_at DESC
            LIMIT 1
         ) AS lastMessageBody
    FROM chat_conversations c
    JOIN chat_participants cp ON cp.conversation_id = c.id
    JOIN chat_participants other_cp ON other_cp.conversation_id = c.id AND other_cp.user_id != cp.user_id
    JOIN users u ON u.id = other_cp.user_id
   WHERE cp.user_id = ?
   ORDER BY c.last_message_at DESC, c.updated_at DESC
   LIMIT ? OFFSET ?
`

export async function GET(request) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(request.url)
  const page = Math.max(Number(searchParams.get('page') || 1), 1)
  const limit = Math.min(Math.max(Number(searchParams.get('limit') || 10), 1), 50)
  const offset = (page - 1) * limit

  try {
    let conversations
    try {
      conversations = await query(listConversationsSql, [session.user.id, limit, offset])
    } catch (error) {
      console.warn('Avatar-enhanced conversation query failed, falling back:', error)
      conversations = await query(listConversationsSqlFallback, [session.user.id, limit, offset])
    }

    const countRows = await query(
      `SELECT COUNT(DISTINCT conversation_id) AS total
         FROM chat_participants
        WHERE user_id = ?`,
      [session.user.id]
    )

    const total = countRows?.[0]?.total ? Number(countRows[0].total) : 0

    return NextResponse.json({
      conversations,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1
      }
    })
  } catch (error) {
    console.error('Failed to load conversations:', error)
    return NextResponse.json({ error: 'Failed to load conversations' }, { status: 500 })
  }
}

export async function DELETE(_request, { params }) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const conversationId = Number(params?.conversationId ?? params?.id ?? params?.conversationid)

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

export async function PATCH(request) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const payload = await request.json()
    const conversationId = Number(payload?.conversationId)

    if (!Number.isFinite(conversationId) || conversationId <= 0) {
      return NextResponse.json({ error: 'conversationId is required' }, { status: 400 })
    }

    const participant = await query(
      'SELECT id FROM chat_participants WHERE conversation_id = ? AND user_id = ? LIMIT 1',
      [conversationId, session.user.id]
    )

    if (!participant?.length) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await query(
      'UPDATE chat_participants SET last_read_at = NOW(3) WHERE conversation_id = ? AND user_id = ?',
      [conversationId, session.user.id]
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to mark conversation read:', error)
    return NextResponse.json({ error: 'Failed to mark conversation read' }, { status: 500 })
  }
}

export async function POST(request) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const payload = await request.json()
    const participantIds = Array.isArray(payload.participants) ? payload.participants : []
    const uniqueParticipantIds = [...new Set(participantIds.map((value) => Number(value)).filter(Boolean))]

    if (!uniqueParticipantIds.length) {
      return NextResponse.json({ error: 'Conversation requires at least one participant' }, { status: 400 })
    }

    if (!uniqueParticipantIds.includes(session.user.id)) {
      uniqueParticipantIds.push(session.user.id)
    }

    const topic = payload.topic ? String(payload.topic).slice(0, 150) : null

    const conversationId = await transaction(async (connection) => {
      const [conversationResult] = await connection.query(
        'INSERT INTO chat_conversations (topic, created_at, updated_at) VALUES (?, NOW(3), NOW(3))',
        [topic]
      )

      const participantValues = uniqueParticipantIds.map((userId) => [conversationResult.insertId, userId])
      await connection.query(
        'INSERT INTO chat_participants (conversation_id, user_id) VALUES ?',
        [participantValues]
      )

      return conversationResult.insertId
    })

    let summary
    try {
      const rows = await query(conversationSummarySql, [conversationId, session.user.id])
      summary = rows?.[0] || null
    } catch (error) {
      console.warn('Avatar-enhanced conversation summary failed, falling back:', error)
      const rows = await query(conversationSummarySqlFallback, [conversationId, session.user.id])
      summary = rows?.[0] || null
    }

    return NextResponse.json({
      conversation: summary,
    }, { status: 201 })
  } catch (error) {
    console.error('Failed to create conversation:', error)
    return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 })
  }
}
