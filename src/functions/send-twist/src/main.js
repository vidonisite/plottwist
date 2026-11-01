import {
  Client,
  TablesDB,
  Storage,
  Query,
  ID,
  Permission,
  Role,
} from 'node-appwrite'

const DATABASE_ID = process.env.APPWRITE_DATABASE_ID
const MESSAGES_TABLE_ID = process.env.APPWRITE_MESSAGES_TABLE_ID
const MEMBERS_TABLE_ID = process.env.APPWRITE_CONVERSATION_MEMBERS_TABLE_ID
const TWISTS_BUCKET_ID = process.env.APPWRITE_TWISTS_BUCKET_ID

export default async ({ req, res, log, error }) => {
  try {
    const userId = req.headers['x-appwrite-user-id']

    if (!userId) {
      return res.json(
        { success: false, message: 'Du måste vara inloggad.' },
        401
      )
    }

    const body = req.bodyJson ?? {}

    const { fileId, type, conversationIds } = body

    if (!fileId || !['photo', 'video'].includes(type)) {
      return res.json(
        { success: false, message: 'Ogiltig fil eller meddelandetyp.' },
        400
      )
    }

    if (
      !Array.isArray(conversationIds) ||
      conversationIds.length === 0 ||
      conversationIds.length > 50
    ) {
      return res.json(
        { success: false, message: 'Välj minst en mottagare.' },
        400
      )
    }

    const uniqueConversationIds = [...new Set(conversationIds)]

    const client = new Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
      .setKey(process.env.APPWRITE_API_KEY)

    const tablesDB = new TablesDB(client)
    const storage = new Storage(client)

    // Kontrollera att filen finns i rätt bucket.
    const file = await storage.getFile({
      bucketId: TWISTS_BUCKET_ID,
      fileId,
    })

    if (!file) {
      return res.json(
        { success: false, message: 'Filen kunde inte hittas.' },
        404
      )
    }

    // Kontrollera varje konversation innan något skickas.
    const verifiedConversations = []

    for (const conversationId of uniqueConversationIds) {
      const membership = await tablesDB.listRows({
        databaseId: DATABASE_ID,
        tableId: MEMBERS_TABLE_ID,
        queries: [
          Query.equal('conversationId', conversationId),
          Query.equal('userId', userId),
          Query.limit(1),
        ],
      })

      if (!membership.rows.length) {
        return res.json(
          {
            success: false,
            message: 'Du har inte behörighet till en av konversationerna.',
          },
          403
        )
      }

      verifiedConversations.push(conversationId)
    }

    // Ge endast medlemmarna i de valda konversationerna läsrättighet
    // till filen. Avsändaren får också behålla åtkomst.
    const allowedUserIds = new Set([userId])

    for (const conversationId of verifiedConversations) {
      const members = await tablesDB.listRows({
        databaseId: DATABASE_ID,
        tableId: MEMBERS_TABLE_ID,
        queries: [
          Query.equal('conversationId', conversationId),
          Query.limit(100),
        ],
      })

      for (const member of members.rows) {
        if (member.userId) allowedUserIds.add(member.userId)
      }
    }

    const filePermissions = [
      ...[...allowedUserIds].map((id) =>
        Permission.read(Role.user(id))
      ),
      Permission.update(Role.user(userId)),
      Permission.delete(Role.user(userId)),
    ]

    await storage.updateFile({
      bucketId: TWISTS_BUCKET_ID,
      fileId,
      permissions: filePermissions,
    })

    
    // Skapa en egen meddelanderad i varje konversation.
    const createdMessages = []

    for (const conversationId of verifiedConversations) {
      const members = await tablesDB.listRows({
        databaseId: DATABASE_ID,
        tableId: MEMBERS_TABLE_ID,
        queries: [
          Query.equal('conversationId', conversationId),
          Query.limit(100),
        ],
      })

      const conversationUserIds = new Set([
        userId,
        ...members.rows.map((member) => member.userId).filter(Boolean),
      ])

      const messagePermissions = [
        ...[...conversationUserIds].map((id) =>
          Permission.read(Role.user(id))
        ),
        Permission.update(Role.user(userId)),
        Permission.delete(Role.user(userId)),
      ]

      const message = await tablesDB.createRow({
        databaseId: DATABASE_ID,
        tableId: MESSAGES_TABLE_ID,
        rowId: ID.unique(),
        data: {
          conversationId,
          senderId: userId,
          text: fileId,
          type,
        },
        permissions: messagePermissions,
      })

      createdMessages.push({
        id: message.$id,
        conversationId,
      })
    }


    log(`Twist skickad av ${userId} till ${createdMessages.length} konversationer.`)

    return res.json({
      success: true,
      fileId,
      messages: createdMessages,
    })
  } catch (err) {
    error(`Send Twist misslyckades: ${err.message}`)

    return res.json(
      {
        success: false,
        message: 'Twisten kunde inte skickas. Försök igen.',
      },
      500
    )
  }
}