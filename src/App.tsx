import { useCallback, useEffect, useState } from 'react'
import type { ClientGameState, QuestionBankPayload, Role } from '../shared/types'
import { getClientId, socket } from './socket'
import { HostView } from './views/HostView'
import { PlayerView } from './views/PlayerView'
import { TVView } from './views/TVView'

interface Session {
  code: string
  name: string
  role: Role
}

function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem('ff-session')
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

export default function App() {
  const [session, setSession] = useState<Session | null>(loadSession)
  const [state, setState] = useState<ClientGameState | null>(null)
  const [bank, setBank] = useState<QuestionBankPayload | null>(null)
  const [error, setError] = useState('')
  const [connected, setConnected] = useState(socket.connected)

  const leave = useCallback(() => {
    sessionStorage.removeItem('ff-session')
    setSession(null)
    setState(null)
    setBank(null)
    socket.disconnect()
  }, [])

  useEffect(() => {
    const onState = (s: ClientGameState) => setState(s)
    const onBank = (b: QuestionBankPayload) => setBank(b)
    const onConnect = () => setConnected(true)
    const onDisconnect = () => setConnected(false)
    socket.on('state', onState)
    socket.on('question_bank', onBank)
    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    return () => {
      socket.off('state', onState)
      socket.off('question_bank', onBank)
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
    }
  }, [])

  // (Re)join whenever we have a session and a fresh connection — covers page
  // refreshes and socket reconnects after server restarts or dropped wifi.
  useEffect(() => {
    if (!session) return
    const join = () => {
      socket.emit(
        'join_room',
        { clientId: getClientId(), code: session.code, name: session.name, role: session.role },
        (res: { ok: boolean; error?: string }) => {
          if (!res.ok) {
            setError(res.error ?? 'Could not join the room.')
            leave()
          }
        },
      )
    }
    socket.on('connect', join)
    if (socket.connected) join()
    else socket.connect()
    return () => {
      socket.off('connect', join)
    }
  }, [session, leave])

  const startSession = (s: Session) => {
    sessionStorage.setItem('ff-session', JSON.stringify(s))
    setError('')
    setSession(s)
  }

  if (!session) {
    return <JoinScreen error={error} onStart={startSession} />
  }

  if (!state) {
    return (
      <div className="flex min-h-full items-center justify-center text-slate-400">
        Connecting to room {session.code}…
      </div>
    )
  }

  return (
    <>
      {!connected && (
        <div className="fixed inset-x-0 top-0 z-[60] bg-red-600 py-1 text-center text-sm font-bold text-white">
          Reconnecting…
        </div>
      )}
      {state.you.role === 'host' && <HostView state={state} bank={bank} onLeave={leave} />}
      {state.you.role === 'tv' && <TVView state={state} />}
      {state.you.role === 'player' && <PlayerView state={state} onLeave={leave} />}
    </>
  )
}

function JoinScreen({ error, onStart }: { error: string; onStart: (s: Session) => void }) {
  const [name, setName] = useState(localStorage.getItem('ff-name') ?? '')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState('')

  const createRoom = () => {
    if (!name.trim()) return setLocalError('Enter your name first.')
    setBusy(true)
    localStorage.setItem('ff-name', name.trim())
    socket.connect()
    socket.emit(
      'create_room',
      { clientId: getClientId(), name: name.trim() },
      (res: { ok: boolean; code?: string; error?: string }) => {
        setBusy(false)
        if (res.ok && res.code) onStart({ code: res.code, name: name.trim(), role: 'host' })
        else setLocalError(res.error ?? 'Could not create a room.')
      },
    )
  }

  const join = (role: Role) => {
    if (role !== 'tv' && !name.trim()) return setLocalError('Enter your name first.')
    if (code.trim().length < 4) return setLocalError('Enter the 4-letter room code.')
    localStorage.setItem('ff-name', name.trim())
    onStart({ code: code.trim().toUpperCase(), name: role === 'tv' ? name.trim() || 'TV' : name.trim(), role })
  }

  const message = localError || error

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-b from-blue-950 via-slate-950 to-black p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-center text-5xl font-black uppercase italic tracking-tight">
          <span className="text-yellow-400">Family</span> <span className="text-sky-400">Feud</span>
        </h1>
        <p className="mt-1 text-center text-sm text-slate-400">Couch-party edition</p>

        <div className="mt-8 space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            maxLength={20}
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-lg outline-none focus:border-sky-400"
          />
          <button
            onClick={createRoom}
            disabled={busy}
            className="w-full rounded-xl bg-yellow-400 py-3 text-lg font-black uppercase tracking-wide text-blue-950 active:scale-95 disabled:opacity-50"
          >
            Create room (host)
          </button>

          <div className="flex items-center gap-3 py-1 text-xs uppercase tracking-widest text-slate-500">
            <div className="h-px flex-1 bg-slate-800" /> or join <div className="h-px flex-1 bg-slate-800" />
          </div>

          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Room code"
            maxLength={4}
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-center text-2xl font-black uppercase tracking-[0.5em] outline-none focus:border-sky-400"
          />
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => join('player')}
              className="rounded-xl bg-sky-500 py-3 font-black uppercase text-white active:scale-95"
            >
              Player
            </button>
            <button
              onClick={() => join('tv')}
              className="rounded-xl bg-slate-700 py-3 font-black uppercase text-white active:scale-95"
            >
              TV screen
            </button>
          </div>
          <button
            onClick={() => join('host')}
            className="w-full rounded-xl border border-slate-700 py-2 text-sm font-bold uppercase text-slate-400 active:scale-95"
          >
            Rejoin as host
          </button>
        </div>

        {message && <p className="mt-4 text-center font-semibold text-red-400">{message}</p>}
      </div>
    </div>
  )
}
