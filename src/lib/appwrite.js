import { Client, Account, TablesDB } from 'appwrite'

export const client = new Client()
  .setEndpoint(import.meta.env.VITE_APPWRITE_ENDPOINT)
  .setProject(import.meta.env.VITE_APPWRITE_PROJECT_ID)

export const account = new Account(client)
export const tablesDB = new TablesDB(client)

export const DATABASE_ID =
  import.meta.env.VITE_APPWRITE_DATABASE_ID

export const USERS_TABLE_ID =
  import.meta.env.VITE_APPWRITE_USERS_TABLE_ID

export const CONTACTS_TABLE_ID =
  import.meta.env.VITE_APPWRITE_CONTACTS_TABLE_ID

export const CONVERSATIONS_TABLE_ID = '6ae09eac002a1e46f2b4'

export const CONVERSATION_MEMBERS_TABLE_ID =
  '6ae0b4bf001ee3d610de'