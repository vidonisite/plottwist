import { useCallback, useEffect, useRef, useState } from 'react'
import { ID, Permission, Query, Role } from 'appwrite'
import {
  client,
  tablesDB,
  DATABASE_ID,
  CALL_SIGNALS_TABLE_ID,
  CONVERSATIONS_TABLE_ID,
  CONVERSATION_MEMBERS_TABLE_ID,
  USERS_TABLE_ID,
} from '../lib/appwrite.js'

const CALL_TIMEOUT_MS = 30_000
const ENDED_NOTICE_MS = 4_000
const SIGNAL_RETENTION_MS = 24 * 60 * 60 * 1000

function parsePayload(value) {
  try {
    return JSON.parse(value || '{}')
  } catch {
    return {}
  }
}

function getIceServers() {
  const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }]
  const turnUrls = import.meta.env.VITE_WEBRTC_TURN_URL
    ?.split(',')
    .map((url) => url.trim())
    .filter(Boolean)

  if (turnUrls?.length) {
    const turnServer = { urls: turnUrls }
    const username = import.meta.env.VITE_WEBRTC_TURN_USERNAME
    const credential = import.meta.env.VITE_WEBRTC_TURN_CREDENTIAL

    if (username && credential) {
      turnServer.username = username
      turnServer.credential = credential
    }

    iceServers.push(turnServer)
  }

  return iceServers
}

function makeCallId() {
  return globalThis.crypto?.randomUUID?.() || ID.unique()
}

