import { createHash } from 'node:crypto'
import {
  Client,
  Query,
  TablesDB,
} from 'node-appwrite'
import webpush from 'web-push'

const DATABASE_ID = process.env.APPWRITE_DATABASE_ID
const MESSAGES_TABLE_ID = process.env.APPWRITE_MESSAGES_TABLE_ID
const MEMBERS_TABLE_ID = process.env.APPWRITE_CONVERSATION_MEMBERS_TABLE_ID
const SUBSCRIPTIONS_TABLE_ID = process.env.APPWRITE_PUSH_SUBSCRIPTIONS_TABLE_ID
const CONTACTS_TABLE_ID = process.env.APPWRITE_CONTACTS_TABLE_ID
const CONVERSATIONS_TABLE_ID = process.env.APPWRITE_CONVERSATIONS_TABLE_ID
const USERS_TABLE_ID = process.env.APPWRITE_USERS_TABLE_ID
const CALL_SIGNALS_TABLE_ID = process.env.APPWRITE_CALL_SIGNALS_TABLE_ID

function subscriptionRowId(endpoint) {
  return createHash('sha256')
    .update(endpoint)
    .digest('hex')
    .slice(0, 32)
}

function getSubscription(req) {
  const subscription = req.bodyJson?.subscription

  if (
    !subscription ||
    typeof subscription.endpoint !== 'string' ||
    !subscription.endpoint.startsWith('https://') ||
    typeof subscription.keys?.p256dh !== 'string' ||
    typeof subscription.keys?.auth !== 'string'
  ) {
    throw new Error('Ogiltig pushprenumeration.')
  }

  return subscription
}

async function getUserById(tablesDB, userId) {
  if (!userId) return null

  const result = await tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId: USERS_TABLE_ID,
    queries: [
      Query.equal('userId', [userId]),
      Query.limit(1),
    ],
  })

  return result.rows[0] ?? null
}

async function getConversation(tablesDB, conversationId) {
  if (!conversationId) return null

  try {
    return await tablesDB.getRow({
      databaseId: DATABASE_ID,
      tableId: CONVERSATIONS_TABLE_ID,
      rowId: conversationId,
    })
  } catch {
    return null
  }
}

async function sendToUsers(tablesDB, userIds, payload, log, error) {
  const recipientIds = [...new Set(userIds.filter(Boolean))]

  if (!recipientIds.length) {
    log('Inga mottagare för pushnotisen.')
    return 0
  }

  const subscriptionResults = await Promise.all(
    recipientIds.map((userId) =>
      tablesDB.listRows({
        databaseId: DATABASE_ID,
        tableId: SUBSCRIPTIONS_TABLE_ID,
        queries: [
          Query.equal('userId', [userId]),
          Query.limit(100),
        ],
      })
    )
  )

  const pushRows = subscriptionResults.flatMap(
    (result) => result.rows
  )

  const outcomes = await Promise.allSettled(
    pushRows.map(async (row) => {
      try {
        await webpush.sendNotification(
          JSON.parse(row.subscription),
          payload
        )
      } catch (pushError) {
        if (
          pushError.statusCode === 404 ||
          pushError.statusCode === 410
        ) {
          await tablesDB.deleteRow({
            databaseId: DATABASE_ID,
            tableId: SUBSCRIPTIONS_TABLE_ID,
            rowId: row.$id,
          })
          return
        }

        throw pushError
      }
    })
  )

  const failed = outcomes.filter(
    (outcome) => outcome.status === 'rejected'
  )

  for (const outcome of failed) {
    error(
      `Pushnotis kunde inte skickas: ${outcome.reason?.message}`
    )
  }

  if (failed.length) {
    throw new Error(
      `${failed.length} pushnotis(er) kunde inte skickas.`
    )
  }

  return pushRows.length
}

