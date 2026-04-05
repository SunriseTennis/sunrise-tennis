/**
 * Onboarding layout — renders children directly without the parent NavWrapper.
 * The wizard is a full-screen experience; the bottom nav is not needed here.
 */
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
