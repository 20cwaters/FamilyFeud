import type {
  BuzzResult,
  ClientGameState,
  FastMoneyView,
  FxEvent,
  Phase,
  QuestionData,
  Role,
  TeamId,
  TeamState,
} from '../shared/types'
import { fastMoneyBank, questionBank } from './questions'

export interface Member {
  clientId: string
  name: string
  role: Role
  team: TeamId | null
  connected: boolean
}

interface FaceoffState {
  aId: string | null
  bId: string | null
  armed: boolean
  buzzes: { clientId: string; at: number }[]
}

interface FastMoneyEntry {
  answerIndex: number | null // index into question answers, -1 = no match
  text: string | null
  points: number
  revealed: boolean
}

interface FastMoneyState {
  questions: QuestionData[]
  entries: FastMoneyEntry[][] // [pass][questionIndex]
  activePass: 0 | 1
  currentIndex: number // question being asked right now, -1 = none yet
}

/** Phases in which revealing an answer adds its points to the round pot. */
const POT_PHASES: Phase[] = ['faceoff', 'board', 'steal']

/**
 * All game rules for one room. Pure state machine — no socket.io in here so it
 * can be unit tested directly. Fx events (strike flashes, buzz banners) are
 * surfaced through the optional onFx callback.
 */
export class Game {
  readonly code: string
  members = new Map<string, Member>()
  hostId: string | null = null

  phase: Phase = 'lobby'
  round = 1
  multiplier = 1
  teams: [TeamState, TeamState] = [
    { id: 1, name: 'Team 1', score: 0 },
    { id: 2, name: 'Team 2', score: 0 },
  ]

  question: QuestionData | null = null
  /** The prompt stays hidden from players/TV until the host shows it. */
  questionVisible = false
  revealed: boolean[] = []
  strikes = 0
  /** Raw sum of revealed answer points this round (multiplier applied at award time). */
  pot = 0
  controllingTeam: TeamId | null = null
  faceoff: FaceoffState | null = null
  usedQuestionIds = new Set<string>()
  lastAward: { team: TeamId; amount: number } | null = null

  fastMoney: FastMoneyState | null = null
  private usedFastMoneyIds = new Set<string>()

  lastActivity = Date.now()
  onFx?: (fx: FxEvent) => void

  constructor(
    code: string,
    private bank: QuestionData[] = questionBank,
    private fmBank: QuestionData[] = fastMoneyBank,
  ) {
    this.code = code
  }

  private fx(fx: FxEvent) {
    this.onFx?.(fx)
  }

  // ---- membership ----

  addMember(clientId: string, name: string, role: Role): { ok: true } | { ok: false; error: string } {
    if (role === 'host') {
      const currentHost = this.hostId ? this.members.get(this.hostId) : null
      if (currentHost && currentHost.clientId !== clientId && currentHost.connected) {
        return { ok: false, error: 'This room already has a connected host.' }
      }
      if (currentHost && currentHost.clientId !== clientId) {
        currentHost.role = 'player'
      }
      this.hostId = clientId
    }

    const existing = this.members.get(clientId)
    if (existing) {
      if (existing.role === 'host' && role !== 'host' && this.hostId === clientId) {
        this.hostId = null
      }
      existing.connected = true
      existing.role = role
      if (name) existing.name = name
    } else {
      this.members.set(clientId, {
        clientId,
        name: name || (role === 'tv' ? 'TV' : role === 'host' ? 'Host' : 'Player'),
        team: null,
        role,
        connected: true,
      })
    }
    return { ok: true }
  }

  markDisconnected(clientId: string) {
    const m = this.members.get(clientId)
    if (m) m.connected = false
  }

  removeMember(clientId: string) {
    this.members.delete(clientId)
    if (this.hostId === clientId) this.hostId = null
  }

  assignTeam(clientId: string, team: TeamId | null) {
    const m = this.members.get(clientId)
    if (m && m.role === 'player') m.team = team
  }

  setTeamName(team: TeamId, name: string) {
    if (name.trim()) this.teams[team - 1].name = name.trim().slice(0, 24)
  }

  // ---- round setup ----

  selectQuestion(questionId: string) {
    const q = this.bank.find((q) => q.id === questionId)
    if (!q) return
    this.question = q
    this.questionVisible = false
    this.revealed = q.answers.map(() => false)
    this.strikes = 0
    this.pot = 0
    this.controllingTeam = null
    this.faceoff = { aId: null, bId: null, armed: false, buzzes: [] }
    this.lastAward = null
    this.usedQuestionIds.add(questionId)
    this.fastMoney = null
    this.phase = 'faceoff'
  }

  cancelQuestion() {
    // A canceled question was never actually played — make it pickable again.
    if (this.question) this.usedQuestionIds.delete(this.question.id)
    this.question = null
    this.questionVisible = false
    this.revealed = []
    this.strikes = 0
    this.pot = 0
    this.controllingTeam = null
    this.faceoff = null
    this.phase = 'lobby'
  }

