import { functions } from './appwrite.js'

const GROUP_MEMBERSHIP_FUNCTION_ID =
  import.meta.env.VITE_APPWRITE_GROUP_MEMBERSHIP_FUNCTION_ID

export async function executeGroupMembershipAction(
  action,
  conversationId,
  memberUserId
) {
  if (!GROUP_MEMBERSHIP_FUNCTION_ID) {
    throw new Error('Grupphantering är inte konfigurerad.')
  }

  const execution = await functions.createExecution({
    functionId: GROUP_MEMBERSHIP_FUNCTION_ID,
    body: JSON.stringify({ action, conversationId, memberUserId }),
    async: false,
  })

  let response = {}
  try {
    const parsedResponse = JSON.parse(execution.responseBody || '{}')
    response =
      parsedResponse && typeof parsedResponse === 'object'
        ? parsedResponse
        : {}
  } catch {
    throw new Error('Grupphanteringen svarade med ett ogiltigt svar.')
  }

  if (
    execution.responseStatusCode < 200 ||
    execution.responseStatusCode >= 300 ||
    response.success !== true
  ) {
    throw new Error(
      response.message ||
      `Grupphanteringen misslyckades (status ${execution.responseStatusCode}).`
    )
  }

  return response
}
