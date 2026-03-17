import Link from 'next/link'

const navItems = [
  { href: '/parent', label: 'Overview' },
  { href: '/parent/programs', label: 'Programs' },
  { href: '/parent/payments', label: 'Payments' },
  { href: '/parent/teams', label: 'Teams' },
  { href: '/parent/settings', label: 'Settings' },
]

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <nav className="mb-6 flex gap-1 border-b border-gray-200">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-gray-600 hover:border-orange-300 hover:text-gray-900"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  )
}
