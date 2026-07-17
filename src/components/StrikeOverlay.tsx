import { useEffect, useState } from 'react'
import type { FxEvent } from '../../shared/types'
import { socket } from '../socket'
import { playStrike } from '../sound'

/**
 * Full-screen red X flash whenever the server emits a strike fx.
 * Mount once per screen (TV and player phones).
 */
export function StrikeOverlay() {
  const [flash, setFlash] = useState<{ count: number; key: number } | null>(null)

  useEffect(() => {
    const onFx = (fx: FxEvent) => {
      if (fx.type === 'strike') {
        playStrike()
        setFlash({ count: fx.strikes, key: Date.now() })
      }
    }
    socket.on('fx', onFx)
    return () => {
      socket.off('fx', onFx)
    }
  }, [])

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 1200)
    return () => clearTimeout(t)
  }, [flash])

  if (!flash) return null
  return (
    <div key={flash.key} className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="animate-strike flex gap-[2vw]">
        {Array.from({ length: Math.min(flash.count, 3) }, (_, i) => (
          <span
            key={i}
            className="rounded-2xl border-[0.6vw] border-red-500 px-[2vw] font-black leading-none text-red-500 [text-shadow:0_0_30px_rgba(239,68,68,0.9)] text-[22vw] md:text-[18vw]"
          >
            X
          </span>
        ))}
      </div>
    </div>
  )
}