export default function useVoiceCall(currentUser) {
  const currentUserId = currentUser?.$id
  const [call, setCall] = useState(null)
  const [muted, setMuted] = useState(false)
  const callRef = useRef(null)
  const peerConnectionRef = useRef(null)
  const localStreamRef = useRef(null)
  const seenSignalIdsRef = useRef(new Set())
  const queuedCandidatesRef = useRef(new Map())
  const callTimeoutRef = useRef(null)
  const dismissTimeoutRef = useRef(null)
  const signalHandlerRef = useRef(null)

  const publishCall = useCallback((nextCall) => {
    callRef.current = nextCall
    setCall(nextCall)
  }, [])

  const patchCall = useCallback((callId, changes) => {
    const current = callRef.current
    if (!current || current.callId !== callId) return
    publishCall({ ...current, ...changes })
  }, [publishCall])

  const deleteSignal = useCallback(async (signal) => {
    if (!signal?.$id) return
    try {
      await tablesDB.deleteRow({
        databaseId: DATABASE_ID,
        tableId: CALL_SIGNALS_TABLE_ID,
        rowId: signal.$id,
      })
    } catch (error) {
      if (error?.code !== 404 && error?.code !== 401 && error?.code !== 403) {
        console.warn('Kunde inte rensa samtalssignal:', error)
      }
    }
  }, [])

  const sendSignal = useCallback(async (callData, type, payload) => {
    if (!currentUserId || !callData?.remoteUserId || !callData?.conversationId) {
      throw new Error('Samtalssignalen saknar mottagare eller konversation.')
    }

    return tablesDB.createRow({
      databaseId: DATABASE_ID,
      tableId: CALL_SIGNALS_TABLE_ID,
      rowId: ID.unique(),
      data: {
        conversationId: callData.conversationId,
        senderId: currentUserId,
        recipientId: callData.remoteUserId,
        type,
        payload: JSON.stringify({ callId: callData.callId, ...payload }),
      },
      permissions: [
        Permission.read(Role.user(currentUserId)),
        Permission.read(Role.user(callData.remoteUserId)),
        Permission.delete(Role.user(currentUserId)),
        Permission.delete(Role.user(callData.remoteUserId)),
      ],
    })
  }, [currentUserId])

  const releaseMediaAndPeer = useCallback(() => {
    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current)
      callTimeoutRef.current = null
    }

    const peerConnection = peerConnectionRef.current
    peerConnectionRef.current = null
    if (peerConnection) {
      peerConnection.onicecandidate = null
      peerConnection.ontrack = null
      peerConnection.onconnectionstatechange = null
      peerConnection.oniceconnectionstatechange = null
      peerConnection.close()
    }

    localStreamRef.current?.getTracks().forEach((track) => track.stop())
    localStreamRef.current = null
    setMuted(false)
  }, [])

  const showEndedCall = useCallback((callData, message) => {
    releaseMediaAndPeer()
    queuedCandidatesRef.current.delete(callData.callId)
    publishCall({
      ...callData,
      status: 'ended',
      statusMessage: message,
      remoteStream: null,
    })

    if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current)
    dismissTimeoutRef.current = setTimeout(() => {
      if (callRef.current?.callId === callData.callId) {
        publishCall(null)
      }
      dismissTimeoutRef.current = null
    }, ENDED_NOTICE_MS)
  }, [publishCall, releaseMediaAndPeer])

  const sendEndAndShow = useCallback(async (callData, reason, message) => {
    const current = callRef.current
    if (
      !current ||
      current.callId !== callData.callId ||
      current.status === 'ended' ||
      current.status === 'ending'
    ) return

    patchCall(callData.callId, { status: 'ending' })
    const offerSignalId = callData.offerSignal?.$id || callData.offerSignalId
    try {
      await sendSignal(callData, 'end', {
        reason,
        ...(offerSignalId ? { offerSignalId } : {}),
      })
    } catch (error) {
      console.warn('Kunde inte signalera att samtalet avslutats:', error)
    }
    await deleteSignal(offerSignalId ? { $id: offerSignalId } : null)
    showEndedCall(callData, message)
  }, [deleteSignal, patchCall, sendSignal, showEndedCall])

  const rejectCall = useCallback(async (reason = 'rejected') => {
    const callData = callRef.current
    if (!callData || callData.status !== 'incoming') return

    try {
      await sendSignal(callData, 'reject', { reason })
    } catch (error) {
      console.warn('Kunde inte skicka avvisningssignal:', error)
    }
    await deleteSignal(callData.offerSignal)

    if (reason === 'no-answer') {
      showEndedCall(callData, 'Missat samtal')
    } else if (reason === 'microphone-denied') {
      showEndedCall(callData, 'Mikrofonbehörighet nekades')
    } else {
      showEndedCall(callData, 'Samtalet avvisades')
    }
  }, [deleteSignal, sendSignal, showEndedCall])

  const endCall = useCallback(async () => {
    const callData = callRef.current
    if (!callData || callData.status === 'ended') return
    await sendEndAndShow(callData, 'ended', 'Samtalet avslutades')
  }, [sendEndAndShow])

  const addQueuedCandidates = useCallback(async (callData, peerConnection) => {
    const queued = queuedCandidatesRef.current.get(callData.callId) || []
    queuedCandidatesRef.current.delete(callData.callId)

    for (const item of queued) {
      if (
        item.signal.senderId !== callData.remoteUserId ||
        item.signal.conversationId !== callData.conversationId
      ) {
        await deleteSignal(item.signal)
        continue
      }

      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(item.payload.candidate))
      } catch (error) {
        console.warn('ICE-kandidat kunde inte läggas till:', error)
      }
      await deleteSignal(item.signal)
    }
  }, [deleteSignal])

  const createPeerConnection = useCallback((callData) => {
    const peerConnection = new RTCPeerConnection({ iceServers: getIceServers() })
    peerConnectionRef.current = peerConnection

    peerConnection.onicecandidate = (event) => {
      if (!event.candidate || callRef.current?.callId !== callData.callId) return
      void sendSignal(callData, 'ice-candidate', {
        candidate: event.candidate.toJSON(),
      }).catch((error) => {
        console.warn('ICE-kandidat kunde inte skickas:', error)
      })
    }

    peerConnection.ontrack = (event) => {
      const remoteStream = event.streams[0] || new MediaStream([event.track])
      patchCall(callData.callId, { remoteStream })
    }

    peerConnection.onconnectionstatechange = () => {
      if (peerConnection.connectionState === 'connected') {
        if (callTimeoutRef.current) {
          clearTimeout(callTimeoutRef.current)
          callTimeoutRef.current = null
        }
        patchCall(callData.callId, {
          status: 'active',
          connectedAt: callRef.current?.connectedAt || Date.now(),
        })
      } else if (peerConnection.connectionState === 'failed') {
        const current = callRef.current
        if (current?.callId === callData.callId) {
          void sendEndAndShow(current, 'failed', 'Anslutningen misslyckades')
        }
      }
    }

    peerConnection.oniceconnectionstatechange = () => {
      if (peerConnection.iceConnectionState === 'failed') {
        const current = callRef.current
        if (current?.callId === callData.callId) {
          void sendEndAndShow(current, 'failed', 'Anslutningen misslyckades')
        }
      }
    }

    return peerConnection
  }, [patchCall, sendEndAndShow, sendSignal])

  const startCall = useCallback(async ({
    conversationId,
    recipientId,
    recipientName,
    recipientProfile,
  }) => {
    if (!currentUserId || !conversationId || !recipientId || callRef.current) return

    const callData = {
      callId: makeCallId(),
      conversationId,
      remoteUserId: recipientId,
      remoteName: recipientName || 'Okänd användare',
      remoteProfile: recipientProfile || null,
      role: 'caller',
      status: 'outgoing',
      startedAt: Date.now(),
      remoteStream: null,
    }
    publishCall(callData)

    try {
      const conversation = await tablesDB.getRow({
        databaseId: DATABASE_ID,
        tableId: CONVERSATIONS_TABLE_ID,
        rowId: conversationId,
      })
      if (conversation.type !== 'direct') {
        throw new Error('Röstsamtal är bara tillgängliga i privata chattar.')
      }

      const localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      })
      if (
        callRef.current?.callId !== callData.callId ||
        callRef.current.status === 'ended' ||
        callRef.current.status === 'ending'
      ) {
        localStream.getTracks().forEach((track) => track.stop())
        return
      }

      localStreamRef.current = localStream
      const peerConnection = createPeerConnection(callData)
      localStream.getAudioTracks().forEach((track) => {
        peerConnection.addTrack(track, localStream)
      })

      const offer = await peerConnection.createOffer()
      await peerConnection.setLocalDescription(offer)
      if (
        callRef.current?.callId !== callData.callId ||
        callRef.current.status === 'ended' ||
        callRef.current.status === 'ending'
      ) return
      callTimeoutRef.current = setTimeout(() => {
        const current = callRef.current
        if (current?.callId === callData.callId && current.status === 'outgoing') {
          void sendEndAndShow(current, 'no-answer', 'Inget svar')
        }
      }, CALL_TIMEOUT_MS)
      const offerSignal = await sendSignal(callData, 'offer', {
        sdp: peerConnection.localDescription.toJSON(),
      })
      patchCall(callData.callId, { offerSignalId: offerSignal.$id })
    } catch (error) {
      console.error('Samtalet kunde inte starta:', error)
      if (callRef.current?.callId !== callData.callId) return
      const denied = error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError'
      showEndedCall(
        callData,
        denied ? 'Mikrofonbehörighet nekades' : error.message || 'Samtalet kunde inte starta'
      )
    }
  }, [currentUserId, createPeerConnection, patchCall, publishCall, sendEndAndShow, sendSignal, showEndedCall])

  const answerCall = useCallback(async () => {
    const callData = callRef.current
    if (!callData || callData.status !== 'incoming' || !callData.offerSignal) return

    if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current)
    patchCall(callData.callId, { status: 'connecting', statusMessage: 'Ansluter…' })

    try {
      const localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      })
      if (
        callRef.current?.callId !== callData.callId ||
        callRef.current.status === 'ended' ||
        callRef.current.status === 'ending'
      ) {
        localStream.getTracks().forEach((track) => track.stop())
        return
      }

      localStreamRef.current = localStream
      const peerConnection = createPeerConnection(callData)
      localStream.getAudioTracks().forEach((track) => {
        peerConnection.addTrack(track, localStream)
      })

      const offer = parsePayload(callData.offerSignal.payload)
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer.sdp))
      await addQueuedCandidates(callData, peerConnection)

      const answer = await peerConnection.createAnswer()
      await peerConnection.setLocalDescription(answer)
      await sendSignal(callData, 'answer', {
        sdp: peerConnection.localDescription.toJSON(),
      })
      await deleteSignal(callData.offerSignal)
      patchCall(callData.callId, { offerSignal: null, statusMessage: 'Ansluter…' })

      callTimeoutRef.current = setTimeout(() => {
        const current = callRef.current
        if (current?.callId === callData.callId && current.status === 'connecting') {
          void sendEndAndShow(current, 'failed', 'Anslutningen misslyckades')
        }
      }, CALL_TIMEOUT_MS)
    } catch (error) {
      console.error('Samtalet kunde inte besvaras:', error)
      const denied = error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError'
      try {
        await sendSignal(callData, 'reject', {
          reason: denied ? 'microphone-denied' : 'failed',
        })
      } catch (signalError) {
        console.warn('Samtalsavslag kunde inte skickas:', signalError)
      }
      await deleteSignal(callData.offerSignal)
      showEndedCall(
        callData,
        denied ? 'Mikrofonbehörighet nekades' : 'Anslutningen misslyckades'
      )
    }
  }, [addQueuedCandidates, createPeerConnection, deleteSignal, patchCall, sendEndAndShow, sendSignal, showEndedCall])

  const toggleMute = useCallback(() => {
    const nextMuted = !callRef.current?.muted
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted
    })
    setMuted(nextMuted)
    if (callRef.current) {
      publishCall({ ...callRef.current, muted: nextMuted })
    }
  }, [publishCall])

  const dismissCall = useCallback(() => {
    if (callRef.current?.status !== 'ended') return
    if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current)
    dismissTimeoutRef.current = null
    publishCall(null)
  }, [publishCall])

  const processSignal = useCallback(async (signal) => {
    if (
      !signal?.$id ||
      !currentUserId ||
      signal.recipientId !== currentUserId ||
      signal.senderId === currentUserId ||
      seenSignalIdsRef.current.has(signal.$id)
    ) return

    const payload = parsePayload(signal.payload)
    if (!payload.callId) {
      await deleteSignal(signal)
      return
    }

    seenSignalIdsRef.current.add(signal.$id)
    if (seenSignalIdsRef.current.size > 500) {
      seenSignalIdsRef.current.clear()
      seenSignalIdsRef.current.add(signal.$id)
    }

    if (signal.type === 'offer') {
      const [conversation, members] = await Promise.all([
        tablesDB.getRow({
          databaseId: DATABASE_ID,
          tableId: CONVERSATIONS_TABLE_ID,
          rowId: signal.conversationId,
        }).catch(() => null),
        tablesDB.listRows({
          databaseId: DATABASE_ID,
          tableId: CONVERSATION_MEMBERS_TABLE_ID,
          queries: [
            Query.equal('conversationId', [signal.conversationId]),
            Query.limit(3),
          ],
        }).catch(() => ({ rows: [] })),
      ])
      const memberIds = members.rows.map((member) => member.userId)
      const isValidPrivateCall = conversation?.type === 'direct' &&
        memberIds.length === 2 &&
        memberIds.includes(currentUserId) &&
        memberIds.includes(signal.senderId)

      if (!isValidPrivateCall) {
        await deleteSignal(signal)
        return
      }

      if (callRef.current) {
        const busyCall = {
          callId: payload.callId,
          conversationId: signal.conversationId,
          remoteUserId: signal.senderId,
        }
        await sendSignal(busyCall, 'reject', { reason: 'busy' }).catch(() => {})
        await deleteSignal(signal)
        return
      }

      const callerProfile = await tablesDB.listRows({
        databaseId: DATABASE_ID,
        tableId: USERS_TABLE_ID,
        queries: [
          Query.equal('userId', [signal.senderId]),
          Query.limit(1),
        ],
      }).then((result) => result.rows[0] || null).catch(() => null)

      const incomingCall = {
        callId: payload.callId,
        conversationId: signal.conversationId,
        remoteUserId: signal.senderId,
        remoteName: callerProfile?.username || 'Okänd användare',
        remoteProfile: callerProfile,
        role: 'callee',
        status: 'incoming',
        startedAt: Date.now(),
        offerSignal: signal,
        remoteStream: null,
      }
      publishCall(incomingCall)
      callTimeoutRef.current = setTimeout(() => {
        if (callRef.current?.callId === payload.callId && callRef.current.status === 'incoming') {
          void rejectCall('no-answer')
        }
      }, CALL_TIMEOUT_MS)
      return
    }

    if (signal.type === 'ice-candidate' && !callRef.current) {
      const queued = queuedCandidatesRef.current.get(payload.callId) || []
      if (queued.length < 128) {
        queuedCandidatesRef.current.set(payload.callId, [...queued, { signal, payload }])
      } else {
        await deleteSignal(signal)
      }
      return
    }

    const callData = callRef.current
    if (
      !callData ||
      callData.callId !== payload.callId ||
      callData.conversationId !== signal.conversationId ||
      callData.remoteUserId !== signal.senderId
    ) {
      if (
        (signal.type === 'end' || signal.type === 'reject') &&
        payload.offerSignalId
      ) {
        await deleteSignal({ $id: payload.offerSignalId })
      }
      await deleteSignal(signal)
      return
    }

    if (signal.type === 'answer' && callData.role === 'caller') {
      const peerConnection = peerConnectionRef.current
      if (!peerConnection || peerConnection.remoteDescription) {
        await deleteSignal(signal)
        return
      }

      if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current)
      patchCall(callData.callId, { status: 'connecting', statusMessage: 'Ansluter…' })
      callTimeoutRef.current = setTimeout(() => {
        const current = callRef.current
        if (current?.callId === callData.callId && current.status === 'connecting') {
          void sendEndAndShow(current, 'failed', 'Anslutningen misslyckades')
        }
      }, CALL_TIMEOUT_MS)

      try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp))
        await deleteSignal(signal)
        await addQueuedCandidates(callData, peerConnection)
      } catch (error) {
        console.error('Samtalssvaret kunde inte behandlas:', error)
        await sendEndAndShow(callData, 'failed', 'Anslutningen misslyckades')
      }
      return
    }

    if (signal.type === 'ice-candidate') {
      const peerConnection = peerConnectionRef.current
      if (!peerConnection?.remoteDescription) {
        const queued = queuedCandidatesRef.current.get(payload.callId) || []
        if (queued.length < 128) {
          queuedCandidatesRef.current.set(payload.callId, [...queued, { signal, payload }])
        } else {
          await deleteSignal(signal)
        }
        return
      }

      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(payload.candidate))
      } catch (error) {
        console.warn('ICE-kandidat kunde inte läggas till:', error)
      }
      await deleteSignal(signal)
      return
    }

    if (signal.type === 'reject' || signal.type === 'end') {
      await deleteSignal(callData.offerSignal)
      await deleteSignal(signal)
      const reason = payload.reason || signal.type
      const message = reason === 'busy'
        ? 'Användaren är upptagen'
        : reason === 'no-answer'
          ? 'Inget svar'
          : reason === 'microphone-denied'
            ? 'Mikrofonbehörighet nekades'
            : reason === 'failed'
              ? 'Anslutningen misslyckades'
              : reason === 'left'
                ? 'Den andra användaren lämnade samtalet'
          : signal.type === 'reject'
            ? 'Samtalet avvisades'
            : 'Samtalet avslutades'
      showEndedCall(callData, message)
      return
    }

    await deleteSignal(signal)
  }, [addQueuedCandidates, currentUserId, deleteSignal, publishCall, rejectCall, sendEndAndShow, sendSignal, showEndedCall])

  signalHandlerRef.current = processSignal

  useEffect(() => {
    if (!currentUserId) return undefined

    let active = true
    const unsubscribe = client.subscribe(
      `databases.${DATABASE_ID}.tables.${CALL_SIGNALS_TABLE_ID}.rows`,
      ({ events = [], payload }) => {
        if (events.length && !events.some((event) => event.endsWith('.create'))) return
        if (payload?.recipientId === currentUserId) {
          void signalHandlerRef.current?.(payload)
        }
      }
    )

    async function loadPendingOffers() {
      try {
        const staleBefore = new Date(Date.now() - SIGNAL_RETENTION_MS).toISOString()
        const response = await tablesDB.listRows({
          databaseId: DATABASE_ID,
          tableId: CALL_SIGNALS_TABLE_ID,
          queries: [
            Query.equal('recipientId', [currentUserId]),
            Query.limit(100),
          ],
        })

        if (!active) return
        const staleSignals = response.rows.filter(
          (signal) => Date.parse(signal.$createdAt) < Date.parse(staleBefore)
        )
        const offers = response.rows.filter(
          (signal) => signal.type === 'offer' && !staleSignals.includes(signal)
        )
        await Promise.all(staleSignals.map(deleteSignal))
        for (const offer of offers.rows) {
          const createdAt = new Date(offer.$createdAt).getTime()
          if (active && createdAt >= Date.now() - SIGNAL_RETENTION_MS) {
            await signalHandlerRef.current?.(offer)
          }
        }
      } catch (error) {
        console.error('Samtalssignaler kunde inte hämtas:', error)
      }
    }

    void loadPendingOffers()

    function handlePageExit() {
      const current = callRef.current
      if (current && current.status !== 'ended') {
        const offerSignalId = current.offerSignal?.$id || current.offerSignalId
        void sendSignal(current, 'end', {
          reason: 'left',
          ...(offerSignalId ? { offerSignalId } : {}),
        }).catch(() => {})
        void deleteSignal(offerSignalId ? { $id: offerSignalId } : null)
      }
      releaseMediaAndPeer()
    }

    window.addEventListener('pagehide', handlePageExit)

    return () => {
      active = false
      unsubscribe()
      window.removeEventListener('pagehide', handlePageExit)
      if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current)
      const current = callRef.current
      if (current && current.status !== 'ended') {
        const offerSignalId = current.offerSignal?.$id || current.offerSignalId
        void sendSignal(current, 'end', {
          reason: 'left',
          ...(offerSignalId ? { offerSignalId } : {}),
        }).catch(() => {})
        void deleteSignal(offerSignalId ? { $id: offerSignalId } : null)
      }
      releaseMediaAndPeer()
      callRef.current = null
      queuedCandidatesRef.current.clear()
    }
  }, [currentUserId, deleteSignal, releaseMediaAndPeer, sendSignal])

  return {
    call,
    muted,
    startCall,
    answerCall,
    rejectCall,
    endCall,
    toggleMute,
    dismissCall,
  }
}