  setMultiplier(m: number) {
    if (m === 1 || m === 2 || m === 3) this.multiplier = m
  }

  /** Put the question prompt up on the TV and player phones. */
  showQuestion() {
    if (this.question) this.questionVisible = true
  }

  // ---- face-off / buzzers ----

  setFaceoffPair(aId: string | null, bId: string | null) {
    if (this.phase !== 'faceoff') return
    this.faceoff = { aId, bId, armed: false, buzzes: [] }
  }

  armBuzzers() {
    if (this.phase !== 'faceoff' || !this.faceoff) return
    this.faceoff.armed = true
    this.faceoff.buzzes = []
  }

  resetBuzzers() {
    if (!this.faceoff) return
    this.faceoff.armed = false
    this.faceoff.buzzes = []
  }

  /**
   * Register a buzz. `at` must be the server receipt timestamp — client clocks
   * are never consulted, so ordering is fair across devices.
   */
  buzz(clientId: string, at: number): BuzzResult {
    if (this.phase !== 'faceoff' || !this.faceoff?.armed) return 'inactive'
    const f = this.faceoff
    if (clientId !== f.aId && clientId !== f.bId) return 'not_contestant'
    if (f.buzzes.some((b) => b.clientId === clientId)) return 'duplicate'
    f.buzzes.push({ clientId, at })
    if (f.buzzes.length === 1) {
      this.fx({ type: 'buzz', name: this.members.get(clientId)?.name ?? '?' })
      return 'won'
    }
    return 'late'
  }

  // ---- board play ----

  reveal(index: number): boolean {
    if (!this.question) return false
    if (index < 0 || index >= this.question.answers.length) return false
    if (this.revealed[index]) return false
    this.revealed[index] = true
    if (POT_PHASES.includes(this.phase)) {
      this.pot += this.question.answers[index].points
    }
    this.fx({ type: 'reveal', index })
    return true
  }

  strike() {
    if (!POT_PHASES.includes(this.phase)) return
    if (this.phase === 'board') {
      if (this.strikes >= 3) return
      this.strikes += 1
      this.fx({ type: 'strike', strikes: this.strikes })
      if (this.strikes === 3) this.phase = 'steal'
    } else {
      // Face-off misses and failed steals flash an X but don't accumulate.
      this.fx({ type: 'strike', strikes: 1 })
    }
  }

  removeStrike() {
    if (this.strikes === 0) return
    this.strikes -= 1
    if (this.phase === 'steal') this.phase = 'board'
  }

  /** Face-off winner chose play or pass; the chosen team takes the board. */
  setControl(team: TeamId) {
    if (this.phase !== 'faceoff' && this.phase !== 'board') return
    this.controllingTeam = team
    this.strikes = 0
    if (this.faceoff) this.faceoff.armed = false
    this.phase = 'board'
  }

  startSteal() {
    if (this.phase === 'board') this.phase = 'steal'
  }

  backToBoard() {
    if (this.phase === 'steal') this.phase = 'board'
  }

  /** Bank the pot (times multiplier) to a team and end the round. */
  awardPot(team: TeamId) {
    if (!this.question) return
    if (this.phase === 'lobby' || this.phase === 'fastmoney' || this.phase === 'round_end') return
    const amount = this.pot * this.multiplier
    this.teams[team - 1].score += amount
    this.lastAward = { team, amount }
    this.pot = 0
    this.phase = 'round_end'
    this.fx({ type: 'award', team, amount })
  }

  adjustScore(team: TeamId, delta: number) {
    if (!Number.isFinite(delta)) return
    this.teams[team - 1].score = Math.max(0, this.teams[team - 1].score + Math.round(delta))
  }

  nextRound() {
    this.round += 1
    this.question = null
    this.questionVisible = false
    this.revealed = []
    this.strikes = 0
    this.pot = 0
    this.controllingTeam = null
    this.faceoff = null
    this.lastAward = null
    this.fastMoney = null
    this.phase = 'lobby'
  }

  // ---- fast money ----

  startFastMoney() {
    let available = this.fmBank.filter((q) => !this.usedFastMoneyIds.has(q.id))
    if (available.length < 5) {
      this.usedFastMoneyIds.clear()
      available = [...this.fmBank]
    }
    const questions = available.slice(0, 5)
    for (const q of questions) this.usedFastMoneyIds.add(q.id)
    this.fastMoney = {
      questions,
      entries: [0, 1].map(() =>
        questions.map(() => ({ answerIndex: null, text: null, points: 0, revealed: false })),
      ),
      activePass: 0,
      currentIndex: -1,
    }
    this.question = null
    this.questionVisible = false
    this.revealed = []
    this.faceoff = null
    this.phase = 'fastmoney'
  }

  fmSetActivePass(pass: 0 | 1) {
    if (!this.fastMoney) return
    this.fastMoney.activePass = pass
    // New pass starts with no question up — the host re-asks them one by one.
    this.fastMoney.currentIndex = -1
  }

