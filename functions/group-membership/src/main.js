import {
  Client,
  ID,
  Permission,
  Query,
  Role,
  TablesDB,
} from 'node-appwrite'

const DATABASE_ID = process.env.APPWRITE_DATABASE_ID
const CONVERSATIONS_TABLE_ID = process.env.APPWRITE_CONVERSATIONS_TABLE_ID
const MEMBERS_TABLE_ID = process.env.APPWRITE_CONVERSATION_MEMBERS_TABLE_ID
const CONTACTS_TABLE_ID = process.env.APPWRITE_CONTACTS_TABLE_ID

function isValidId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 64
}

export default async ({ req, res, log, error }) => {
  const userId = req.headers['x-appwrite-user-id']
  if (!userId) {
    return res.json({ success: false, message: 'Du måste vara inloggad.' }, 401)
  }

  try {
    const { action, conversationId, memberUserId } = req.bodyJson ?? {}

    if (
      !['add', 'kick', 'leave'].includes(action) ||
      !isValidId(conversationId) ||
      !isValidId(memberUserId)
    ) {
      return res.json(
        { success: false, message: 'Ogiltig grupp eller medlem.' },
        400
      )
    }

    if (
      (action === 'leave' && memberUserId !== userId) ||
      (action === 'kick' && memberUserId === userId)
    ) {
      return res.json(
        { success: false, message: 'Ogiltig åtgärd för gruppmedlemmen.' },
        400
      )
    }

    const client = new Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
      .setKey(process.env.APPWRITE_API_KEY)
    const tablesDB = new TablesDB(client)

    const conversation = await tablesDB.getRow({
      databaseId: DATABASE_ID,
      tableId: CONVERSATIONS_TABLE_ID,
      rowId: conversationId,
    })

    if (conversation.type !== 'group') {
      return res.json(
        { success: false, message: 'Det går bara att hantera grupper.' },
        400
      )
    }

    const [actorMembership, targetMembership] = await Promise.all([
      tablesDB.listRows({
        databaseId: DATABASE_ID,
        tableId: MEMBERS_TABLE_ID,
        queries: [
          Query.equal('conversationId', [conversationId]),
          Query.equal('userId', [userId]),
          Query.limit(1),
        ],
      }),
      tablesDB.listRows({
        databaseId: DATABASE_ID,
        tableId: MEMBERS_TABLE_ID,
        queries: [
          Query.equal('conversationId', [conversationId]),
          Query.equal('userId', [memberUserId]),
          Query.limit(1),
        ],
      }),
    ])

    if (!actorMembership.rows.length) {
      return res.json(
        { success: false, message: 'Du är inte medlem i gruppen.' },
        403
      )
    }

    if (action === 'add') {
      if (targetMembership.rows.length) {
        return res.json(
          { success: false, message: 'Personen är redan medlem i gruppen.' },
          409
        )
      }

      const acceptedContact = await tablesDB.listRows({
        databaseId: DATABASE_ID,
        tableId: CONTACTS_TABLE_ID,
        queries: [
          Query.equal('ownerId', [userId]),
          Query.equal('contactUserId', [memberUserId]),
          Query.equal('status', ['accepted']),
          Query.limit(1),
        ],
      })

      if (!acceptedContact.rows.length) {
        return res.json(
          { success: false, message: 'Du kan bara lägga till accepterade kontakter.' },
          403
        )
      }

      const membership = await tablesDB.createRow({
        databaseId: DATABASE_ID,
        tableId: MEMBERS_TABLE_ID,
        rowId: ID.unique(),
        data: { userId: memberUserId, conversationId },
        permissions: [Permission.read(Role.users())],
      })

      log(`User ${memberUserId} added to group ${conversationId} by ${userId}.`)
      return res.json({ success: true, membershipId: membership.$id })
    }

    const target = targetMembership.rows[0]
    if (!target) {
      return res.json(
        { success: false, message: 'Medlemmen finns inte i gruppen.' },
        404
      )
    }

    await tablesDB.deleteRow({
      databaseId: DATABASE_ID,
      tableId: MEMBERS_TABLE_ID,
      rowId: target.$id,
    })

    log(
      action === 'leave'
        ? `User ${userId} left group ${conversationId}.`
        : `User ${memberUserId} removed from group ${conversationId} by ${userId}.`
    )
    return res.json({ success: true })
  } catch (caughtError) {
    error(`Group membership operation failed: ${caughtError.message}`)
    return res.json(
      { success: false, message: 'Gruppmedlemskapet kunde inte ändras.' },
      500
    )
  }
}
