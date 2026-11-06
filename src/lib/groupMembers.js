import { Query } from 'appwrite'
import { DATABASE_ID, MESSAGES_TABLE_ID, tablesDB } from './appwrite.js'

export async function addLatestMessageTimes(members, conversationId) {
  const recentResponse = await tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId: MESSAGES_TABLE_ID,
    queries: [
      Query.equal('conversationId', [conversationId]),
      Query.orderDesc('$createdAt'),
      Query.limit(100),
    ],
  })
  const latestTimes = new Map()

  recentResponse.rows.forEach((message) => {
    if (!latestTimes.has(message.senderId)) {
      latestTimes.set(message.senderId, message.$createdAt)
    }
  })

  const membersWithoutRecentMessages = members.filter(
    (member) => !latestTimes.has(member.userId)
  )

  await Promise.all(
    membersWithoutRecentMessages.map(async (member) => {
      const response = await tablesDB.listRows({
        databaseId: DATABASE_ID,
        tableId: MESSAGES_TABLE_ID,
        queries: [
          Query.equal('conversationId', [conversationId]),
          Query.equal('senderId', [member.userId]),
          Query.orderDesc('$createdAt'),
          Query.limit(1),
        ],
      })

      if (response.rows[0]?.$createdAt) {
        latestTimes.set(member.userId, response.rows[0].$createdAt)
      }
    })
  )

  return members.map((member) => ({
    ...member,
    lastMessageAt: latestTimes.get(member.userId) || null,
  }))
}
