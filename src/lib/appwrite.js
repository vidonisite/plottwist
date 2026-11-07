import { Client, Account, Functions, TablesDB } from 'appwrite'

export const client = new Client()
  .setEndpoint(import.meta.env.VITE_APPWRITE_ENDPOINT)
  .setProject(import.meta.env.VITE_APPWRITE_PROJECT_ID)

export const account = new Account(client)
export const functions = new Functions(client)
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

export const MESSAGES_TABLE_ID = '6ae0920b0030a589abcf'
export const MESSAGE_READS_TABLE_ID = '6ae09f460017666a0a81'
export const CALL_SIGNALS_TABLE_ID = '6aef5ebd003a301c8bae'


import { Storage } from 'appwrite'

// Lägg till efter din befintliga client:
export const storage = new Storage(client)

// Din nya Storage-bucket:
export const TWISTS_BUCKET_ID = '6ae78ffd003a848f2985'
