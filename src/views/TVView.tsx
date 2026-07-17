import { useEffect, useState } from 'react'
import type { ClientGameState, FxEvent, TeamId } from '../../shared/types'
import { Board } from '../components/Board'
import { StrikeOverlay } from '../components/StrikeOverlay'
import { teamName } from '../components/ScoreBar'
import { socket } from '../socket'
import { audioUnlocked, playBuzzIn, playReveal, unlockAudio } from '../sound'

export function TVView({ state }: { state: ClientGameState }) {
  const [soundOn, setSoundOn] = useState(audioUnlocked())

  useEffect(() => {
    const onFx = (fx: FxEvent) => {
      if (fx.type === 'reveal') playReveal()
      if (fx.type === 'buzz') playBuzzIn()
    }
    socket.on('fx', onFx)
    return () => {
      socket.off('fx', onFx)
    }
  }, [])

  return (
    <div className="flex min-h-full flex-col bg-gradient-to-b from-blue-950 via-slate-950 to-black p-[2vw]">
      <StrikeOverlay />
      {!soundOn && (
        <button
          onClick={() => {
            unlockAudio()
            setSoundOn(true)
          }}
          className="fixed right-3 top-3 z-40 rounded-full bg-slate-800/80 px-4 py-2 text-sm font-bold text-slate-200"
        >
          🔊 Tap to enable sound
        </button>
      )}

      <header className="flex items-center justify-between gap-[2vw]">
        <TeamPanel state={state} team={1} />
        <div className="text-center">
          <div className="text-[1.6vw] font-black uppercase tracking-[0.3em] text-slate-400">
            Round {state.round}
            {state.multiplier > 1 && <span className="ml-2 text-yellow-400">×{state.multiplier}</span>}
          </div>
          <div className="rounded-2xl border-4 border-yellow-400 bg-blue-900 px-[3vw] py-[0.8vw] text-[3.4vw] font-black tabular-nums text-yellow-300 shadow-[0_0_40px_rgba(250,204,21,0.35)]">
            {state.bank}
          </div>
          <div className="text-[1.1vw] font-bold uppercase tracking-widest text-slate-400">Bank</div>
        </div>
        <TeamPanel state={state} team={2} />
      </header>

      <main className="mt-[1.5vw] flex flex-1 flex-col">
        {state.phase === 'lobby' && <LobbyScreen state={state} />}
        {state.phase === 'fastmoney' && state.fastMoney && <FastMoneyBoard state={state} />}
        {state.phase !== 'lobby' && state.phase !== 'fastmoney' && state.question && (
          <>
            <div className="rounded-xl bg-gradient-to-r from-blue-800 via-blue-700 to-blue-800 px-[2vw] py-[1vw] text-center text-[2.4vw] font-black uppercase leading-tight text-white shadow-lg">
              {state.question.prompt ?? (
                <span className="animate-pulse tracking-[0.3em] text-sky-300/80">
                  🤫 Listen up — question coming…
                </span>
              )}
            </div>
            <div className="mt-[1.5vw] flex-1">
              <Board slots={state.question.slots} size="tv" />
            </div>
            <footer className="mt-[1.5vw] flex min-h-[5vw] items-center justify-between">
              <PhaseBanner state={state} />
              <Strikes count={state.strikes} />
            </footer>
          </>
        )}
      </main>
    </div>
  )
}

function TeamPanel({ state, team }: { state: ClientGameState; team: TeamId }) {
  const t = state.teams[team - 1]
  const inControl = state.controllingTeam === team
  return (
    <div
      className={`flex-1 rounded-2xl border-4 px-[2vw] py-[1vw] text-center ${
        inControl
          ? 'border-yellow-400 bg-blue-900 shadow-[0_0_30px_rgba(250,204,21,0.3)]'
          : 'border-blue-700 bg-blue-950'
      }`}
    >
      <div className="truncate text-[1.8vw] font-black uppercase tracking-wide text-sky-300">{t.name}</div>
      <div className="text-[4vw] font-black leading-none tabular-nums text-white">{t.score}</div>
      {inControl && (
        <div className="mt-1 text-[1.1vw] font-bold uppercase tracking-widest text-yellow-400">Playing</div>
      )}
    </div>
  )
}

function Strikes({ count }: { count: number }) {
  return (
    <div className="flex gap-[1vw]">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`flex h-[4.5vw] w-[4.5vw] items-center justify-center rounded-xl border-4 text-[3vw] font-black ${
            i < count ? 'border-red-500 bg-red-500/20 text-red-500' : 'border-slate-700 text-slate-800'
          }`}
        >
          X
        </span>
      ))}
    </div>
  )
}

