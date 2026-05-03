import type { Metadata } from 'next'
import Image from 'next/image'
import { Sun, Users, Calendar, BarChart3, MapPin, Phone, ChevronRight, ChevronDown, Trophy, Star, GraduationCap, Heart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PublicHeader } from '@/components/public-header'
import { PublicFooter } from '@/components/public-footer'
import { StickyMobileCTA } from '@/components/sticky-mobile-cta'
import { TrialBookingForm } from '@/components/trial-booking-form'
import { OurApproach } from '@/components/our-approach'
import { PriceStrip } from '@/components/price-strip'
import { ProgramsSection } from './programs-section'
import { createClient } from '@supabase/supabase-js'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Junior Tennis Coaching Adelaide - Ages 3-18 | Sunrise Tennis',
  description:
    'Expert junior tennis coaching at Somerton Park Tennis Club. Game-based Hot Shots programs for ages 3-18. Red, Orange, Green and Yellow Ball levels. Book a free trial.',
  alternates: { canonical: 'https://sunrisetennis.com.au' },
  openGraph: {
    title: 'Sunrise Tennis - Junior Tennis Coaching Adelaide',
    description:
      'Game-based tennis coaching for kids aged 3-18 at Somerton Park Tennis Club, Adelaide.',
    url: 'https://sunrisetennis.com.au',
    siteName: 'Sunrise Tennis',
    locale: 'en_AU',
    type: 'website',
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'Sunrise Tennis - Junior Tennis Coaching Adelaide',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sunrise Tennis - Junior Tennis Coaching Adelaide',
    description:
      'Game-based tennis coaching for kids aged 3-18 at Somerton Park Tennis Club, Adelaide.',
  },
}

async function getPrograms() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data } = await supabase
    .from('programs')
    .select('id, name, type, level, day_of_week, start_time, end_time, per_session_cents')
    .eq('status', 'active')
    .in('type', ['group', 'squad'])
    .order('level')
    .order('day_of_week')

  return data ?? []
}

const VALUE_PROPS = [
  {
    icon: Users,
    title: 'Every Level Welcome',
    description: 'From first-time Blue Ball to competitive Yellow Ball squads — ages 3 to 18',
  },
  {
    icon: Heart,
    title: 'Personal Attention',
    description: 'Individual feedback every session — not just group instruction',
  },
  {
    icon: Calendar,
    title: 'Flexible Schedule',
    description: '20+ sessions across the week — find a time that works',
  },
  {
    icon: BarChart3,
    title: 'Progress Tracking',
    description: "See your child's development through our parent portal",
  },
]

const STEPS = [
  {
    num: 1,
    title: 'Book a Trial',
    description: 'Try a session for free — no account needed',
  },
  {
    num: 2,
    title: 'Find Your Level',
    description: "We'll assess your child and recommend the right group",
  },
  {
    num: 3,
    title: 'Join & Play',
    description: 'Enrol through our parent portal and track progress',
  },
]

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': ['SportsActivityLocation', 'LocalBusiness'],
  name: 'Sunrise Tennis',
  description:
    'Junior tennis coaching for ages 3-18 at Somerton Park Tennis Club, Adelaide. Game-based Hot Shots programs.',
  url: 'https://sunrisetennis.com.au',
  telephone: '+61431368752',
  address: {
    '@type': 'PostalAddress',
    streetAddress: '40 Wilton Ave',
    addressLocality: 'Somerton Park',
    addressRegion: 'SA',
    postalCode: '5044',
    addressCountry: 'AU',
  },
  geo: {
    '@type': 'GeoCoordinates',
    latitude: -34.9985,
    longitude: 138.5168,
  },
  sameAs: [
    'https://www.instagram.com/sunrisetennis',
    'https://www.facebook.com/sunrisetennis',
  ],
  image: 'https://sunrisetennis.com.au/opengraph-image',
  priceRange: '$$',
  areaServed: [
    'Somerton Park',
    'Glenelg',
    'Brighton',
    'Seacliff',
    'Morphettville',
    'Adelaide',
  ],
}

