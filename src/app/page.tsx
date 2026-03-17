import Link from 'next/link'

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md text-center">
        <div className="mb-2 text-5xl">🌅</div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          Sunrise Tennis
        </h1>
        <p className="mt-3 text-gray-600">
          Coaching, bookings, and team management
        </p>

        <div className="mt-8 flex flex-col gap-3">
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-md bg-orange-500 px-6 py-3 text-sm font-medium text-white shadow-sm hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-6 py-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
          >
            Create account
          </Link>
        </div>

        <p className="mt-10 text-xs text-gray-400">
          Somerton Park Tennis Club — Adelaide, SA
        </p>
      </div>
    </div>
  )
}