function PhaseBanner({ state }: { state: ClientGameState }) {
  const f = state.faceoff
  if (state.phase === 'faceoff' && f) {
    const winner = f.buzzes.length > 0 ? f.buzzes[0].name : null
    return (
      <div className="text-[2vw] font-black uppercase text-yellow-300">
        {winner ? (
          <>
            🔔 {winner} buzzed first!
          </>
        ) : f.armed ? (
          <span className="animate-pulse">
            Face-off: {f.aName ?? '?'} vs {f.bName ?? '?'} — buzzers live!
          </span>
        ) : f.aName || f.bName ? (
          <>
            Face-off: {f.aName ?? '?'} vs {f.bName ?? '?'}
          </>
        ) : (
          'Face-off coming up…'
        )}
      </div>
    )
  }
  if (state.phase === 'steal') {
    const stealing = state.controllingTeam === 1 ? 2 : 1
    return (
      <div className="animate-pulse text-[2vw] font-black uppercase text-red-400">
        Steal chance: {teamName(state, stealing as TeamId)}!
      </div>
    )
  }
  if (state.phase === 'round_end' && state.lastAward) {
    return (
      <div className="text-[2vw] font-black uppercase text-yellow-300">
        {state.lastAward.amount} points to {teamName(state, state.lastAward.team)}!
      </div>
    )
  }
  if (state.phase === 'board' && state.controllingTeam) {
    return (
      <div className="text-[1.6vw] font-black uppercase text-sky-300">
        {teamName(state, state.controllingTeam)} has the board
      </div>
    )
  }
  return <div />
}

function LobbyScreen({ state }: { state: ClientGameState }) {
  const players = state.members.filter((m) => m.role === 'player')
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <div className="text-[2vw] font-bold uppercase tracking-[0.4em] text-slate-400">Join at this room code</div>
      <div className="my-[1vw] rounded-3xl border-8 border-yellow-400 bg-blue-900 px-[6vw] py-[2vw] text-[10vw] font-black uppercase tracking-[0.2em] text-yellow-300 shadow-[0_0_60px_rgba(250,204,21,0.4)]">
        {state.code}
      </div>
      <div className="mt-[1vw] grid w-full max-w-[70vw] grid-cols-2 gap-[2vw]">
        {([1, 2] as TeamId[]).map((team) => (
          <div key={team} className="rounded-2xl border-2 border-blue-700 bg-blue-950/60 p-[1.5vw]">
            <div className="text-[1.8vw] font-black uppercase text-sky-300">{state.teams[team - 1].name}</div>
            <div className="mt-[0.5vw] space-y-[0.3vw] text-[1.5vw] font-semibold text-white">
              {players
                .filter((p) => p.team === team)
                .map((p) => (
                  <div key={p.clientId} className={p.connected ? '' : 'text-slate-500 line-through'}>
                    {p.name}
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
      {players.some((p) => p.team === null) && (
        <div className="mt-[1.5vw] text-[1.4vw] text-slate-400">
          Waiting for teams: {players.filter((p) => p.team === null).map((p) => p.name).join(', ')}
        </div>
      )}
    </div>
  )
}

function FastMoneyBoard({ state }: { state: ClientGameState }) {
  const fm = state.fastMoney!
  const current = fm.currentIndex >= 0 ? fm.questions[fm.currentIndex] : null
  return (
    <div className="flex flex-1 flex-col">
      <div className="text-center text-[3vw] font-black uppercase italic text-yellow-400">Fast Money</div>
      <div className="mx-auto mt-[1vw] w-full max-w-[76vw] rounded-xl bg-gradient-to-r from-blue-800 via-blue-700 to-blue-800 px-[2vw] py-[1vw] text-center text-[2vw] font-black uppercase leading-tight text-white shadow-lg">
        {current ? (
          <>
            <span className="mr-[1vw] text-yellow-300">Q{fm.currentIndex + 1}/5</span>
            {current.prompt}
          </>
        ) : (
          <span className="animate-pulse tracking-[0.3em] text-sky-300/80">Get ready…</span>
        )}
      </div>
      <div className="mx-auto mt-[1.5vw] w-full max-w-[76vw] flex-1 space-y-[1vw]">
        {fm.questions.map((_q, qi) => (
          <div key={qi} className="grid grid-cols-[4vw_1fr_1fr] items-center gap-[1vw]">
            <div
              className={`text-center text-[2vw] font-black ${
                fm.currentIndex === qi ? 'text-yellow-300' : 'text-slate-500'
              }`}
            >
              {qi + 1}
            </div>
            {[0, 1].map((pass) => {
              const e = fm.entries[pass][qi]
              return (
                <div
                  key={pass}
                  className={`flex items-center justify-between rounded-lg border-2 px-[1.2vw] py-[0.7vw] ${
                    e.revealed ? 'animate-flip border-sky-300/60 bg-gradient-to-b from-sky-600 to-blue-800' : 'border-blue-700 bg-blue-950'
                  }`}
                >
                  <span className="truncate text-[1.6vw] font-bold uppercase text-white">
                    {e.revealed ? e.text : '···'}
                  </span>
                  <span className="ml-2 text-[1.6vw] font-black text-yellow-300 tabular-nums">
                    {e.revealed ? e.points : ''}
                  </span>
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <div className="mt-[1vw] text-center">
        <span className="text-[1.6vw] font-bold uppercase tracking-widest text-slate-400">Total </span>
        <span className={`text-[3.4vw] font-black tabular-nums ${fm.revealedTotal >= 200 ? 'text-yellow-300' : 'text-white'}`}>
          {fm.revealedTotal}
        </span>
        <span className="text-[1.6vw] font-bold text-slate-500"> / 200</span>
      </div>
    </div>
  )
}
