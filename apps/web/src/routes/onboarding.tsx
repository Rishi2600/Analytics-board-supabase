import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { z } from 'zod'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCreateOrganization, useOrganizations } from '@/features/orgs/api'
import { useCreateProject } from '@/features/projects/api'
import { browserTimeZone, supportedTimeZones } from '@/lib/tz'

const schema = z.object({
  orgName: z.string().trim().min(1, 'Give your organization a name').max(80),
  projectName: z.string().trim().min(1, 'Give your project a name').max(80),
  timezone: z.string().min(1),
})

type FormValues = z.infer<typeof schema>

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

/**
 * First run. Creates an organization and its first project in one screen.
 *
 * Two forms would be more "correct" and worse: nobody has an opinion about an organization
 * separate from the thing they came here to measure. Asking once and explaining the
 * distinction inline gets people to data faster.
 */
export function OnboardingRoute() {
  const navigate = useNavigate()
  const organizations = useOrganizations()
  const createOrganization = useCreateOrganization()
  const createProject = useCreateProject()
  const [failure, setFailure] = useState<string | null>(null)

  const existingOrg = organizations.data?.[0]

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      orgName: '',
      projectName: '',
      timezone: browserTimeZone(),
    },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    setFailure(null)
    try {
      const orgId =
        existingOrg?.id ?? (await createOrganization.mutateAsync({ name: values.orgName }))

      const project = await createProject.mutateAsync({
        orgId,
        name: values.projectName,
        slug: slugify(values.projectName) || 'web',
        timezone: values.timezone,
      })

      await navigate(`/p/${project.id}/settings?tab=install`, { replace: true })
    } catch (error) {
      setFailure(errorMessage(error))
    }
  })

  const timeZones = supportedTimeZones()
  // useWatch rather than form.watch(): watch() returns a fresh function each render,
  // which the React Compiler cannot memoize and therefore skips the whole component.
  const selectedTimeZone = useWatch({ control: form.control, name: 'timezone' })

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-md">
        <h1 className="text-lg font-medium">
          {existingOrg ? 'Create a project' : 'Set up your workspace'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {existingOrg
            ? 'A project is one app or site. Events and API keys belong to a project.'
            : 'An organization holds your team and billing. A project is one app or site.'}
        </p>

        <form
          onSubmit={(event) => {
            void onSubmit(event)
          }}
          className="mt-6 space-y-4 rounded-md border bg-card p-5"
          noValidate
        >
          {existingOrg ? null : (
            <div>
              <Label htmlFor="orgName">Organization name</Label>
              <Input
                id="orgName"
                className="mt-1.5"
                placeholder="Acme"
                aria-invalid={Boolean(form.formState.errors.orgName)}
                {...form.register('orgName')}
              />
              {form.formState.errors.orgName ? (
                <p className="mt-1.5 text-xs text-destructive">
                  {form.formState.errors.orgName.message}
                </p>
              ) : null}
            </div>
          )}

          <div>
            <Label htmlFor="projectName">Project name</Label>
            <Input
              id="projectName"
              className="mt-1.5"
              placeholder="Web app"
              aria-invalid={Boolean(form.formState.errors.projectName)}
              {...form.register('projectName')}
            />
            {form.formState.errors.projectName ? (
              <p className="mt-1.5 text-xs text-destructive">
                {form.formState.errors.projectName.message}
              </p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="timezone">Reporting timezone</Label>
            <Select
              value={selectedTimeZone}
              onValueChange={(value) => {
                form.setValue('timezone', value)
              }}
            >
              <SelectTrigger id="timezone" className="mt-1.5 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {timeZones.map((zone) => (
                  <SelectItem key={zone} value={zone}>
                    {zone}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Days and weeks are cut in this timezone. You can change it later, and history is
              recalculated rather than rewritten.
            </p>
          </div>

          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Creating' : 'Create project'}
          </Button>

          {failure ? (
            <p className="text-xs text-destructive" role="alert">
              {failure}
            </p>
          ) : null}
        </form>
      </div>
    </main>
  )
}
