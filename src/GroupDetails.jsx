import { useCallback, useEffect, useState } from 'react'
import { Query } from 'appwrite'
import {
  client,
  tablesDB,
  DATABASE_ID,
  USERS_TABLE_ID,
  CONTACTS_TABLE_ID,
  CONVERSATION_MEMBERS_TABLE_ID,
} from './lib/appwrite.js'
import { executeGroupMembershipAction } from './lib/groupMembership.js'
import ProfileAvatar from './components/ProfileAvatar.jsx'
import ProfileUsername from './components/ProfileUsername.jsx'

export default function GroupDetails({
  group,
  currentUser,
  isActive,
  onClose,
  onLeave,
}) {
  const [members, setMembers] = useState([])
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyUserId, setBusyUserId] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')

  const loadGroup = useCallback(async () => {
    setLoading(true)
    setErrorMessage('')

    try {
      const [membersResponse, contactsResponse] = await Promise.all([
        tablesDB.listRows({
          databaseId: DATABASE_ID,
          tableId: CONVERSATION_MEMBERS_TABLE_ID,
          queries: [
            Query.equal('conversationId', [group.id]),
            Query.limit(100),
          ],
        }),
        tablesDB.listRows({
          databaseId: DATABASE_ID,
          tableId: CONTACTS_TABLE_ID,
          queries: [
            Query.equal('ownerId', [currentUser.$id]),
            Query.equal('status', ['accepted']),
            Query.limit(500),
          ],
        }),
      ])

      const memberships = membersResponse.rows
      const currentMemberIds = new Set(
        memberships.map((member) => member.userId)
      )
      const profileUserIds = [...new Set([
        ...memberships.map((member) => member.userId),
        ...contactsResponse.rows.map((contact) => contact.contactUserId),
      ].filter(Boolean))]
      const profilesResponse = profileUserIds.length
        ? await tablesDB.listRows({
          databaseId: DATABASE_ID,
          tableId: USERS_TABLE_ID,
          queries: [
            Query.equal('userId', profileUserIds),
            Query.limit(profileUserIds.length),
          ],
        })
        : { rows: [] }
      const profiles = profilesResponse.rows

      const groupMembers = memberships.map((member) => {
        const profile = profiles.find(
          (item) => item.userId === member.userId
        )

        return {
          ...member,
          username: profile?.username || 'Okänd användare',
          avatarProfile: profile || null,
        }
      })

      const acceptedContacts = contactsResponse.rows.map((contact) => ({
        userId: contact.contactUserId,
        fallbackName: contact.contactUsername,
      }))

      const uniqueContacts = Array.from(
        new Map(
          acceptedContacts
            .filter((contact) => (
              contact.userId &&
              contact.userId !== currentUser.$id &&
              !currentMemberIds.has(contact.userId)
            ))
            .map((contact) => [contact.userId, contact])
        ).values()
      )

      setMembers(groupMembers)
      setContacts(
        uniqueContacts
          .map((contact) => {
            const profile = profiles.find(
              (item) => item.userId === contact.userId
            )

            return {
              userId: contact.userId,
              username: profile?.username || contact.fallbackName || 'Okänd användare',
              avatarProfile: profile || null,
            }
          })
          .sort((a, b) => a.username.localeCompare(b.username))
      )
    } catch (error) {
      console.error('Kunde inte ladda gruppinformationen:', error)
      setErrorMessage(
        `Gruppinformationen kunde inte laddas: ${error.message || 'Okänt fel'}`
      )
    } finally {
      setLoading(false)
    }
  }, [currentUser.$id, group.id])

  useEffect(() => {
    if (!isActive) return

    loadGroup()

    const unsubscribe = client.subscribe(
      `databases.${DATABASE_ID}.tables.${CONVERSATION_MEMBERS_TABLE_ID}.rows`,
      ({ events = [], payload }) => {
        const membershipChanged = events.some((event) => (
          event.endsWith('.create') || event.endsWith('.delete')
        ))

        if (membershipChanged && payload?.conversationId === group.id) {
          loadGroup()
        }
      }
    )

    function closeOnEscape(event) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', closeOnEscape)

    return () => {
      unsubscribe()
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [isActive, group.id, loadGroup, onClose])

  async function addMember(contact) {
    setBusyUserId(contact.userId)
    setErrorMessage('')

    try {
      await executeGroupMembershipAction('add', group.id, contact.userId)
    } catch (error) {
      console.error('Kunde inte lägga till gruppmedlem:', error)
      setErrorMessage(error.message || 'Personen kunde inte läggas till.')
    } finally {
      setBusyUserId(null)
    }
  }

  async function removeMember(member, action) {
    const isLeaving = action === 'leave'
    const confirmed = window.confirm(
      isLeaving
        ? `Vill du lämna gruppen ${group.name}?`
        : `Vill du ta bort ${member.username} från gruppen?`
    )

    if (!confirmed) return

    setBusyUserId(member.userId)
    setErrorMessage('')

    try {
      await executeGroupMembershipAction(action, group.id, member.userId)

      if (isLeaving) {
        onLeave()
      }
    } catch (error) {
      console.error('Kunde inte ändra gruppmedlemskap:', error)
      setErrorMessage(error.message || 'Gruppmedlemskapet kunde inte ändras.')
    } finally {
      setBusyUserId(null)
    }
  }

  const ownMembership = members.find(
    (member) => member.userId === currentUser.$id
  )

  return (
    <div className="group-details-page">
      <header className="group-details-header">
        <div className="group-details-heading">
          <button
            type="button"
            className="group-details-back"
            onClick={onClose}
            aria-label="Tillbaka till chatten"
          >
            <span aria-hidden="true">←</span>
            <span>Tillbaka till chatten</span>
          </button>

          <p>GRUPPINFORMATION</p>
          <h2>{group.name}</h2>
          <span>{members.length} medlemmar</span>
        </div>
      </header>

      <div className="group-details-content">
        {errorMessage && (
          <p className="group-details-error" role="alert">
            {errorMessage}
          </p>
        )}

        <section className="group-details-section">
          <h3>Medlemmar</h3>

          {loading ? (
            <p className="group-details-muted">Hämtar medlemmar...</p>
          ) : members.length === 0 ? (
            <p className="group-details-muted">Inga medlemmar hittades.</p>
          ) : (
            <div className="group-details-list">
              {members.map((member) => {
                const isSelf = member.userId === currentUser.$id

                return (
                  <div className="group-details-person" key={member.$id}>
                    <ProfileAvatar
                      profile={member.avatarProfile}
                      userId={member.userId}
                      name={member.username}
                      size={40}
                    />

                    <span className="group-details-person-name">
                      <ProfileUsername
                        profile={member.avatarProfile}
                        name={member.username}
                      />
                      {isSelf && <small>Du</small>}
                    </span>

                    {!isSelf && (
                      <button
                        type="button"
                        className="group-details-remove"
                        disabled={busyUserId !== null}
                        onClick={() => removeMember(member, 'kick')}
                      >
                        Ta bort
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section className="group-details-section">
          <h3>Lägg till personer</h3>

          {loading ? (
            <p className="group-details-muted">Hämtar kontakter...</p>
          ) : contacts.length === 0 ? (
            <p className="group-details-muted">
              Dina kontakter finns redan i gruppen eller så har du inga accepterade kontakter.
            </p>
          ) : (
            <div className="group-details-list group-details-contact-list">
              {contacts.map((contact) => (
                <div className="group-details-person" key={contact.userId}>
                  <ProfileAvatar
                    profile={contact.avatarProfile}
                    userId={contact.userId}
                    name={contact.username}
                    size={40}
                  />

                  <span className="group-details-person-name">
                    <ProfileUsername
                      profile={contact.avatarProfile}
                      name={contact.username}
                    />
                  </span>

                  <button
                    type="button"
                    className="group-details-add"
                    disabled={busyUserId !== null}
                    onClick={() => addMember(contact)}
                  >
                    {busyUserId === contact.userId ? 'Lägger till...' : 'Lägg till'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <footer className="group-details-footer">
        <button
          type="button"
          className="group-details-leave"
          disabled={!ownMembership || busyUserId !== null}
          onClick={() => removeMember(ownMembership, 'leave')}
        >
          Lämna gruppen
        </button>
      </footer>
    </div>
  )
}
