import { zodResolver } from '@hookform/resolvers/zod'
import { CircleAlert } from 'lucide-react'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { z } from 'zod'
import { TimezonePicker } from '@/components/data/timezone-picker'
import { AuthLayout } from '@/components/layout/auth-layout'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { useAuth } from '@/features/auth/use-auth'
import { useCreateOrganization, useOrganizations } from '@/features/orgs/api'
import { useCreateProject } from '@/features/projects/api'
import { errorMessage } from '@/lib/errors'
import { browserTimeZone } from '@/lib/tz'

const schema = z.object({
  orgName: z.string().trim().max(80),
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
 * First run: an organization and its first project on one screen. Nobody has an opinion about
 * an organization separate from the thing they came to measure, so it is asked once, inline.
 */
export function OnboardingRoute() {
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const organizations = useOrganizations()
  const createOrganization = useCreateOrganization()
  const createProject = useCreateProject()
  const [failure, setFailure] = useState<string | null>(null)

  const existingOrg = organizations.data?.[0]
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { orgName: '', projectName: '', timezone: browserTimeZone() },
  })
  // useWatch rather than form.watch(): watch() returns a fresh function each render, which the
  // React Compiler cannot memoize.
  const timezone = useWatch({ control: form.control, name: 'timezone' })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    setFailure(null)
    if (!existingOrg && values.orgName.length === 0) {
      form.setError('orgName', { message: 'Give your organization a name' })
      return
    }
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

  return (
    <AuthLayout
      title={existingOrg ? 'Create a project' : 'Set up your workspace'}
      description={
        existingOrg
          ? 'A project is one app or site. Its events and API keys belong to it.'
          : 'An organization holds your team. A project is one app or site inside it.'
      }
    >
      <Card>
        <CardContent>
          <form
            onSubmit={(event) => {
              void onSubmit(event)
            }}
            noValidate
          >
            <FieldGroup>
              {existingOrg ? null : (
                <Field data-invalid={errors.orgName ? true : undefined}>
                  <FieldLabel htmlFor="orgName">Organization name</FieldLabel>
                  <Input
                    id="orgName"
                    placeholder="Acme"
                    autoComplete="organization"
                    aria-invalid={errors.orgName ? true : undefined}
                    {...form.register('orgName')}
                  />
                  {errors.orgName ? <FieldError>{errors.orgName.message}</FieldError> : null}
                </Field>
              )}

              <Field data-invalid={errors.projectName ? true : undefined}>
                <FieldLabel htmlFor="projectName">Project name</FieldLabel>
                <Input
                  id="projectName"
                  placeholder="Web app"
                  aria-invalid={errors.projectName ? true : undefined}
                  {...form.register('projectName')}
                />
                {errors.projectName ? <FieldError>{errors.projectName.message}</FieldError> : null}
              </Field>

              <Field>
                <FieldLabel htmlFor="timezone">Reporting timezone</FieldLabel>
                <TimezonePicker
                  id="timezone"
                  value={timezone}
                  onChange={(value) => {
                    form.setValue('timezone', value)
                  }}
                  aria-describedby="timezone-help"
                />
                <FieldDescription id="timezone-help">
                  Days and weeks are cut in this timezone. You can change it later, and history is
                  recalculated rather than rewritten.
                </FieldDescription>
              </Field>

              {failure ? (
                <Alert variant="destructive">
                  <CircleAlert />
                  <AlertTitle>The project was not created</AlertTitle>
                  <AlertDescription>{failure}</AlertDescription>
                </Alert>
              ) : null}

              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
                {isSubmitting ? 'Creating project' : 'Create project'}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      <p className="text-center text-sm text-muted-foreground">
        Signed in as <span className="wrap-anywhere text-foreground">{user?.email}</span>.{' '}
        <Button
          variant="link"
          className="h-auto p-0"
          onClick={() => {
            void signOut().then(() => navigate('/sign-in', { replace: true }))
          }}
        >
          Sign out
        </Button>
      </p>
    </AuthLayout>
  )
}
