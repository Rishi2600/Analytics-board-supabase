/**
 * Phase 0 placeholder. The application shell, routing and theming land in phase 2, after
 * the design pass in docs/DESIGN_SYSTEM.md. This screen exists only to prove that the
 * toolchain renders: Tailwind v4, the shadcn token layer, and the "@" path alias.
 */
export default function App() {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-md rounded-md border bg-card p-6 text-card-foreground">
        <h1 className="text-lg font-medium">Analytics</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Foundation only. The dashboard shell, authentication and data arrive in later phases.
        </p>
      </div>
    </main>
  )
}
