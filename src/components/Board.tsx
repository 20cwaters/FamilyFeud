import type { BoardSlot } from '../../shared/types'

/**
 * The classic answer board: numbered slots in two columns, ordered down the
 * left column first. Used by the TV (large) and player phones (compact).
 */
export function Board({ slots, size }: { slots: BoardSlot[]; size: 'tv' | 'phone' }) {
  const rows = Math.ceil(slots.length / 2)
  const tv = size === 'tv'
  return (
    <div
      className={`grid grid-flow-col ${tv ? 'gap-3' : 'gap-1.5'}`}
      style={{ gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}
    >
      {slots.map((slot) => (
        <Slot key={slot.index} slot={slot} tv={tv} />
      ))}
    </div>
  )
}

function Slot({ slot, tv }: { slot: BoardSlot; tv: boolean }) {
  if (slot.revealed) {
    return (
      <div
        className={`animate-flip flex items-center justify-between rounded-lg border-2 border-sky-300/60 bg-gradient-to-b from-sky-600 to-blue-800 shadow-lg ${
          tv ? 'px-5 py-3' : 'px-3 py-1.5'
        }`}
      >
        <span
          className={`font-extrabold uppercase tracking-wide text-white drop-shadow ${
            tv ? 'text-[2.6vw] leading-tight' : 'text-sm'
          }`}
        >
          {slot.text}
        </span>
        <span
          className={`ml-3 shrink-0 rounded-md bg-yellow-400 text-center font-black text-blue-950 ${
            tv ? 'min-w-[4.5vw] px-2 py-1 text-[2.2vw]' : 'min-w-9 px-1.5 py-0.5 text-sm'
          }`}
        >
          {slot.points}
        </span>
      </div>
    )
  }
  return (
    <div
      className={`flex items-center justify-center rounded-lg border-2 border-blue-500/40 bg-gradient-to-b from-blue-800 to-blue-950 ${
        tv ? 'px-5 py-3' : 'px-3 py-1.5'
      }`}
    >
      <span
        className={`flex items-center justify-center rounded-full bg-gradient-to-b from-blue-500 to-blue-700 font-black text-white shadow-inner ${
          tv ? 'h-[3.4vw] w-[3.4vw] text-[2vw]' : 'h-6 w-6 text-xs'
        }`}
      >
        {slot.index + 1}
      </span>
    </div>
  )
}