async function handleMessageEvent(
  tablesDB,
  message,
  log,
  error
) {
  if (
    !message.conversationId ||
    !message.senderId
  ) {
    log('Meddelandet saknar conversationId eller senderId.')
    return resSkipped()
  }

  const [members, sender, conversation] = await Promise.all([
    tablesDB.listRows({
      databaseId: DATABASE_ID,
      tableId: MEMBERS_TABLE_ID,
      queries: [
        Query.equal('conversationId', [message.conversationId]),
        Query.limit(100),
      ],
    }),
    getUserById(tablesDB, message.senderId),
    getConversation(tablesDB, message.conversationId),
  ])

  const recipientIds = members.rows
    .map((member) => member.userId)
    .filter(
      (userId) => userId && userId !== message.senderId
    )

  if (!recipientIds.length) {
    log('Meddelandet har inga andra konversationsmedlemmar.')
    return { sent: 0 }
  }

  const senderName = sender?.username || 'Någon'
  const isGroup = conversation?.type === 'group'
  const isTwist = message.type === 'twist'

  let title
  let body

  if (isGroup) {
    title = conversation?.name || 'Gruppchatt'
    body = isTwist
      ? `${senderName} skickade en ny Twist.`
      : `${senderName} skickade ett meddelande.`
  } else {
    title = senderName
    body = isTwist
      ? 'Du har fått en ny Twist.'
      : 'Du har fått ett nytt meddelande.'
  }

  const payload = JSON.stringify({
    title,
    body,
    url: '/',
  })

  const sent = await sendToUsers(
    tablesDB,
    recipientIds,
    payload,
    log,
    error
  )

  log(`Skickade ${sent} meddelandenotiser.`)

  return { sent }
}

async function handleContactEvent(
  tablesDB,
  contact,
  log,
  error
) {
  if (
    !contact.ownerId ||
    !contact.contactUserId
  ) {
    log('Kontaktförfrågan saknar ownerId eller contactUserId.')
    return { sent: 0 }
  }

  if (contact.status !== 'pending') {
    log(`Ignorerar kontakt med status ${contact.status}.`)
    return { sent: 0 }
  }

  const sender = await getUserById(
    tablesDB,
    contact.ownerId
  )

  const senderName = sender?.username || 'Någon'

  const payload = JSON.stringify({
    title: 'Ny kontaktförfrågan',
    body: `@${senderName} vill lägga till dig som kontakt.`,
    url: '/',
  })

  const sent = await sendToUsers(
    tablesDB,
    [contact.contactUserId],
    payload,
    log,
    error
  )

  log(`Skickade ${sent} kontaktförfrågenotiser.`)

  return { sent }
}

async function handleCallSignalEvent(
  tablesDB,
  signal,
  log,
  error
) {
  if (signal.type !== 'offer') {
    return { sent: 0, skipped: true }
  }

  if (!signal.conversationId || !signal.senderId || !signal.recipientId) {
    log('Samtalssignalen saknar avsändare, mottagare eller konversation.')
    return { sent: 0, skipped: true }
  }

  const [members, sender, conversation] = await Promise.all([
    tablesDB.listRows({
      databaseId: DATABASE_ID,
      tableId: MEMBERS_TABLE_ID,
      queries: [
        Query.equal('conversationId', [signal.conversationId]),
        Query.limit(3),
      ],
    }),
    getUserById(tablesDB, signal.senderId),
    getConversation(tablesDB, signal.conversationId),
  ])

  const memberIds = members.rows.map((member) => member.userId)
  if (
    conversation?.type !== 'direct' ||
    memberIds.length !== 2 ||
    !memberIds.includes(signal.senderId) ||
    !memberIds.includes(signal.recipientId)
  ) {
    log('Ignorerar samtalsnotis för en ogiltig privat konversation.')
    return { sent: 0, skipped: true }
  }

  const senderName = sender?.username || 'Någon'
  const call = (() => {
    try {
      return JSON.parse(signal.payload || '{}')
    } catch {
      return {}
    }
  })()
  const params = new URLSearchParams({
    conversationId: signal.conversationId,
    ...(call.callId ? { callId: call.callId } : {}),
  })
  const payload = JSON.stringify({
    title: `Röstsamtal från @${senderName}`,
    body: `Inkommande samtal i ${conversation.name || 'privat chatt'}`,
    url: `/?${params.toString()}`,
    type: 'incoming-call',
    conversationId: signal.conversationId,
  })

  const sent = await sendToUsers(
    tablesDB,
    [signal.recipientId],
    payload,
    log,
    error
  )

  log(`Skickade ${sent} inkommande samtalsnotiser.`)
  return { sent }
}

