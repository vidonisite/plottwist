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

function subscriptionRowId(endpoint) {
  return createHash('sha256').update(endpoint).digest('hex').slice(0, 32)
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

export default async ({ req, res, log, error }) => {
  try {
    if (
      !DATABASE_ID ||
      !MESSAGES_TABLE_ID ||
      !MEMBERS_TABLE_ID ||
      !SUBSCRIPTIONS_TABLE_ID
    ) {
      throw new Error('Appwrite-tabellerna för pushnotiser är inte konfigurerade.')
    }

    const client = new Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
      .setKey(process.env.APPWRITE_API_KEY)
    const tablesDB = new TablesDB(client)

    if (req.headers['x-appwrite-trigger'] !== 'event') {
      const userId = req.headers['x-appwrite-user-id']

      if (!userId) {
        return res.json({ message: 'Du måste vara inloggad.' }, 401)
      }

      const subscription = getSubscription(req)
      const rowId = subscriptionRowId(subscription.endpoint)

      if (req.bodyJson.action === 'subscribe') {
        await tablesDB.createRow({
          databaseId: DATABASE_ID,
          tableId: SUBSCRIPTIONS_TABLE_ID,
          rowId,
          data: {
            userId,
            endpoint: subscription.endpoint,
            subscription: JSON.stringify(subscription),
          },
        }).catch(async (createError) => {
          if (createError.code !== 409) throw createError

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
        })

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
          if (deleteError.code !== 404) throw deleteError
        }

        return res.json({ success: true })
      }

      return res.json({ message: 'Ogiltig åtgärd.' }, 400)
    }

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

    const message = req.bodyJson
    if (
      !message?.$id ||
      !message.conversationId ||
      !message.senderId ||
      message.$tableId !== MESSAGES_TABLE_ID
    ) {
      log('Ignorerar event som inte innehåller en ny meddelanderad.')
      return res.json({ success: true, skipped: true })
    }

    const members = await tablesDB.listRows({
      databaseId: DATABASE_ID,
      tableId: MEMBERS_TABLE_ID,
      queries: [
        Query.equal('conversationId', [message.conversationId]),
        Query.limit(100),
      ],
    })
    const recipientIds = [
      ...new Set(
        members.rows
          .map((member) => member.userId)
          .filter((userId) => userId && userId !== message.senderId)
      ),
    ]

    const subscriptions = await Promise.all(
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
    const pushRows = subscriptions.flatMap((result) => result.rows)
    const body =
      message.type === 'twist'
        ? 'Du har fått en ny Twist.'
        : 'Du har fått ett nytt meddelande.'
    const payload = JSON.stringify({
      title: 'PLOT TWIST',
      body,
      url: '/',
    })

    const outcomes = await Promise.allSettled(
      pushRows.map(async (row) => {
        try {
          await webpush.sendNotification(
            JSON.parse(row.subscription),
            payload
          )
        } catch (pushError) {
          if (pushError.statusCode === 404 || pushError.statusCode === 410) {
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
    const failedDeliveries = outcomes.filter(
      (outcome) => outcome.status === 'rejected'
    )

    if (failedDeliveries.length) {
      for (const outcome of failedDeliveries) {
        error(`Pushnotis kunde inte skickas: ${outcome.reason.message}`)
      }

      return res.json(
        { message: `${failedDeliveries.length} pushnotis(er) kunde inte skickas.` },
        500
      )
    }

    log(`Skickade ${pushRows.length} pushnotis(er) för meddelande ${message.$id}.`)
    return res.json({ success: true, sent: pushRows.length })
  } catch (err) {
    error(`Pushnotiser misslyckades: ${err.message}`)
    return res.json({ message: 'Pushnotiserna kunde inte hanteras.' }, 500)
  }
}
