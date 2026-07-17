import { useEffect, useState } from 'react'
import type {
  ClientGameState,
  MemberInfo,
  QuestionBankPayload,
  QuestionData,
  TeamId,
} from '../../shared/types'
import { teamName } from '../components/ScoreBar'
import { socket } from '../socket'

function send(event: string, payload?: unknown) {
  socket.emit(event, payload)
}

const PHASE_LABELS: Record<ClientGameState['phase'], string> = {
  lobby: 'Round setup',
  faceoff: 'Face-off',
  board: 'Board play',
  steal: 'Steal',
  round_end: 'Round over',
  fastmoney: 'Fast Money',
}

export function HostView({
  state,
  bank,
  onLeave,
}: {
  state: ClientGameState
  bank: QuestionBankPayload | null
  onLeave: () => void
}) {
  const players = state.members.filter((m) => m.role === 'player')

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col gap-4 p-4 pb-16">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="text-2xl font-black uppercase tracking-widest text-yellow-400">{state.code}</span>
          <span className="ml-3 rounded-full bg-sky-500/20 px-3 py-1 text-sm font-bold uppercase text-sky-300">
            {PHASE_LABELS[state.phase]}
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-400">
          <span>Round {state.round}</span>
          <label className="flex items-center gap-1">
            ×
            <select
              value={state.multiplier}
              onChange={(e) => send('host_set_multiplier', { multiplier: Number(e.target.value) })}
              className="rounded bg-slate-800 px-2 py-1 font-bold text-white"
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </label>
          <button onClick={onLeave} className="underline">
            leave
          </button>
        </div>
      </header>

      <Scoreboard state={state} />

      {state.phase === 'lobby' && (
        <>
          <TeamManager state={state} players={players} />
          <QuestionPicker state={state} bank={bank} />
        </>
      )}

      {state.phase === 'faceoff' && (
        <>
          <FaceoffPanel state={state} players={players} />
          <AnswerPanel state={state} />
        </>
      )}

      {(state.phase === 'board' || state.phase === 'steal') && (
        <>
          <PlayPanel state={state} />
          <AnswerPanel state={state} />
        </>
      )}

      {state.phase === 'round_end' && (
        <>
          <div className="rounded-xl border border-yellow-400/40 bg-yellow-400/10 p-4 text-center">
            {state.lastAward && (
              <div className="text-lg font-black text-yellow-300">
                Banked {state.lastAward.amount} to {teamName(state, state.lastAward.team)}
              </div>
            )}
            <p className="mt-1 text-sm text-slate-300">
              Flip any remaining answers below for the reveal-through, then start the next round.
            </p>
            <button
              onClick={() => send('host_next_round')}
              className="mt-3 rounded-xl bg-yellow-400 px-6 py-3 font-black uppercase text-blue-950 active:scale-95"
            >
              Next round →
            </button>
          </div>
          <AnswerPanel state={state} />
        </>
      )}

      {state.phase === 'fastmoney' && state.fastMoney && <FastMoneyPanel state={state} />}
    </div>
  )
}

// ---- scores ----