  /** Show one fast money question to the players/TV (-1 hides them all). */
  fmSetCurrent(index: number) {
    const fm = this.fastMoney
    if (!fm || this.phase !== 'fastmoney') return
    if (index >= -1 && index < fm.questions.length) fm.currentIndex = index
  }

  /** Host matches what the player said to a bank answer (-1 = no match, 0 points). */
  fmSetAnswer(pass: 0 | 1, questionIndex: number, answerIndex: number) {
    const fm = this.fastMoney
    if (!fm || this.phase !== 'fastmoney') return
    const q = fm.questions[questionIndex]
    if (!q) return
    const entry = fm.entries[pass][questionIndex]
    if (answerIndex >= 0 && answerIndex < q.answers.length) {
      entry.answerIndex = answerIndex
      entry.text = q.answers[answerIndex].text
      entry.points = q.answers[answerIndex].points
    } else {
      entry.answerIndex = -1
      entry.text = 'No match'
      entry.points = 0
    }
  }

  fmReveal(pass: 0 | 1, questionIndex: number) {
    const fm = this.fastMoney
    if (!fm || this.phase !== 'fastmoney') return
    const entry = fm.entries[pass]?.[questionIndex]
    if (!entry || entry.answerIndex === null || entry.revealed) return
    entry.revealed = true
    this.fx({ type: 'reveal', index: questionIndex })
  }

  fmTotal(): number {
    if (!this.fastMoney) return 0
    return this.fastMoney.entries.flat().reduce((sum, e) => sum + (e.revealed ? e.points : 0), 0)
  }

  endFastMoney() {
    this.fastMoney = null
    this.phase = 'lobby'
  }

  // ---- serialization ----

  private fmView(isHost: boolean): FastMoneyView | null {
    if (!this.fastMoney) return null
    const fm = this.fastMoney
    return {
      questions: fm.questions.map((q, i) =>
        isHost
          ? { prompt: q.prompt, answers: q.answers }
          : { prompt: i === fm.currentIndex ? q.prompt : '' },
      ),
      currentIndex: fm.currentIndex,
      entries: fm.entries.map((pass) =>
        pass.map((e) => ({
          revealed: e.revealed,
          text: isHost || e.revealed ? e.text : null,
          points: isHost || e.revealed ? e.points : null,
          answerIndex: isHost ? e.answerIndex : null,
        })),
      ),
      activePass: fm.activePass,
      revealedTotal: this.fmTotal(),
    }
  }

  /** Build the state snapshot for one viewer. Unrevealed answers are hidden from non-hosts. */
  toStateFor(viewerId: string): ClientGameState | null {
    const viewer = this.members.get(viewerId)
    if (!viewer) return null
    const isHost = viewer.role === 'host'
    const f = this.faceoff
    const isContestant = !!f && (f.aId === viewerId || f.bId === viewerId)

    return {
      code: this.code,
      phase: this.phase,
      round: this.round,
      multiplier: this.multiplier,
      teams: [{ ...this.teams[0] }, { ...this.teams[1] }],
      members: [...this.members.values()].map((m) => ({
        clientId: m.clientId,
        name: m.name,
        role: m.role,
        team: m.team,
        connected: m.connected,
      })),
      question: this.question
        ? {
            prompt: isHost || this.questionVisible ? this.question.prompt : null,
            slots: this.question.answers.map((a, i) => ({
              index: i,
              revealed: this.revealed[i],
              text: isHost || this.revealed[i] ? a.text : null,
              points: isHost || this.revealed[i] ? a.points : null,
            })),
          }
        : null,
      questionVisible: this.questionVisible,
      strikes: this.strikes,
      bank: this.pot * this.multiplier,
      controllingTeam: this.controllingTeam,
      faceoff: f
        ? {
            aId: f.aId,
            bId: f.bId,
            aName: f.aId ? (this.members.get(f.aId)?.name ?? null) : null,
            bName: f.bId ? (this.members.get(f.bId)?.name ?? null) : null,
            armed: f.armed,
            buzzes: f.buzzes.map((b) => ({
              clientId: b.clientId,
              name: this.members.get(b.clientId)?.name ?? '?',
              at: b.at,
            })),
            winnerId: f.buzzes[0]?.clientId ?? null,
          }
        : null,
      lastAward: this.lastAward,
      usedQuestionIds: [...this.usedQuestionIds],
      fastMoney: this.fmView(isHost),
      hostConnected: !!(this.hostId && this.members.get(this.hostId)?.connected),
      you: {
        clientId: viewerId,
        role: viewer.role,
        name: viewer.name,
        team: viewer.team,
        isFaceoffContestant: isContestant,
        buzzerLive:
          this.phase === 'faceoff' &&
          !!f?.armed &&
          f.buzzes.length === 0 &&
          isContestant &&
          viewer.role === 'player',
      },
    }
  }

  allDisconnected(): boolean {
    return [...this.members.values()].every((m) => !m.connected)
  }
}