export default async function Home() {
  const programs = await getPrograms()

  return (
    <div className="min-h-screen bg-[#FFFBF7]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PublicHeader />

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-4 pt-16 pb-20 text-white">
        {/* Gradient background — image to be added later with real club photos */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#1A2332] via-[#2B5EA7] to-[#E87450]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(247,205,93,0.25),transparent_60%)]" />

        <div className="relative mx-auto max-w-3xl text-center">
          {/* Logo mark */}
          <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm">
            <Sun className="size-8 text-[#F7CD5D]" />
          </div>

          <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
            Where Every Player Shines
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-white/95 sm:text-lg md:text-xl">
            We coach through feel, not formula — every player read individually, every session built around play.
          </p>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-white/75 sm:text-base">
            Professional junior tennis coaching for ages 3–18 at Somerton Park Tennis Club, Adelaide
          </p>

          {/* Single primary CTA + secondary text link */}
          <div className="mt-8 flex flex-col items-center gap-4">
            <Button asChild size="lg" className="w-full rounded-full bg-[#E87450] px-8 py-6 text-base font-semibold text-white shadow-lg hover:bg-[#D06040] sm:w-auto sm:px-10">
              <a href="#trial">Book a Free Trial</a>
            </Button>
            <a
              href="#programs"
              className="inline-flex items-center gap-1 text-sm font-medium text-white/85 transition-colors hover:text-white"
            >
              See Programs
              <ChevronDown className="size-4" />
            </a>
          </div>

          {/* Trust indicators */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-white/70">
            <span>5 Levels</span>
            <span className="hidden sm:inline">·</span>
            <span>20+ Sessions/Week</span>
            <span className="hidden sm:inline">·</span>
            <span className="flex items-center gap-1">
              <MapPin className="size-3.5" />
              Somerton Park TC
            </span>
          </div>
        </div>

        {/* Bottom gradient fade */}
        <div className="absolute right-0 bottom-0 left-0 h-24 bg-gradient-to-t from-[#FFFBF7] to-transparent" />
      </section>

      {/* ── Social Proof Strip ────────────────────────────────────── */}
      <section className="relative -mt-8 z-10 px-4">
        <div className="mx-auto max-w-4xl rounded-2xl border border-[#E0D0BE]/40 bg-white/90 px-4 py-4 shadow-lg backdrop-blur-sm sm:px-6 sm:py-5">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-6">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#2B5EA7]/10">
                <Users className="size-5 text-[#2B5EA7]" />
              </div>
              <div>
                <p className="text-lg font-bold text-[#1A2332]">100+</p>
                <p className="text-xs text-[#556270]">Active Students</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#E87450]/10">
                <GraduationCap className="size-5 text-[#E87450]" />
              </div>
              <div>
                <p className="text-lg font-bold text-[#1A2332]">5</p>
                <p className="text-xs text-[#556270]">Ball Levels</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#F5B041]/10">
                <Star className="size-5 text-[#D4960A]" />
              </div>
              <div>
                <p className="text-lg font-bold text-[#1A2332]">20+</p>
                <p className="text-xs text-[#556270]">Sessions/Week</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#2D8A4E]/10">
                <Trophy className="size-5 text-[#2D8A4E]" />
              </div>
              <div>
                <p className="text-lg font-bold text-[#1A2332]">Term 2</p>
                <p className="text-xs text-[#556270]">Now Enrolling</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Value Propositions ─────────────────────────────────────── */}
      <section className="bg-gradient-to-b from-[#FFFBF7] to-[#FFF6ED] px-4 py-14 sm:py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-bold text-[#1A2332] sm:text-3xl">
            Why Sunrise Tennis?
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-[#556270] sm:text-base">
            We create a supportive, fun environment where every child can develop their tennis skills and confidence
          </p>

          <div className="mt-8 grid grid-cols-2 gap-3 sm:mt-10 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
            {VALUE_PROPS.map((prop, i) => (
              <div
                key={prop.title}
                className="group rounded-xl border border-[#E0D0BE]/40 bg-white/80 p-4 shadow-sm transition-all hover:shadow-md sm:p-6"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#2B5EA7]/10 to-[#E87450]/10 sm:size-11">
                  <prop.icon className="size-4 text-[#2B5EA7] sm:size-5" />
                </div>
                <h3 className="mt-3 text-sm font-semibold text-[#1A2332] sm:mt-4 sm:text-base">{prop.title}</h3>
                <p className="mt-1 text-xs leading-snug text-[#556270] sm:text-sm sm:leading-relaxed">{prop.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Our Approach (coaching philosophy) ────────────────────── */}
      <OurApproach />

      {/* ── Price Strip ───────────────────────────────────────────── */}
      <PriceStrip />

      {/* ── Multi-Group Discount Spotlight ────────────────────────── */}
      <section className="bg-gradient-to-b from-[#FFF6ED] to-[#FFEAD8] px-4 py-10 sm:py-14">
        <div className="mx-auto max-w-3xl">
          <div className="overflow-hidden rounded-2xl border border-[#E0D0BE]/40 bg-white shadow-sm">
            <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:px-7 sm:py-6">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#E87450] to-[#F7CD5D] text-white shadow-md">
                <Heart className="size-6" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold text-[#1A2332] sm:text-xl">
                  More than one group? Save 25% on the cheaper one.
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-[#556270]">
                  When your child enrols in two or more groups, the higher-priced one stays full price and the cheaper one is automatically <span className="font-semibold text-[#1A2332]">25% off — for the whole term</span>. Per child, stacks with our 15% early-bird.
                </p>
                <p className="mt-2 text-xs text-[#8899A6]">
                  Example: Green Ball + Friday Night Squad for one player → <span className="font-semibold text-[#1A2332] tabular-nums">$30 + $18.75/wk</span> instead of $30 + $25.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Programs ──────────────────────────────────────────────── */}
      <ProgramsSection programs={programs} />

      {/* ── How It Works ──────────────────────────────────────────── */}
      <section className="bg-gradient-to-b from-[#FFFBF7] to-[#FFF6ED] px-4 py-16 sm:py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-2xl font-bold text-[#1A2332] sm:text-3xl">
            Getting Started is Easy
          </h2>

          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            {STEPS.map((step) => (
              <div key={step.num} className="relative text-center">
                {/* Number circle */}
                <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-[#2B5EA7] to-[#E87450] text-xl font-bold text-white shadow-lg">
                  {step.num}
                </div>
                <h3 className="mt-4 text-lg font-semibold text-[#1A2332]">{step.title}</h3>
                <p className="mt-2 text-sm text-[#556270]">{step.description}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 text-center">
            <Button asChild size="lg" className="rounded-full bg-[#E87450] px-8 text-white hover:bg-[#D06040]">
              <a href="#trial">
                Get Started
                <ChevronRight className="ml-1 size-4" />
              </a>
            </Button>
          </div>
        </div>
      </section>

      {/* ── Book a Free Trial ─────────────────────────────────────── */}
      <section id="trial" className="scroll-mt-20 bg-[#FFFBF7] px-4 py-16 sm:py-20">
        <div className="mx-auto max-w-5xl">
          <div className="overflow-hidden rounded-2xl border border-[#E0D0BE]/40 bg-white shadow-lg lg:grid lg:grid-cols-5">
            {/* Image side */}
            <div className="relative hidden lg:col-span-2 lg:block">
              <Image
                src="/images/somerton/court-1.jpg"
                alt="Somerton Park Tennis Club courts"
                fill
                className="object-cover"
                sizes="40vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#1A2332]/60 to-transparent" />
              <div className="absolute right-0 bottom-0 left-0 p-6 text-white">
                <p className="text-lg font-semibold">Try a session free</p>
                <p className="mt-1 text-sm text-white/80">No account needed, no commitment</p>
              </div>
            </div>

            {/* Form side */}
            <div className="p-6 sm:p-8 lg:col-span-3">
              <h2 className="text-2xl font-bold text-[#1A2332]">Book a Free Trial</h2>
              <p className="mt-2 text-sm text-[#556270]">
                Fill in the details below and we&apos;ll get back to you within 24 hours to arrange your child&apos;s first session.
              </p>
              <div className="mt-6">
                <TrialBookingForm />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── About ─────────────────────────────────────────────────── */}
      <section id="about" className="scroll-mt-20 bg-gradient-to-b from-[#FFF6ED] to-[#FFEAD8] px-4 py-16 sm:py-20">
        <div className="mx-auto max-w-4xl">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <h2 className="text-2xl font-bold text-[#1A2332] sm:text-3xl">About Sunrise Tennis</h2>
              <p className="mt-4 leading-relaxed text-[#556270]">
                Based at Somerton Park Tennis Club in Adelaide, Sunrise Tennis provides professional coaching for juniors of all ages and abilities. From first-time Red Ball players to competitive Yellow Ball squads, our programs are designed to develop skills, confidence, and a love of the game.
              </p>
              <p className="mt-3 leading-relaxed text-[#556270]">
                With structured progression through the ball-colour pathway, every child gets individual feedback in every session. Our parent portal keeps you connected to your child&apos;s development with lesson notes, video analysis, and easy online booking.
              </p>
              <div className="mt-6">
                <Button asChild variant="outline" className="rounded-full border-[#2B5EA7]/30 text-[#2B5EA7] hover:bg-[#2B5EA7]/5">
                  <a href="#trial">
                    Book a Free Trial
                    <ChevronRight className="ml-1 size-4" />
                  </a>
                </Button>
              </div>
            </div>

            {/* Image */}
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl shadow-lg">
              <Image
                src="/images/somerton/court-2.jpg"
                alt="Somerton Park Tennis Club"
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
              <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-black/10" />
            </div>
          </div>
        </div>
      </section>

      {/* ── Location & Contact ────────────────────────────────────── */}
      <section id="contact" className="scroll-mt-20 bg-[#FFFBF7] px-4 py-14 sm:py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-2xl font-bold text-[#1A2332] sm:text-3xl">Find Us</h2>
          <div className="mt-8 grid gap-3 sm:mt-10 sm:grid-cols-3 sm:gap-6">
            {/* Location */}
            <a
              href="https://maps.google.com/?q=Somerton+Park+Tennis+Club+40+Wilton+Ave+Somerton+Park+SA+5044"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-3 rounded-xl border border-[#E0D0BE]/40 bg-white p-4 text-left shadow-sm transition-all hover:shadow-md sm:flex-col sm:items-center sm:p-6 sm:text-center"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#2B5EA7]/10 sm:size-11">
                <MapPin className="size-5 text-[#2B5EA7]" />
              </div>
              <div className="min-w-0 sm:mt-3">
                <h3 className="text-sm font-semibold text-[#1A2332] sm:text-base">Location</h3>
                <p className="truncate text-xs text-[#556270] sm:mt-1 sm:whitespace-normal sm:text-sm">
                  Somerton Park Tennis Club
                  <span className="hidden sm:inline"><br />40 Wilton Ave, Somerton Park</span>
                </p>
              </div>
            </a>

            {/* Call Us — Coach Maxim */}
            <a
              href="tel:0431368752"
              className="group flex items-center gap-3 rounded-xl border border-[#E0D0BE]/40 bg-white p-4 text-left shadow-sm transition-all hover:shadow-md sm:flex-col sm:items-center sm:p-6 sm:text-center"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#E87450]/10 sm:size-11">
                <Phone className="size-5 text-[#E87450]" />
              </div>
              <div className="min-w-0 sm:mt-3">
                <h3 className="text-sm font-semibold text-[#1A2332] sm:text-base">Call Coach Maxim</h3>
                <p className="truncate text-xs text-[#556270] sm:mt-1 sm:text-sm">
                  0431 368 752
                </p>
              </div>
            </a>

            {/* Book a Trial */}
            <a
              href="#trial"
              className="group flex items-center gap-3 rounded-xl border border-[#E0D0BE]/40 bg-white p-4 text-left shadow-sm transition-all hover:shadow-md sm:flex-col sm:items-center sm:p-6 sm:text-center"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#2D8A4E]/10 sm:size-11">
                <Calendar className="size-5 text-[#2D8A4E]" />
              </div>
              <div className="min-w-0 sm:mt-3">
                <h3 className="text-sm font-semibold text-[#1A2332] sm:text-base">Book a Trial</h3>
                <p className="truncate text-xs text-[#556270] sm:mt-1 sm:whitespace-normal sm:text-sm">
                  Free first session
                  <span className="hidden sm:inline"><br />No account needed</span>
                </p>
              </div>
            </a>
          </div>
        </div>
      </section>

      <PublicFooter />
      <StickyMobileCTA />
    </div>
  )
}
