import { useEffect, useState } from 'react'
import { ID, Permission, Role, Query } from 'appwrite'

import {
  tablesDB,
  DATABASE_ID,
  USERS_TABLE_ID,
  CONTACTS_TABLE_ID,
  CONVERSATIONS_TABLE_ID,
  CONVERSATION_MEMBERS_TABLE_ID,
} from './lib/appwrite.js'

import './CreateGroup.css'
import ProfileAvatar from './components/ProfileAvatar.jsx'

export default function CreateGroup({
  currentUser,
  onCreated,
  onCancel,
}) {
  const [contacts, setContacts] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [groupName, setGroupName] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadContacts() {
      setLoading(true)
      setErrorMessage('')

      try {
        const [contactsResponse, profilesResponse] = await Promise.all([
          tablesDB.listRows({
            databaseId: DATABASE_ID,
            tableId: CONTACTS_TABLE_ID,
            queries: [
              Query.equal('ownerId', [currentUser.$id]),
              Query.equal('status', ['accepted']),
              Query.limit(500),
            ],
          }),

          tablesDB.listRows({
            databaseId: DATABASE_ID,
            tableId: USERS_TABLE_ID,
            queries: [Query.limit(100)],
          }),
        ])

        const profiles = profilesResponse.rows

        const loadedContacts = contactsResponse.rows.map((contact) => {
          const profile = profiles.find(
            (item) => item.userId === contact.contactUserId
          )

          return {
            userId: contact.contactUserId,
            username:
              profile?.username ||
              contact.contactUsername ||
              'Okänd användare',
            avatarProfile: profile,
          }
        })

        if (!cancelled) {
          setContacts(loadedContacts)
        }
      } catch (error) {
        console.error('Kunde inte ladda kontakter:', error)

        if (!cancelled) {
          setErrorMessage(
            `Kunde inte ladda kontakter: ${error.message || 'Okänt fel'}`
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    if (currentUser?.$id) {
      loadContacts()
    }

    return () => {
      cancelled = true
    }
  }, [currentUser])

  const filteredContacts = contacts.filter((contact) =>
    contact.username.toLowerCase().includes(search.trim().toLowerCase())
  )

  function toggleContact(userId) {
    setSelectedIds((previous) =>
      previous.includes(userId)
        ? previous.filter((id) => id !== userId)
        : [...previous, userId]
    )
  }

  async function createGroup(event) {
    event.preventDefault()

    const name = groupName.trim()

    if (!name) {
      setErrorMessage('Skriv ett namn på gruppen.')
      return
    }

    if (selectedIds.length === 0) {
      setErrorMessage('Välj minst en person till gruppen.')
      return
    }

    if (!currentUser?.$id) {
      setErrorMessage('Du måste vara inloggad för att skapa en grupp.')
      return
    }

    setCreating(true)
    setErrorMessage('')

    try {
      const conversation = await tablesDB.createRow({
        databaseId: DATABASE_ID,
        tableId: CONVERSATIONS_TABLE_ID,
        rowId: ID.unique(),
        data: {
          type: 'group',
          name,
          createdBy: currentUser.$id,
          directKey: '',
        },
        permissions: [
          Permission.read(Role.users()),
          Permission.update(Role.users()),
          Permission.delete(Role.users()),
        ],
      })

      // Lägg till skaparen och alla valda kontakter.
      const allMemberIds = [
        currentUser.$id,
        ...selectedIds,
      ]

      for (const userId of allMemberIds) {
        await tablesDB.createRow({
          databaseId: DATABASE_ID,
          tableId: CONVERSATION_MEMBERS_TABLE_ID,
          rowId: ID.unique(),
          data: {
            userId,
            conversationId: conversation.$id,
          },
          permissions: [
            Permission.read(Role.users()),
          ],
        })
      }

      onCreated(conversation)
    } catch (error) {
      console.error('Kunde inte skapa grupp:', {
        message: error.message,
        code: error.code,
        type: error.type,
        response: error.response,
      })

      setErrorMessage(
        `Gruppen kunde inte skapas: ${error.message || 'Okänt fel'}`
      )
    } finally {
      setCreating(false)
    }
  }

  return (
    <section className="create-group-page">
      <div className="create-group-header">
        <div className="create-group-symbol">♧</div>

        <div>
          <p className="create-group-eyebrow">PLOT TWIST</p>
          <h1>Skapa en grupp</h1>
          <p className="create-group-description">
            Samla dina vänner i en gemensam konversation.
          </p>
        </div>
      </div>

      <form onSubmit={createGroup} className="create-group-form">
        <div className="create-group-field">
          <label htmlFor="group-name">Gruppens namn</label>
          <input
            id="group-name"
            value={groupName}
            onChange={(event) => setGroupName(event.target.value)}
            placeholder="T.ex. Bästa gänget"
            maxLength={50}
            autoComplete="off"
          />
        </div>

        <div className="create-group-contacts-heading">
          <div>
            <h2>Välj medlemmar</h2>
            <p>Du läggs automatiskt till i gruppen.</p>
          </div>

          <span className="selected-count">
            {selectedIds.length} valda
          </span>
        </div>

        <label className="create-group-search">
          <span aria-hidden="true">⌕</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Sök bland dina vänner..."
            autoComplete="off"
          />

          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Rensa sökning"
            >
              ×
            </button>
          )}
        </label>

        <div className="create-group-contact-list">
          {loading && (
            <p className="create-group-muted">Hämtar dina kontakter...</p>
          )}

          {!loading && contacts.length === 0 && (
            <div className="create-group-empty">
              <span>♡</span>
              <strong>Du har inga kontakter ännu</strong>
              <p>Lägg till vänner innan du skapar en grupp.</p>
            </div>
          )}

          {!loading && contacts.length > 0 && filteredContacts.length === 0 && (
            <p className="create-group-muted">
              Inga kontakter matchar sökningen.
            </p>
          )}

          {filteredContacts.map((contact) => {
            const selected = selectedIds.includes(contact.userId)

            return (
              <button
                type="button"
                key={contact.userId}
                className={`create-group-contact ${
                  selected ? 'selected' : ''
                }`}
                onClick={() => toggleContact(contact.userId)}
              >
                <ProfileAvatar
                  profile={contact.avatarProfile}
                  userId={contact.userId}
                  name={contact.username}
                  size={39}
                  className="create-group-avatar"
                />

                <span className="create-group-contact-name">
                  @{contact.username}
                </span>

                <span className="create-group-checkbox">
                  {selected ? '✓' : ''}
                </span>
              </button>
            )
          })}
        </div>

        {selectedIds.length > 0 && (
          <div className="selected-members">
            {selectedIds.map((userId) => {
              const contact = contacts.find(
                (item) => item.userId === userId
              )

              if (!contact) return null

              return (
                <button
                  type="button"
                  key={userId}
                  className="selected-member-chip"
                  onClick={() => toggleContact(userId)}
                  title={`Ta bort @${contact.username}`}
                >
                  @{contact.username}
                  <span>×</span>
                </button>
              )
            })}
          </div>
        )}

        {errorMessage && (
          <p className="create-group-error" role="alert">
            {errorMessage}
          </p>
        )}

        <div className="create-group-actions">
          <button
            type="button"
            className="create-group-cancel"
            onClick={onCancel}
            disabled={creating}
          >
            Avbryt
          </button>

          <button
            type="submit"
            className="create-group-submit"
            disabled={creating || loading}
          >
            {creating ? 'Skapar grupp...' : 'Skapa grupp'}
            {!creating && <span>↗</span>}
          </button>
        </div>
      </form>
    </section>
  )
}
