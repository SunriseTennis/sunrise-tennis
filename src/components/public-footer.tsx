import Link from 'next/link'
import { Sun, Phone, MapPin, Mail } from 'lucide-react'

export function PublicFooter() {
  return (
    <footer className="relative border-t border-[#E0D0BE]/30 bg-[#1A2332] text-white/70">
      {/* Gradient stripe accent */}
      <div className="absolute top-0 right-0 left-0 h-[3px] bg-gradient-to-r from-[#2B5EA7] via-[#E87450] to-[#F7CD5D]" />

      <div className="mx-auto max-w-6xl px-4 pb-8 pt-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2">
              <Sun className="size-5 text-[#F7CD5D]" />
              <span className="text-lg font-bold text-white">Sunrise Tennis</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed">
              Professional junior tennis coaching for every level. Building skills, confidence, and a love of the game.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="mb-3 text-sm font-semibold tracking-wide text-white/90 uppercase">Quick Links</h3>
            <ul className="space-y-2 text-sm">
              <li><a href="#programs" className="transition-colors hover:text-white">Programs</a></li>
              <li><a href="#trial" className="transition-colors hover:text-white">Book a Free Trial</a></li>
              <li><a href="#about" className="transition-colors hover:text-white">About Us</a></li>
              <li><Link href="/login" className="transition-colors hover:text-white">Parent Portal</Link></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="mb-3 text-sm font-semibold tracking-wide text-white/90 uppercase">Contact</h3>
            <ul className="space-y-2.5 text-sm">
              <li>
                <a href="tel:0431368752" className="flex items-start gap-2 transition-colors hover:text-white">
                  <Phone className="mt-0.5 size-4 shrink-0" />
                  <span>
                    0431 368 752
                    <span className="block text-xs text-white/50">Maxim</span>
                  </span>
                </a>
              </li>
              <li>
                <a href="mailto:info@sunrisetennis.com.au" className="flex items-center gap-2 transition-colors hover:text-white">
                  <Mail className="size-4 shrink-0" />
                  info@sunrisetennis.com.au
                </a>
              </li>
            </ul>
          </div>

          {/* Location */}
          <div>
            <h3 className="mb-3 text-sm font-semibold tracking-wide text-white/90 uppercase">Location</h3>
            <a
              href="https://maps.google.com/?q=Somerton+Park+Tennis+Club+40+Wilton+Ave+Somerton+Park+SA+5044"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2 text-sm transition-colors hover:text-white"
            >
              <MapPin className="mt-0.5 size-4 shrink-0" />
              <div>
                <p>Somerton Park Tennis Club</p>
                <p>40 Wilton Ave</p>
                <p>Somerton Park SA 5044</p>
              </div>
            </a>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 flex flex-col items-center gap-3 border-t border-white/10 pt-6 text-xs sm:flex-row sm:justify-between">
          <p>&copy; {new Date().getFullYear()} Sunrise Tennis PTY LTD. All rights reserved.</p>
          <div className="flex gap-5">
            <Link href="/privacy" className="transition-colors hover:text-white">Privacy Policy</Link>
            <Link href="/terms" className="transition-colors hover:text-white">Terms of Service</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
