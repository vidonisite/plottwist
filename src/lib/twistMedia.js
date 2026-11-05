import { ID, Permission, Query, Role } from 'appwrite'
import {
  client,
  tablesDB,
  storage,
  DATABASE_ID,
  MESSAGES_TABLE_ID,
  TWISTS_BUCKET_ID,
} from './appwrite.js'

const REFERENCE_PREFIX = 'twist-v1:'
const ALLOWED_RATES = [0.5, 1, 2]

export function parseTwistReference(reference) {
  if (typeof reference === 'string' && reference.startsWith(REFERENCE_PREFIX)) {
    const [, originalFileId, settingsFileId] = reference.split(':')

    if (originalFileId && settingsFileId) {
      return { originalFileId, settingsFileId }
    }
  }

  return {
    originalFileId: reference,
    settingsFileId: null,
  }
}

export function createDefaultTwistSettings(originalFileId) {
  return {
    originalFileId,
    mediaFileId: originalFileId,
    text: '',
    position: 0.5,
    playbackRate: 1,
  }
}

function normalizeSettings(settings, originalFileId) {
  const defaultSettings = createDefaultTwistSettings(originalFileId)
  const playbackRate = Number(settings?.playbackRate)

  return {
    ...defaultSettings,
    ...settings,
    originalFileId,
    mediaFileId:
      typeof settings?.mediaFileId === 'string'
        ? settings.mediaFileId
        : originalFileId,
    text: typeof settings?.text === 'string' ? settings.text : '',
    position: Number.isFinite(Number(settings?.position))
      ? Math.min(1, Math.max(0, Number(settings.position)))
      : 0.5,
    playbackRate: ALLOWED_RATES.includes(playbackRate) ? playbackRate : 1,
  }
}

function getOwnerPermissions(ownerId) {
  return [
    Permission.read(Role.users()),
    Permission.update(Role.user(ownerId)),
    Permission.delete(Role.user(ownerId)),
  ]
}

async function uploadSettingsFile(settings, ownerId) {
  const settingsFileId = ID.unique()
  const file = new File(
    [JSON.stringify(settings)],
    `twist-settings-${settingsFileId}.json`,
    { type: 'application/json' }
  )

  await storage.createFile({
    bucketId: TWISTS_BUCKET_ID,
    fileId: settingsFileId,
    file,
    permissions: getOwnerPermissions(ownerId),
  })

  return settingsFileId
}

export async function createTwistReference(
  originalFileId,
  ownerId,
  overrides = {}
) {
  const settings = normalizeSettings(
    { ...createDefaultTwistSettings(originalFileId), ...overrides },
    originalFileId
  )
  const settingsFileId = await uploadSettingsFile(settings, ownerId)

  return `${REFERENCE_PREFIX}${originalFileId}:${settingsFileId}`
}

export async function loadTwistSettings(reference) {
  const { originalFileId, settingsFileId } = parseTwistReference(reference)
  const defaults = createDefaultTwistSettings(originalFileId)

  if (!settingsFileId) return defaults

  const fileUrl = await storage.getFileView({
    bucketId: TWISTS_BUCKET_ID,
    fileId: settingsFileId,
  })
  const fileData = await client.call(
    'get',
    new URL(fileUrl),
    undefined,
    undefined,
    'arrayBuffer'
  )

  try {
    return normalizeSettings(
      JSON.parse(new TextDecoder().decode(fileData)),
      originalFileId
    )
  } catch {
    return defaults
  }
}

export async function getTwistFile(fileId) {
  const [file, fileUrl] = await Promise.all([
    storage.getFile({ bucketId: TWISTS_BUCKET_ID, fileId }),
    storage.getFileView({ bucketId: TWISTS_BUCKET_ID, fileId }),
  ])
  const fileData = await client.call(
    'get',
    new URL(fileUrl),
    undefined,
    undefined,
    'arrayBuffer'
  )

  return new Blob([fileData], { type: file.mimeType || 'application/octet-stream' })
}

export async function uploadTwistVideoVersion(blob, ownerId) {
  const fileId = ID.unique()
  const file = new File([blob], `twist-video-${fileId}.webm`, {
    type: blob.type || 'video/webm',
  })

  await storage.createFile({
    bucketId: TWISTS_BUCKET_ID,
    fileId,
    file,
    permissions: getOwnerPermissions(ownerId),
  })

  return fileId
}

async function replaceMessageReferences(previousReference, nextReference, messageId) {
  let cursor = null
  let updatedRows = []

  try {
    while (true) {
      const queries = [
        Query.equal('text', [previousReference]),
        Query.equal('type', ['twist']),
        Query.orderAsc('$id'),
        Query.limit(100),
      ]

      if (cursor) queries.push(Query.cursorAfter(cursor))

      const response = await tablesDB.listRows({
        databaseId: DATABASE_ID,
        tableId: MESSAGES_TABLE_ID,
        queries,
      })

      for (const row of response.rows) {
        await tablesDB.updateRow({
          databaseId: DATABASE_ID,
          tableId: MESSAGES_TABLE_ID,
          rowId: row.$id,
          data: { text: nextReference },
        })
        updatedRows.push(row.$id)
      }

      if (response.rows.length < 100) break
      cursor = response.rows[response.rows.length - 1].$id
    }

    if (!updatedRows.includes(messageId)) {
      await tablesDB.updateRow({
        databaseId: DATABASE_ID,
        tableId: MESSAGES_TABLE_ID,
        rowId: messageId,
        data: { text: nextReference },
      })
      updatedRows.push(messageId)
    }
  } catch (error) {
    let rollbackFailed = false

    for (const rowId of updatedRows.reverse()) {
      try {
        await tablesDB.updateRow({
          databaseId: DATABASE_ID,
          tableId: MESSAGES_TABLE_ID,
          rowId,
          data: { text: previousReference },
        })
      } catch (rollbackError) {
        rollbackFailed = true
        console.error('Twist-referensen kunde inte återställas:', rollbackError)
      }
    }

    error.twistAssetsMayBeReferenced = rollbackFailed
    throw error
  }
}

export async function saveTwistEdits({
  messageId,
  reference,
  settings,
  ownerId,
  videoBlob,
}) {
  const { originalFileId } = parseTwistReference(reference)
  const currentSettings = normalizeSettings(settings, originalFileId)
  let nextMediaFileId = currentSettings.mediaFileId
  let uploadedVideoFileId = null

  if (currentSettings.playbackRate === 1) {
    nextMediaFileId = originalFileId
  } else if (videoBlob) {
    uploadedVideoFileId = await uploadTwistVideoVersion(videoBlob, ownerId)
    nextMediaFileId = uploadedVideoFileId
  }

  const nextSettings = {
    ...currentSettings,
    mediaFileId: nextMediaFileId,
  }
  let settingsFileId = null

  try {
    settingsFileId = await uploadSettingsFile(nextSettings, ownerId)
    const nextReference =
      `${REFERENCE_PREFIX}${originalFileId}:${settingsFileId}`

    await replaceMessageReferences(reference, nextReference, messageId)

    return { reference: nextReference, settings: nextSettings }
  } catch (error) {
    if (!error.twistAssetsMayBeReferenced) {
      if (settingsFileId) {
        await storage.deleteFile({
          bucketId: TWISTS_BUCKET_ID,
          fileId: settingsFileId,
        }).catch(() => {})
      }

      if (uploadedVideoFileId) {
        await storage.deleteFile({
          bucketId: TWISTS_BUCKET_ID,
          fileId: uploadedVideoFileId,
        }).catch(() => {})
      }
    }

    throw error
  }
}