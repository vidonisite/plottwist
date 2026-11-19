
import { Query, ID } from 'appwrite'
import {
  tablesDB,
  DATABASE_ID,
  CONVERSATION_MEMBERS_TABLE_ID,
} from './appwrite.js'

export async function executeGroupMembershipAction(
  action,
  conversationId,
  memberUserId
) {
  if (!DATABASE_ID || !CONVERSATION_MEMBERS_TABLE_ID) {
    throw new Error('Grupphanteringen saknar databaskonfiguration.')
  }

  if (!conversationId || !memberUserId) {
    throw new Error('Chatt eller användare saknas.')
  }

  const response = await tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId: CONVERSATION_MEMBERS_TABLE_ID,
    queries: [
      Query.equal('conversationId', [conversationId]),
      Query.equal('userId', [memberUserId]),
      Query.limit(1),
    ],
  })

  const existingMembership = response.rows[0]

  if (action === 'add') {
    if (existingMembership) {
      return { success: true, message: 'Personen är redan medlem.' }
    }

    await tablesDB.createRow({
      databaseId: DATABASE_ID,
      tableId: CONVERSATION_MEMBERS_TABLE_ID,
      rowId: ID.unique(),
      data: {
        conversationId,
        userId: memberUserId,
      },
    })

    return { success: true }
  }

  if (action === 'kick' || action === 'leave') {
    if (!existingMembership) {
      throw new Error('Gruppmedlemmen hittades inte.')
    }

    await tablesDB.deleteRow({
      databaseId: DATABASE_ID,
      tableId: CONVERSATION_MEMBERS_TABLE_ID,
      rowId: existingMembership.$id,
    })

    return { success: true }
  }

  throw new Error(`Okänd gruppåtgärd: ${action}`)
}