function resSkipped() {
  return { skipped: true, sent: 0 }
}

export default async ({ req, res, log, error }) => {
  try {
    if (
      !DATABASE_ID ||
      !MESSAGES_TABLE_ID ||
      !MEMBERS_TABLE_ID ||
      !SUBSCRIPTIONS_TABLE_ID
    ) {
      throw new Error(
        'Appwrite-tabellerna för pushnotiser är inte konfigurerade.'
      )
    }

    const client = new Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
      .setKey(process.env.APPWRITE_API_KEY)

    const tablesDB = new TablesDB(client)

    // Hantera prenumerationer från frontend.
    if (req.headers['x-appwrite-trigger'] !== 'event') {
      const userId = req.headers['x-appwrite-user-id']

      if (!userId) {
        return res.json(
          { message: 'Du måste vara inloggad.' },
          401
        )
      }

      const subscription = getSubscription(req)
      const rowId = subscriptionRowId(subscription.endpoint)

      if (req.bodyJson.action === 'subscribe') {
        try {
          await tablesDB.createRow({
            databaseId: DATABASE_ID,
            tableId: SUBSCRIPTIONS_TABLE_ID,
            rowId,
            data: {
              userId,
              endpoint: subscription.endpoint,
              subscription: JSON.stringify(subscription),
            },
          })
        } catch (createError) {
          if (createError.code !== 409) {
            throw createError
          }

          await tablesDB.updateRow({
            databaseId: DATABASE_ID,
            tableId: SUBSCRIPTIONS_TABLE_ID,
            rowId,
            data: {
              userId,
              endpoint: subscription.endpoint,
              subscription: JSON.stringify(subscription),
            },
          })
        }

        return res.json({ success: true })
      }

      if (req.bodyJson.action === 'unsubscribe') {
        try {
          await tablesDB.deleteRow({
            databaseId: DATABASE_ID,
            tableId: SUBSCRIPTIONS_TABLE_ID,
            rowId,
          })
        } catch (deleteError) {
          if (deleteError.code !== 404) {
            throw deleteError
          }
        }

        return res.json({ success: true })
      }

      return res.json(
        { message: 'Ogiltig åtgärd.' },
        400
      )
    }

    // Pushinställningar behövs bara för riktiga event.
    if (
      !process.env.VAPID_PUBLIC_KEY ||
      !process.env.VAPID_PRIVATE_KEY ||
      !process.env.VAPID_SUBJECT
    ) {
      throw new Error('VAPID-nycklarna är inte konfigurerade.')
    }

    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT,
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    )

    const eventName = req.headers['x-appwrite-event']

    if (eventName && !eventName.endsWith('.create')) {
      log(`Ignorerar Appwrite-eventet ${eventName}.`)
      return res.json({ success: true, skipped: true })
    }

    const row = req.bodyJson
    const tableId = row?.$tableId

    if (!row?.$id || !tableId) {
      log('Eventet saknar rad-ID eller tabell-ID.')
      return res.json({ success: true, skipped: true })
    }

    // Nytt meddelande.
    if (tableId === MESSAGES_TABLE_ID) {
      const result = await handleMessageEvent(
        tablesDB,
        row,
        log,
        error
      )

      return res.json({
        success: true,
        type: 'message',
        ...result,
      })
    }

    // Ny kontaktförfrågan.
    if (
      CONTACTS_TABLE_ID &&
      tableId === CONTACTS_TABLE_ID
    ) {
      const result = await handleContactEvent(
        tablesDB,
        row,
        log,
        error
      )

      return res.json({
        success: true,
        type: 'contact',
        ...result,
      })
    }

    if (CALL_SIGNALS_TABLE_ID && tableId === CALL_SIGNALS_TABLE_ID) {
      const result = await handleCallSignalEvent(
        tablesDB,
        row,
        log,
        error
      )

      return res.json({
        success: true,
        type: 'call',
        ...result,
      })
    }

    log(`Ignorerar event från tabell ${tableId}.`)

    return res.json({ success: true, skipped: true })
  } catch (err) {
    error(`Pushnotiser misslyckades: ${err.message}`)

    return res.json(
      { message: 'Pushnotiserna kunde inte hanteras.' },
      500
    )
  }
}
