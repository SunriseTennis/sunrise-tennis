'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowUp, ChevronDown, Sun } from 'lucide-react'

export interface LegalSection {
  id: string
  label: string
}

interface LegalPageShellProps {
  title: string
  lastUpdated: string
  sections: LegalSection[]
  children: React.ReactNode
  /** Where the "back to home" link points. Defaults to '/'. */
  homeHref?: string
  /** Label for the back link. Defaults to 'Back to home'. */
  homeLabel?: string
}

export function LegalPageShell({ title, lastUpdated, sections, children, homeHref = '/', homeLabel = 'Back to home' }: LegalPageShellProps) {
  const [activeId, setActiveId] = useState<string>(sections[0]?.id ?? '')
  const [showBackToTop, setShowBackToTop] = useState(false)

  useEffect(() => {
    // Track which section heading is currently "active" — whichever crossed the top of the viewport most recently.
    const elements = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null)

    if (elements.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        // Collect all currently-visible section tops; pick the highest one on screen.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]?.target.id) {
          setActiveId(visible[0].target.id)
        }
      },
      // Top offset accounts for the fixed public header (~64px) + a bit of breathing room.
      { rootMargin: '-80px 0px -70% 0px', threshold: 0 },
    )

    for (const el of elements) observer.observe(el)
    return () => observer.disconnect()
  }, [sections])

  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 600)
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="bg-gradient-to-b from-[#FFFBF7] via-[#FFF6ED] to-[#FFEAD8] px-4 pt-10 pb-16 sm:pt-14 sm:pb-20">
      <div className="mx-auto max-w-6xl">
        {/* Back link */}
        <Link
          href={homeHref}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#556270] transition-colors hover:text-[#1A2332]"
        >
          <ArrowLeft className="size-3.5" />
          {homeLabel}
        </Link>

        <div className="mt-6 grid gap-6 lg:grid-cols-[220px_1fr] lg:gap-10">
          {/* Desktop ToC (sticky left rail) */}
          <aside className="hidden lg:block">
            <div className="sticky top-24">
              <p className="text-xs font-semibold tracking-wide text-[#8899A6] uppercase">
                On this page
              </p>
              <nav className="mt-3 flex flex-col gap-0.5 border-l border-[#E0D0BE]/50">
                {sections.map((s) => {
                  const active = activeId === s.id
                  return (
                    <a
                      key={s.id}
                      href={`#${s.id}`}
                      className={`-ml-px border-l-2 px-3 py-1.5 text-sm transition-colors ${
                        active
                          ? 'border-[#E87450] font-semibold text-[#1A2332]'
                          : 'border-transparent text-[#556270] hover:border-[#E0D0BE] hover:text-[#1A2332]'
                      }`}
                    >
                      {s.label}
                    </a>
                  )
                })}
              </nav>
            </div>
          </aside>

          {/* Content */}
          <main className="min-w-0">
            {/* Page header card */}
            <div className="overflow-hidden rounded-2xl border border-[#E0D0BE]/40 bg-white shadow-sm">
              {/* Accent strip */}
              <div className="h-1 bg-gradient-to-r from-[#E87450] via-[#F5B041] to-[#F7CD5D]" />

              <div className="px-5 py-6 sm:px-8 sm:py-8">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#E87450]/15 to-[#F7CD5D]/15">
                    <Sun className="size-5 text-[#E87450]" />
                  </div>
                  <h1 className="text-2xl font-bold tracking-tight text-[#1A2332] sm:text-3xl">
                    {title}
                  </h1>
                </div>
                <p className="mt-2 text-xs text-[#8899A6] sm:text-sm">Last updated: {lastUpdated}</p>

                {/* Mobile jump-to-section */}
                <details className="mt-5 rounded-xl border border-[#E0D0BE]/50 bg-[#FFFBF7] open:bg-white lg:hidden">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-[#1A2332]">
                    <span>Jump to section</span>
                    <ChevronDown className="size-4 transition-transform [details[open]_&]:rotate-180" />
                  </summary>
                  <nav className="flex flex-col gap-0.5 border-t border-[#E0D0BE]/50 px-2 py-2">
                    {sections.map((s) => (
                      <a
                        key={s.id}
                        href={`#${s.id}`}
                        className="rounded-md px-3 py-1.5 text-sm text-[#556270] transition-colors hover:bg-[#FFF6ED] hover:text-[#1A2332]"
                      >
                        {s.label}
                      </a>
                    ))}
                  </nav>
                </details>
              </div>

              {/* Body — prose */}
              <div className="border-t border-[#E0D0BE]/30 bg-white px-5 py-6 sm:px-8 sm:py-8">
                <div className="prose prose-sm max-w-none text-[#556270] prose-headings:scroll-mt-24 prose-headings:text-[#1A2332] prose-strong:text-[#1A2332] [&_h2]:relative [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:pb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:after:absolute [&_h2]:after:bottom-0 [&_h2]:after:left-0 [&_h2]:after:h-[2px] [&_h2]:after:w-10 [&_h2]:after:rounded-full [&_h2]:after:bg-gradient-to-r [&_h2]:after:from-[#E87450] [&_h2]:after:to-[#F7CD5D] [&_h2:first-child]:mt-0 [&_h3]:text-base [&_h3]:font-semibold [&_a]:text-[#2B5EA7] [&_a:hover]:text-[#1E4A88]">
                  {children}
                </div>
              </div>
            </div>

            {/* Back to top */}
            <div className="mt-6 text-center">
              <a
                href="#top"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[#556270] transition-colors hover:text-[#1A2332]"
              >
                <ArrowUp className="size-3.5" />
                Back to top
              </a>
            </div>
          </main>
        </div>
      </div>

      {/* Floating back-to-top (mobile + desktop, after scrolling) */}
      {showBackToTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed right-4 bottom-6 z-40 flex size-11 items-center justify-center rounded-full bg-[#E87450] text-white shadow-lg transition-transform hover:scale-105 sm:bottom-8 sm:right-8"
          aria-label="Back to top"
        >
          <ArrowUp className="size-5" />
        </button>
      )}
    </div>
  )
}
