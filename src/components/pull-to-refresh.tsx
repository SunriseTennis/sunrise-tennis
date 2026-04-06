'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

interface PullToRefreshProps {
  children: React.ReactNode
}

const THRESHOLD = 80 // px to trigger refresh
const MAX_PULL = 120 // max visual pull distance

export function PullToRefresh({ children }: PullToRefreshProps) {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const startY = useRef(0)
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const pulling = useRef(false)

  const isAtTop = useCallback((): boolean => {
    // Check if we're scrolled to the top of the page
    return window.scrollY <= 0
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const onTouchStart = (e: TouchEvent) => {
      if (!isAtTop() || refreshing) return
      startY.current = e.touches[0].clientY
      pulling.current = true
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!pulling.current || refreshing) return

      const currentY = e.touches[0].clientY
      const diff = currentY - startY.current

      if (diff > 0 && isAtTop()) {
        // Dampen the pull distance with diminishing returns
        const dampened = Math.min(diff * 0.5, MAX_PULL)
        setPullDistance(dampened)

        // Prevent default scroll when pulling down
        if (dampened > 10) e.preventDefault()
      } else {
        pulling.current = false
        setPullDistance(0)
      }
    }

    const onTouchEnd = () => {
      if (!pulling.current) return
      pulling.current = false

      if (pullDistance >= THRESHOLD && !refreshing) {
        setRefreshing(true)
        setPullDistance(THRESHOLD * 0.5) // Shrink to loading indicator size

        // Trigger router refresh
        router.refresh()

        // Reset after a brief delay (router.refresh is async but doesn't return a promise)
        setTimeout(() => {
          setRefreshing(false)
          setPullDistance(0)
        }, 1000)
      } else {
        setPullDistance(0)
      }
    }

    container.addEventListener('touchstart', onTouchStart, { passive: true })
    container.addEventListener('touchmove', onTouchMove, { passive: false })
    container.addEventListener('touchend', onTouchEnd, { passive: true })

    return () => {
      container.removeEventListener('touchstart', onTouchStart)
      container.removeEventListener('touchmove', onTouchMove)
      container.removeEventListener('touchend', onTouchEnd)
    }
  }, [isAtTop, pullDistance, refreshing, router])

  const progress = Math.min(pullDistance / THRESHOLD, 1)
  const showIndicator = pullDistance > 10 || refreshing

  return (
    <div ref={containerRef} className="relative">
      {/* Pull indicator */}
      <div
        className={cn(
          'absolute left-1/2 -translate-x-1/2 z-50 flex items-center justify-center transition-opacity duration-200',
          showIndicator ? 'opacity-100' : 'opacity-0'
        )}
        style={{
          top: Math.max(pullDistance - 40, -40),
          transition: pulling.current ? 'none' : 'all 0.3s ease',
        }}
      >
        <div className="flex size-8 items-center justify-center rounded-full bg-card shadow-elevated border border-border">
          <RefreshCw
            className={cn(
              'size-4 text-primary transition-transform',
              refreshing && 'animate-spin'
            )}
            style={{
              transform: refreshing ? undefined : `rotate(${progress * 360}deg)`,
            }}
          />
        </div>
      </div>

      {/* Content with pull transform */}
      <div
        style={{
          transform: pullDistance > 0 ? `translateY(${pullDistance}px)` : undefined,
          transition: pulling.current ? 'none' : 'transform 0.3s ease',
        }}
      >
        {children}
      </div>
    </div>
  )
}