function Scoreboard({ state }: { state: ClientGameState }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {state.teams.map((team) => (
        <div
          key={team.id}
          className={`rounded-xl border p-3 ${
            state.controllingTeam === team.id ? 'border-yellow-400 bg-yellow-400/10' : 'border-slate-700 bg-slate-900'
          }`}
        >
          <div className="flex items-center justify-between">
            <input
              defaultValue={team.name}
              key={team.name}
              maxLength={24}
              onBlur={(e) => {
                if (e.target.value.trim() && e.target.value !== team.name)
                  send('host_set_team_name', { team: team.id, name: e.target.value })
              }}
              className="w-full bg-transparent text-sm font-bold uppercase tracking-wide text-sky-300 outline-none"
            />
            <span className="ml-2 text-2xl font-black tabular-nums">{team.score}</span>
          </div>
          <div className="mt-2 flex gap-1">
            {[-10, -5, 5, 10, 25].map((d) => (
              <button
                key={d}
                onClick={() => send('host_adjust_score', { team: team.id, delta: d })}
                className="flex-1 rounded bg-slate-800 py-1 text-xs font-bold text-slate-300 active:bg-slate-700"
              >
                {d > 0 ? `+${d}` : d}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ---- lobby ----

function TeamManager({ state, players }: { state: ClientGameState; players: MemberInfo[] }) {
  return (
    <Section title={`Players (${players.length})`}>
      {players.length === 0 && (
        <p className="text-sm text-slate-400">
          No players yet — have phones join room <b className="text-yellow-400">{state.code}</b>.
        </p>
      )}
      <div className="space-y-2">
        {players.map((p) => (
          <div key={p.clientId} className="flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2">
            <span className={`h-2 w-2 shrink-0 rounded-full ${p.connected ? 'bg-green-400' : 'bg-red-500'}`} />
            <span className="flex-1 truncate font-semibold">{p.name}</span>
            {([1, 2] as TeamId[]).map((t) => (
              <button
                key={t}
                onClick={() => send('host_assign_team', { playerId: p.clientId, team: p.team === t ? null : t })}
                className={`rounded px-3 py-1 text-xs font-black uppercase ${
                  p.team === t ? 'bg-sky-500 text-white' : 'bg-slate-800 text-slate-400'
                }`}
              >
                {state.teams[t - 1].name}
              </button>
            ))}
            <button
              onClick={() => send('host_remove_player', { playerId: p.clientId })}
              className="px-1 text-slate-600 hover:text-red-400"
              title="Remove player"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </Section>
  )
}

const SUGGESTION_COUNT = 5

/** Random draw of question ids, excluding the given set. */
function shuffleDraw(all: QuestionData[], exclude: Set<string>, count: number): string[] {
  const pool = all.filter((q) => !exclude.has(q.id)).map((q) => q.id)
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, count)
}

function QuestionPicker({ state, bank }: { state: ClientGameState; bank: QuestionBankPayload | null }) {
  const questions = bank?.questions ?? []
  const usedKey = state.usedQuestionIds.join(',')
  const storageKey = `ff-suggest-${state.code}`

  const [suggested, setSuggested] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? '[]')
      if (Array.isArray(saved)) return saved.filter((x): x is string => typeof x === 'string')
    } catch {
      /* fresh draw below */
    }
    return []
  })
  const [swapSlot, setSwapSlot] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  // Top up the suggestion list when the bank arrives, and swap out any
  // suggestion that has since been played (or removed from the bank).
  useEffect(() => {
    if (questions.length === 0) return
    const used = new Set(state.usedQuestionIds)
    const known = new Set(questions.map((q) => q.id))
    setSuggested((prev) => {
      const valid = prev.filter((id) => known.has(id) && !used.has(id))
      const target = Math.min(SUGGESTION_COUNT, questions.length - used.size)
      if (valid.length === prev.length && valid.length >= target) return prev
      const refill = shuffleDraw(questions, new Set([...used, ...valid]), Math.max(0, target - valid.length))
      return [...valid, ...refill]
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions, usedKey])

  useEffect(() => {
    sessionStorage.setItem(storageKey, JSON.stringify(suggested))
  }, [suggested, storageKey])

  if (!bank) return <Section title="Questions">Loading question bank…</Section>

  const refreshAll = () => {
    const used = new Set(state.usedQuestionIds)
    // Prefer questions not already on the list so a refresh visibly changes things.
    let ids = shuffleDraw(questions, new Set([...used, ...suggested]), SUGGESTION_COUNT)
    if (ids.length < SUGGESTION_COUNT) {
      ids = [...ids, ...shuffleDraw(questions, new Set([...used, ...ids]), SUGGESTION_COUNT - ids.length)]
    }
    setSuggested(ids)
  }

  const suggestedQs = suggested
    .map((id) => questions.find((q) => q.id === id))
    .filter((q): q is QuestionData => !!q)

  return (
    <Section
      title="Up next"
      right={
        <div className="flex gap-2">
          <button
            onClick={refreshAll}
            className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-black uppercase text-white active:scale-95"
          >
            🎲 New 5
          </button>
          <button
            onClick={() => send('host_start_fastmoney')}
            className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-black uppercase text-white active:scale-95"
          >
            ⚡ Fast Money
          </button>
        </div>
      }
    >
      <div className="space-y-2">
        {suggestedQs.map((q, slot) => (
          <div key={q.id} className="rounded-lg bg-slate-900 p-3">
            <button onClick={() => setExpanded(expanded === q.id ? null : q.id)} className="w-full text-left">
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sky-400">
                  {q.category}
                </span>
                <span className="text-xs text-slate-500">{q.answers.length} answers</span>
              </div>
              <div className="mt-1.5 text-sm font-semibold leading-snug">{q.prompt}</div>
            </button>
            {expanded === q.id && (
              <div className="mt-2 border-t border-slate-800 pt-2 text-xs text-slate-400">
                {q.answers.map((a, i) => (
                  <div key={i} className="flex justify-between">
                    <span>
                      {i + 1}. {a.text}
                    </span>
                    <span className="font-bold text-slate-300">{a.points}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => send('host_select_question', { questionId: q.id })}
                className="flex-1 rounded bg-yellow-400 py-1.5 text-xs font-black uppercase text-blue-950 active:scale-95"
              >
                Play
              </button>
              <button
                onClick={() => setSwapSlot(slot)}
                className="rounded bg-slate-700 px-4 py-1.5 text-xs font-black uppercase text-slate-200 active:scale-95"
              >
                ⇄ Swap
              </button>
            </div>
          </div>
        ))}
        {suggestedQs.length === 0 && (
          <p className="text-sm text-slate-400">No unplayed questions left — that was quite a game night!</p>
        )}
      </div>

      {swapSlot !== null && (
        <QuestionBrowser
          questions={questions}
          usedIds={new Set(state.usedQuestionIds)}
          currentIds={new Set(suggested)}
          onPick={(id) => {
            setSuggested((s) => s.map((v, i) => (i === swapSlot ? id : v)))
            setSwapSlot(null)
          }}
          onClose={() => setSwapSlot(null)}
        />
      )}
    </Section>
  )
}

/** Full-screen browser of the whole bank, grouped by category, for swapping a suggestion. */
function QuestionBrowser({
  questions,
  usedIds,
  currentIds,
  onPick,
  onClose,
}: {
  questions: QuestionData[]
  usedIds: Set<string>
  currentIds: Set<string>
  onPick: (id: string) => void
  onClose: () => void
}) {
  const [filter, setFilter] = useState('')
  const f = filter.trim().toLowerCase()
  const visible = f
    ? questions.filter(
        (q) => q.prompt.toLowerCase().includes(f) || q.category.toLowerCase().includes(f),
      )
    : questions
  const categories = [...new Set(visible.map((q) => q.category))].sort()

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
      <div className="flex items-center gap-2 border-b border-slate-800 p-3">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search questions or categories…"
          className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-sky-400"
        />
        <button onClick={onClose} className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-slate-200">
          Close
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 pb-12">
        {categories.map((cat) => {
          const inCat = visible.filter((q) => q.category === cat)
          return (
            <div key={cat} className="mb-4">
              <div className="sticky top-0 z-10 bg-slate-950/95 py-1 text-xs font-black uppercase tracking-widest text-yellow-400">
                {cat} <span className="font-bold text-slate-600">({inCat.length})</span>
              </div>
              <div className="mt-1 space-y-1">
                {inCat.map((q) => {
                  const used = usedIds.has(q.id)
                  const current = currentIds.has(q.id)
                  return (
                    <button
                      key={q.id}
                      disabled={used || current}
                      onClick={() => onPick(q.id)}
                      className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                        used || current
                          ? 'bg-slate-900/50 text-slate-600'
                          : 'bg-slate-900 text-white active:bg-sky-900'
                      }`}
                    >
                      {q.prompt}
                      <span className="ml-2 text-xs text-slate-500">
                        {q.answers.length} answers{used ? ' · played' : current ? ' · on your list' : ''}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
        {visible.length === 0 && (
          <p className="mt-8 text-center text-sm text-slate-500">Nothing matches “{filter}”</p>
        )}
      </div>
    </div>
  )
}

// ---- face-off ----

function FaceoffPanel({ state, players }: { state: ClientGameState; players: MemberInfo[] }) {
  const f = state.faceoff!
  const winner = f.buzzes[0]

  const contestantPicker = (side: 'a' | 'b') => (
    <select
      value={(side === 'a' ? f.aId : f.bId) ?? ''}
      onChange={(e) =>
        send('host_set_faceoff', {
          aId: side === 'a' ? e.target.value || null : f.aId,
          bId: side === 'b' ? e.target.value || null : f.bId,
        })
      }
      className="w-full rounded-lg bg-slate-800 px-2 py-2 font-semibold text-white"
    >
      <option value="">— pick player —</option>
      {players.map((p) => (
        <option key={p.clientId} value={p.clientId}>
          {p.name} ({p.team ? teamName(state, p.team) : 'no team'})
        </option>
      ))}
    </select>
  )

  return (
    <Section
      title="Face-off"
      right={
        <button onClick={() => send('host_cancel_question')} className="text-xs text-slate-500 underline">
          cancel question
        </button>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        {contestantPicker('a')}
        {contestantPicker('b')}
      </div>

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => send('host_arm_buzzers')}
          disabled={!f.aId || !f.bId}
          className={`flex-1 rounded-xl py-3 font-black uppercase active:scale-95 disabled:opacity-40 ${
            f.armed && !winner ? 'animate-pulse bg-green-500 text-white' : 'bg-green-600 text-white'
          }`}
        >
          {f.armed && !winner ? 'Buzzers live!' : winner ? 'Re-arm buzzers' : 'Arm buzzers'}
        </button>
        <button
          onClick={() => send('host_reset_buzzers')}
          className="rounded-xl bg-slate-700 px-4 font-bold uppercase text-slate-200 active:scale-95"
        >
          Reset
        </button>
      </div>

      {f.buzzes.length > 0 && (
        <div className="mt-3 rounded-lg bg-slate-900 p-3">
          {f.buzzes.map((b, i) => (
            <div key={b.clientId} className="flex justify-between text-sm">
              <span className={i === 0 ? 'font-black text-yellow-400' : 'text-slate-400'}>
                {i === 0 ? '🔔 ' : ''}
                {b.name}
              </span>
              <span className="tabular-nums text-slate-500">
                {i === 0 ? 'first' : `+${b.at - f.buzzes[0].at} ms`}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3">
        <div className="mb-1 text-xs uppercase tracking-widest text-slate-500">
          Winner chose play or pass — hand the board to:
        </div>
        <div className="grid grid-cols-2 gap-2">
          {([1, 2] as TeamId[]).map((t) => (
            <button
              key={t}
              onClick={() => send('host_set_control', { team: t })}
              className="rounded-xl bg-sky-600 py-3 font-black uppercase text-white active:scale-95"
            >
              {teamName(state, t)} plays
            </button>
          ))}
        </div>
      </div>
    </Section>
  )
}

// ---- board play / steal ----

function PlayPanel({ state }: { state: ClientGameState }) {
  const stealingTeam = (state.controllingTeam === 1 ? 2 : 1) as TeamId

  return (
    <Section
      title={
        state.phase === 'steal'
          ? `Steal: ${teamName(state, stealingTeam)} gets ONE guess`
          : `${teamName(state, state.controllingTeam)} playing — bank: ${state.bank}`
      }
    >
      <div className="flex items-center gap-3">
        <button
          onClick={() => send('host_strike')}
          className="flex-1 rounded-xl bg-red-600 py-4 text-2xl font-black uppercase text-white active:scale-95"
        >
          ✕ Strike
        </button>
        <div className="flex gap-1 text-3xl font-black">
          {[0, 1, 2].map((i) => (
            <span key={i} className={i < state.strikes ? 'text-red-500' : 'text-slate-700'}>
              ✕
            </span>
          ))}
        </div>
        <button
          onClick={() => send('host_remove_strike')}
          className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-slate-300"
          title="Undo strike"
        >
          undo
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {state.phase === 'board' ? (
          <button
            onClick={() => send('host_start_steal')}
            className="rounded-lg bg-slate-700 py-2 text-sm font-bold uppercase text-slate-200 active:scale-95"
          >
            Skip to steal
          </button>
        ) : (
          <button
            onClick={() => send('host_back_to_board')}
            className="rounded-lg bg-slate-700 py-2 text-sm font-bold uppercase text-slate-200 active:scale-95"
          >
            ← Back to board
          </button>
        )}
        <div />
        {([1, 2] as TeamId[]).map((t) => (
          <button
            key={t}
            onClick={() => send('host_award_pot', { team: t })}
            className="rounded-xl bg-yellow-400 py-3 font-black uppercase text-blue-950 active:scale-95"
          >
            Bank {state.bank} → {teamName(state, t)}
          </button>
        ))}
      </div>
    </Section>
  )
}

// ---- answers (host always sees everything) ----

function AnswerPanel({ state }: { state: ClientGameState }) {
  if (!state.question) return null
  return (
    <Section title={state.question.prompt}>
      <div className="space-y-1.5">
        {state.question.slots.map((slot) => (
          <div
            key={slot.index}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 ${
              slot.revealed ? 'bg-sky-900/60' : 'bg-slate-900'
            }`}
          >
            <span className="w-5 text-center text-sm font-black text-slate-500">{slot.index + 1}</span>
            <span className={`flex-1 font-semibold ${slot.revealed ? 'text-sky-300' : 'text-white'}`}>
              {slot.text}
            </span>
            <span className="font-black tabular-nums text-yellow-400">{slot.points}</span>
            <button
              onClick={() => send('host_reveal', { index: slot.index })}
              disabled={slot.revealed}
              className={`w-24 rounded py-1.5 text-xs font-black uppercase active:scale-95 ${
                slot.revealed ? 'bg-slate-800 text-slate-600' : 'bg-green-600 text-white'
              }`}
            >
              {slot.revealed ? 'Revealed' : 'Reveal'}
            </button>
          </div>
        ))}
      </div>
    </Section>
  )
}

// ---- fast money ----

function FastMoneyPanel({ state }: { state: ClientGameState }) {
  const fm = state.fastMoney!
  return (
    <Section
      title={`Fast Money — total ${fm.revealedTotal} / 200`}
      right={
        <button onClick={() => send('host_end_fastmoney')} className="text-xs text-slate-500 underline">
          end fast money
        </button>
      }
    >
      <div className="mb-3 flex gap-2">
        {([0, 1] as const).map((pass) => (
          <button
            key={pass}
            onClick={() => send('host_fm_set_pass', { pass })}
            className={`flex-1 rounded-lg py-2 text-sm font-black uppercase ${
              fm.activePass === pass ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400'
            }`}
          >
            Player {pass + 1}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {fm.questions.map((q, qi) => {
          const entry = fm.entries[fm.activePass][qi]
          const dup =
            fm.activePass === 1 &&
            entry.answerIndex !== null &&
            entry.answerIndex >= 0 &&
            fm.entries[0][qi].answerIndex === entry.answerIndex
          return (
            <div key={qi} className="rounded-lg bg-slate-900 p-3">
              <div className="text-sm font-bold text-slate-200">
                {qi + 1}. {q.prompt}
                {dup && <span className="ml-2 text-xs font-black text-red-400">⚠ duplicate of player 1</span>}
              </div>
              <div className="mt-2 flex gap-2">
                <select
                  value={entry.answerIndex ?? ''}
                  onChange={(e) =>
                    send('host_fm_set_answer', {
                      pass: fm.activePass,
                      questionIndex: qi,
                      answerIndex: e.target.value === '' ? -1 : Number(e.target.value),
                    })
                  }
                  className="flex-1 rounded bg-slate-800 px-2 py-2 text-sm font-semibold text-white"
                >
                  <option value="">— match their answer —</option>
                  {(q.answers ?? []).map((a, ai) => (
                    <option key={ai} value={ai}>
                      {a.text} ({a.points})
                    </option>
                  ))}
                  <option value={-1}>No match (0)</option>
                </select>
                <button
                  onClick={() => send('host_fm_reveal', { pass: fm.activePass, questionIndex: qi })}
                  disabled={entry.answerIndex === null || entry.revealed}
                  className={`w-24 rounded py-2 text-xs font-black uppercase active:scale-95 ${
                    entry.revealed ? 'bg-slate-800 text-slate-600' : 'bg-green-600 text-white disabled:opacity-40'
                  }`}
                >
                  {entry.revealed ? 'Shown' : 'Reveal'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </Section>
  )
}

// ---- shared ----

function Section({
  title,
  right,
  children,
}: {
  title: string
  right?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  )
}
