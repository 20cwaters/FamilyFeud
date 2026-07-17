// Types shared between the Socket.IO server and the React client.

export type Role = 'host' | 'tv' | 'player'
export type TeamId = 1 | 2
export type Phase = 'lobby' | 'faceoff' | 'board' | 'steal' | 'round_end' | 'fastmoney'

export interface AnswerData {
  text: string
  points: number
}

export interface QuestionData {
  id: string
  prompt: string
  category: string
  answers: AnswerData[]
}

export interface TeamState {
  id: TeamId
  name: string
  score: number
}

export interface MemberInfo {
  clientId: string
  name: string
  role: Role
  team: TeamId | null
  connected: boolean
}

/** One answer slot on the board. text/points are null while hidden (non-host viewers). */
export interface BoardSlot {
  index: number
  revealed: boolean
  text: string | null
  points: number | null
}

export interface BuzzInfo {
  clientId: string
  name: string
  /** Server-received timestamp (ms). */
  at: number
}

export interface FaceoffView {
  aId: string | null
  bId: string | null
  aName: string | null
  bName: string | null
  armed: boolean
  buzzes: BuzzInfo[]
  winnerId: string | null
}

export interface FastMoneyEntryView {
  text: string | null
  points: number | null
  revealed: boolean
  /** Host only: index into the question's answers, -1 = no match, null = not set. */
  answerIndex: number | null
}

export interface FastMoneyView {
  /** answers included for the host only. */
  questions: { prompt: string; answers?: AnswerData[] }[]
  /** entries[pass][questionIndex], pass 0 = first player, pass 1 = second player. */
  entries: FastMoneyEntryView[][]
  activePass: 0 | 1
  revealedTotal: number
}

export interface YouInfo {
  clientId: string
  role: Role
  name: string
  team: TeamId | null
  isFaceoffContestant: boolean
  buzzerLive: boolean
}

export interface ClientGameState {
  code: string
  phase: Phase
  round: number
  multiplier: number
  teams: [TeamState, TeamState]
  members: MemberInfo[]
  question: { prompt: string; slots: BoardSlot[] } | null
  strikes: number
  /** Current round pot with the multiplier applied (what gets banked). */
  bank: number
  controllingTeam: TeamId | null
  faceoff: FaceoffView | null
  lastAward: { team: TeamId; amount: number } | null
  usedQuestionIds: string[]
  fastMoney: FastMoneyView | null
  hostConnected: boolean
  you: YouInfo
}

export type FxEvent =
  | { type: 'strike'; strikes: number }
  | { type: 'buzz'; name: string }
  | { type: 'reveal'; index: number }
  | { type: 'award'; team: TeamId; amount: number }

export type BuzzResult = 'won' | 'late' | 'inactive' | 'not_contestant' | 'duplicate'

export interface JoinPayload {
  clientId: string
  code: string
  name: string
  role: Role
}

export interface QuestionBankPayload {
  questions: QuestionData[]
  fastMoney: QuestionData[]
}
