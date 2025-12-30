import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import {
  ArrowRight,
  ArrowLeft,
  User,
  Briefcase,
  Target,
  Sparkles,
  CheckCircle2,
  Upload,
  Mail,
  Calendar,
  Sheet,
  Key,
  ExternalLink,
  Loader2
} from 'lucide-react'
import { toast } from 'sonner'

interface OnboardingData {
  // Basic Information
  name: string
  title: string
  company: string
  website: string
  bio: string

  // Expertise
  expertise: string[]

  // Media & Story
  previousPodcasts: string
  compellingStory: string
  uniqueJourney: string

  // Topics & Passion
  topicsConfident: string[]
  passions: string

  // Social & Contact
  socialFollowers: string
  email: string

  // Value Proposition
  audienceValue: string
  impact: string
  personalStories: string
  hobbies: string

  // Target & Goals
  idealAudience: string
  goals: string[]
  specificPodcasts: string

  // Key Messages
  keyMessages: string[]
  specificAngles: string
  futureVision: string

  // Logistics
  availability: string
  calendarLink: string
  additionalInfo: string

  // Headshot
  headshotFile: File | null
}

const initialData: OnboardingData = {
  name: '',
  title: '',
  company: '',
  website: '',
  bio: '',
  expertise: [],
  previousPodcasts: '',
  compellingStory: '',
  uniqueJourney: '',
  topicsConfident: [],
  passions: '',
  socialFollowers: '',
  email: '',
  audienceValue: '',
  impact: '',
  personalStories: '',
  hobbies: '',
  idealAudience: '',
  goals: [],
  specificPodcasts: '',
  keyMessages: [],
  specificAngles: '',
  futureVision: '',
  availability: '',
  calendarLink: '',
  additionalInfo: '',
  headshotFile: null
}

const expertiseOptions = [
  'Copywriting', 'Marketing', 'Psychology', 'Advertising Strategy',
  'Communications', 'Marketing Funnels', 'Growth', 'PR (public relations)',
  'Sales', 'Branding', 'Social Media', 'SEO', 'Content Marketing'
]

const topicOptions = [
  'Marketing', 'Copywriting', 'PR', 'Psychology', 'Advertising',
  'Strategic Communication', 'Branding', 'Lead Generation', 'Sales Process',
  'Conversion Rate Optimization', 'Entrepreneurship', 'Startups'
]

const goalOptions = [
  'Brand Awareness', 'Client Acquisition', 'Promotion', 'Thought Leadership',
  'Network Building', 'Product Launch', 'Authority Building'
]

export default function Onboarding() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [data, setData] = useState<OnboardingData>(initialData)
  const [loading, setLoading] = useState(false)
  const [accountCreated, setAccountCreated] = useState(false)
  const [accountDetails, setAccountDetails] = useState<any>(null)

  const totalSteps = 6
  const progress = (step / totalSteps) * 100

  const updateData = (field: keyof OnboardingData, value: any) => {
    setData(prev => ({ ...prev, [field]: value }))
  }

  const toggleArrayItem = (field: keyof OnboardingData, item: string) => {
    const currentArray = data[field] as string[]
    if (currentArray.includes(item)) {
      updateData(field, currentArray.filter(i => i !== item))
    } else {
      updateData(field, [...currentArray, item])
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('File size must be less than 5MB')
        return
      }
      updateData('headshotFile', file)
      toast.success('Headshot uploaded!')
    }
  }

  const validateStep = () => {
    switch (step) {
      case 1:
        if (!data.name || !data.email || !data.company) {
          toast.error('Please fill in all required fields')
          return false
        }
        // Validate email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(data.email)) {
          toast.error('Please enter a valid email address')
          return false
        }
        break
      case 2:
        if (!data.bio || data.expertise.length === 0) {
          toast.error('Please complete your professional profile')
          return false
        }
        break
      case 3:
        if (!data.compellingStory || !data.uniqueJourney) {
          toast.error('Please share your story')
          return false
        }
        break
      case 4:
        if (data.topicsConfident.length === 0 || !data.passions) {
          toast.error('Please tell us about your expertise and passions')
          return false
        }
        break
      case 5:
        if (!data.idealAudience || data.goals.length === 0) {
          toast.error('Please define your target and goals')
          return false
        }
        break
    }
    return true
  }

  const nextStep = () => {
    if (validateStep()) {
      setStep(prev => Math.min(prev + 1, totalSteps))
    }
  }

  const prevStep = () => {
    setStep(prev => Math.max(prev - 1, 1))
  }

  const handleSubmit = async () => {
    if (!validateStep()) return

    setLoading(true)

    try {
      // Generate AI bio from all the onboarding information
      toast.info('Generating your professional bio...')

      const bioResponse = await fetch(
        'https://ysjwveqnwjysldpfqzov.supabase.co/functions/v1/generate-client-bio',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: data.name,
            title: data.title,
            company: data.company,
            bio: data.bio,
            expertise: data.expertise,
            compellingStory: data.compellingStory,
            uniqueJourney: data.uniqueJourney,
            topicsConfident: data.topicsConfident,
            passions: data.passions,
            audienceValue: data.audienceValue,
            personalStories: data.personalStories,
            hobbies: data.hobbies,
            futureVision: data.futureVision,
            specificAngles: data.specificAngles,
            idealAudience: data.idealAudience,
            goals: data.goals,
            socialFollowers: data.socialFollowers,
            previousPodcasts: data.previousPodcasts,
          }),
        }
      )

      if (!bioResponse.ok) {
        console.error('Bio generation failed, using original bio')
      }

      const bioData = await bioResponse.json()
      const generatedBio = bioData.bio || data.bio

      // Store additional context in notes
      const detailedNotes = `=== ONBOARDING INFORMATION ===

Goals: ${data.goals.join(', ')}
Ideal Audience: ${data.idealAudience}
Social Followers: ${data.socialFollowers}
Previous Podcasts: ${data.previousPodcasts || 'None'}
Specific Podcasts: ${data.specificPodcasts || 'N/A'}
Availability: ${data.availability}

=== DETAILED RESPONSES ===

Expertise: ${data.expertise.join(', ')}

Compelling Story:
${data.compellingStory}

What Makes Them Unique:
${data.uniqueJourney}

Topics Confident Speaking About: ${data.topicsConfident.join(', ')}

Passions:
${data.passions}

${data.audienceValue ? `Value to Audiences:\n${data.audienceValue}\n` : ''}
${data.personalStories ? `Personal Stories:\n${data.personalStories}\n` : ''}
${data.hobbies ? `Hobbies:\n${data.hobbies}\n` : ''}
${data.futureVision ? `Future Vision:\n${data.futureVision}\n` : ''}
${data.specificAngles ? `Specific Angles:\n${data.specificAngles}\n` : ''}
${data.additionalInfo ? `Additional Info:\n${data.additionalInfo}` : ''}`

      // Create client account via API
      toast.info('Creating your account...')

      const response = await fetch(
        'https://ysjwveqnwjysldpfqzov.supabase.co/functions/v1/create-client-account',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: data.name,
            email: data.email,
            bio: generatedBio,
            linkedin_url: data.linkedin_url || undefined,
            website: data.website,
            calendar_link: data.calendarLink || undefined,
            contact_person: data.name,
            notes: detailedNotes,
            status: 'active',
            enable_portal_access: true,
            send_invitation_email: true,
            create_google_sheet: true,
          }),
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create account')
      }

      const result = await response.json()
      setAccountDetails(result.client)
      setAccountCreated(true)
      toast.success('Your account has been created!')

      // TODO: Upload headshot if provided
      // This would require a separate endpoint or storage bucket access

    } catch (error) {
      console.error('Onboarding error:', error)
      toast.error(error instanceof Error ? error.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (accountCreated && accountDetails) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 py-12 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 dark:bg-green-900/20 rounded-full mb-4">
              <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
            </div>
            <h1 className="text-4xl font-bold mb-2">Welcome to Get On A Pod! 🎉</h1>
            <p className="text-xl text-muted-foreground">
              Your account is ready. Here's everything you need to get started.
            </p>
          </div>

          <div className="space-y-6">
            {/* Portal Access */}
            <Card className="border-2 border-purple-200 dark:border-purple-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5 text-purple-600" />
                  Your Portal Access
                </CardTitle>
                <CardDescription>
                  Access your bookings, outreach list, and track your podcast journey
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Portal URL</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Input value={accountDetails.portal_url} readOnly className="font-mono text-sm" />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(accountDetails.portal_url, '_blank')}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Email</Label>
                  <Input value={accountDetails.email} readOnly className="mt-1" />
                </div>
                <div className="bg-purple-50 dark:bg-purple-950/20 p-4 rounded-lg">
                  <p className="text-sm font-medium mb-2">✉️ Check your inbox!</p>
                  <p className="text-sm text-muted-foreground">
                    We've sent you an email with a magic login link. Click it to access your portal instantly.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Google Sheet */}
            {accountDetails.google_sheet_url && (
              <Card className="border-2 border-green-200 dark:border-green-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sheet className="h-5 w-5 text-green-600" />
                    Your Outreach Tracker
                  </CardTitle>
                  <CardDescription>
                    Track all podcast outreach and opportunities in one place
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Input
                      value={accountDetails.google_sheet_url}
                      readOnly
                      className="font-mono text-sm"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(accountDetails.google_sheet_url, '_blank')}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground mt-3">
                    We'll populate this sheet with podcast opportunities tailored to your expertise
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Next Steps */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-yellow-600" />
                  What Happens Next?
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-4">
                  <li className="flex items-start gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 font-bold flex-shrink-0">
                      1
                    </div>
                    <div>
                      <p className="font-medium">We Review Your Profile</p>
                      <p className="text-sm text-muted-foreground">
                        Our team will review your information and identify the best podcast opportunities for you
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 font-bold flex-shrink-0">
                      2
                    </div>
                    <div>
                      <p className="font-medium">We Start Outreach</p>
                      <p className="text-sm text-muted-foreground">
                        We'll pitch you to relevant podcasts and track all opportunities in your Google Sheet
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 font-bold flex-shrink-0">
                      3
                    </div>
                    <div>
                      <p className="font-medium">You Get Booked</p>
                      <p className="text-sm text-muted-foreground">
                        Track all your bookings, recording dates, and published episodes in your portal
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 font-bold flex-shrink-0">
                      4
                    </div>
                    <div>
                      <p className="font-medium">Build Your Authority</p>
                      <p className="text-sm text-muted-foreground">
                        Grow your brand, reach new audiences, and establish yourself as a thought leader
                      </p>
                    </div>
                  </li>
                </ol>
              </CardContent>
            </Card>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                className="flex-1"
                size="lg"
                onClick={() => window.open(accountDetails.portal_url, '_blank')}
              >
                <ExternalLink className="mr-2 h-5 w-5" />
                Access Your Portal
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                size="lg"
                onClick={() => navigate('/')}
              >
                Back to Home
              </Button>
            </div>

            {/* Contact Info */}
            <Card className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20 border-purple-200 dark:border-purple-800">
              <CardContent className="pt-6">
                <p className="text-center text-sm text-muted-foreground">
                  Questions? Email us at{' '}
                  <a href="mailto:jonathan@getonapod.com" className="text-purple-600 dark:text-purple-400 hover:underline font-medium">
                    jonathan@getonapod.com
                  </a>
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2">Get On A Pod</h1>
          <p className="text-xl text-muted-foreground">Let's get you on amazing podcasts</p>
        </div>

        {/* Progress */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Step {step} of {totalSteps}</span>
            <span className="text-sm text-muted-foreground">{Math.round(progress)}% Complete</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Form Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {step === 1 && <><User className="h-5 w-5" /> Basic Information</>}
              {step === 2 && <><Briefcase className="h-5 w-5" /> Professional Profile</>}
              {step === 3 && <><Sparkles className="h-5 w-5" /> Your Story</>}
              {step === 4 && <><Target className="h-5 w-5" /> Expertise & Topics</>}
              {step === 5 && <><Target className="h-5 w-5" /> Goals & Audience</>}
              {step === 6 && <><Calendar className="h-5 w-5" /> Final Details</>}
            </CardTitle>
            <CardDescription>
              {step === 1 && 'Tell us about yourself and your company'}
              {step === 2 && 'Share your professional background and expertise'}
              {step === 3 && 'What makes your journey unique and compelling?'}
              {step === 4 && 'What topics are you passionate about discussing?'}
              {step === 5 && 'Who do you want to reach and what are your goals?'}
              {step === 6 && 'A few more details to complete your profile'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Step 1: Basic Information */}
            {step === 1 && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 sm:col-span-1">
                    <Label htmlFor="name">Full Name *</Label>
                    <Input
                      id="name"
                      placeholder="John Doe"
                      value={data.name}
                      onChange={(e) => updateData('name', e.target.value)}
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <Label htmlFor="title">Title/Role</Label>
                    <Input
                      id="title"
                      placeholder="CEO, Founder, CMO"
                      value={data.title}
                      onChange={(e) => updateData('title', e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="email">Email Address *</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@company.com"
                    value={data.email}
                    onChange={(e) => updateData('email', e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="company">Company/Organization Name *</Label>
                  <Input
                    id="company"
                    placeholder="Your Company Inc."
                    value={data.company}
                    onChange={(e) => updateData('company', e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="website">Website URL</Label>
                  <Input
                    id="website"
                    type="url"
                    placeholder="https://yourcompany.com"
                    value={data.website}
                    onChange={(e) => updateData('website', e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="socialFollowers">Social Media Following</Label>
                  <Input
                    id="socialFollowers"
                    placeholder="e.g., 5,000 across platforms"
                    value={data.socialFollowers}
                    onChange={(e) => updateData('socialFollowers', e.target.value)}
                  />
                </div>
              </>
            )}

            {/* Step 2: Professional Profile */}
            {step === 2 && (
              <>
                <div>
                  <Label htmlFor="bio">Professional Bio *</Label>
                  <Textarea
                    id="bio"
                    placeholder="Tell us about your professional background, key accomplishments, and what you do..."
                    rows={6}
                    value={data.bio}
                    onChange={(e) => updateData('bio', e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    This will be used to pitch you to podcasts
                  </p>
                </div>

                <div>
                  <Label>Areas of Expertise * (select all that apply)</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {expertiseOptions.map((option) => (
                      <Badge
                        key={option}
                        variant={data.expertise.includes(option) ? 'default' : 'outline'}
                        className="cursor-pointer"
                        onClick={() => toggleArrayItem('expertise', option)}
                      >
                        {option}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <Label htmlFor="linkedin_url">LinkedIn Profile URL</Label>
                  <Input
                    id="linkedin_url"
                    type="url"
                    placeholder="https://linkedin.com/in/yourname"
                    value={data.linkedin_url}
                    onChange={(e) => updateData('linkedin_url', e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="previousPodcasts">Previous Podcast/Media Appearances</Label>
                  <Textarea
                    id="previousPodcasts"
                    placeholder="List any podcasts or media outlets you've been featured on (or write 'None')"
                    rows={3}
                    value={data.previousPodcasts}
                    onChange={(e) => updateData('previousPodcasts', e.target.value)}
                  />
                </div>
              </>
            )}

            {/* Step 3: Your Story */}
            {step === 3 && (
              <>
                <div>
                  <Label htmlFor="compellingStory">Share a Compelling Story *</Label>
                  <Textarea
                    id="compellingStory"
                    placeholder="Share a compelling story from your personal or professional life that would engage a podcast audience..."
                    rows={6}
                    value={data.compellingStory}
                    onChange={(e) => updateData('compellingStory', e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="uniqueJourney">What Makes You Unique? *</Label>
                  <Textarea
                    id="uniqueJourney"
                    placeholder="What makes your journey or experience different from others in your industry?"
                    rows={5}
                    value={data.uniqueJourney}
                    onChange={(e) => updateData('uniqueJourney', e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="personalStories">Additional Personal Stories</Label>
                  <Textarea
                    id="personalStories"
                    placeholder="Any other personal stories or experiences you're open to sharing?"
                    rows={4}
                    value={data.personalStories}
                    onChange={(e) => updateData('personalStories', e.target.value)}
                  />
                </div>
              </>
            )}

            {/* Step 4: Expertise & Topics */}
            {step === 4 && (
              <>
                <div>
                  <Label>Topics You're Confident Speaking About * (select all that apply)</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {topicOptions.map((option) => (
                      <Badge
                        key={option}
                        variant={data.topicsConfident.includes(option) ? 'default' : 'outline'}
                        className="cursor-pointer"
                        onClick={() => toggleArrayItem('topicsConfident', option)}
                      >
                        {option}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <Label htmlFor="passions">What Are You Most Passionate About? *</Label>
                  <Textarea
                    id="passions"
                    placeholder="What drives you in your personal or professional life?"
                    rows={4}
                    value={data.passions}
                    onChange={(e) => updateData('passions', e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="hobbies">Hobbies or Interests Outside of Work</Label>
                  <Textarea
                    id="hobbies"
                    placeholder="What do you enjoy discussing outside of your professional work?"
                    rows={3}
                    value={data.hobbies}
                    onChange={(e) => updateData('hobbies', e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="audienceValue">Value You Provide to Audiences</Label>
                  <Textarea
                    id="audienceValue"
                    placeholder="How can your experience and insights provide value to a podcast audience?"
                    rows={4}
                    value={data.audienceValue}
                    onChange={(e) => updateData('audienceValue', e.target.value)}
                  />
                </div>
              </>
            )}

            {/* Step 5: Goals & Audience */}
            {step === 5 && (
              <>
                <div>
                  <Label htmlFor="idealAudience">Your Ideal Audience *</Label>
                  <Textarea
                    id="idealAudience"
                    placeholder="Who is your ideal audience or customer base?"
                    rows={3}
                    value={data.idealAudience}
                    onChange={(e) => updateData('idealAudience', e.target.value)}
                  />
                </div>

                <div>
                  <Label>Your Goals for Getting on Podcasts * (select all that apply)</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {goalOptions.map((option) => (
                      <Badge
                        key={option}
                        variant={data.goals.includes(option) ? 'default' : 'outline'}
                        className="cursor-pointer"
                        onClick={() => toggleArrayItem('goals', option)}
                      >
                        {option}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <Label htmlFor="impact">Impact You Want to Make</Label>
                  <Textarea
                    id="impact"
                    placeholder="What impact can you make by sharing your story on podcasts?"
                    rows={4}
                    value={data.impact}
                    onChange={(e) => updateData('impact', e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="specificPodcasts">Specific Podcasts You're Interested In</Label>
                  <Textarea
                    id="specificPodcasts"
                    placeholder="Are there any specific podcasts you'd like to be a guest on?"
                    rows={3}
                    value={data.specificPodcasts}
                    onChange={(e) => updateData('specificPodcasts', e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="specificAngles">Specific Angles or Insights</Label>
                  <Textarea
                    id="specificAngles"
                    placeholder="Any specific angles or insights you'd like to share that would be valuable to audiences?"
                    rows={4}
                    value={data.specificAngles}
                    onChange={(e) => updateData('specificAngles', e.target.value)}
                  />
                </div>
              </>
            )}

            {/* Step 6: Final Details */}
            {step === 6 && (
              <>
                <div>
                  <Label htmlFor="futureVision">Future Vision</Label>
                  <Textarea
                    id="futureVision"
                    placeholder="How do you see your work evolving in the next few years?"
                    rows={4}
                    value={data.futureVision}
                    onChange={(e) => updateData('futureVision', e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="availability">Recording Availability</Label>
                  <Input
                    id="availability"
                    placeholder="e.g., Weekdays after 10am EST"
                    value={data.availability}
                    onChange={(e) => updateData('availability', e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="calendarLink">Calendar Link (Calendly, etc.)</Label>
                  <Input
                    id="calendarLink"
                    type="url"
                    placeholder="https://calendly.com/yourname"
                    value={data.calendarLink}
                    onChange={(e) => updateData('calendarLink', e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="headshot">Professional Headshot</Label>
                  <div className="mt-2">
                    <Input
                      id="headshot"
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="cursor-pointer"
                    />
                    {data.headshotFile && (
                      <p className="text-sm text-green-600 dark:text-green-400 mt-2 flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4" />
                        {data.headshotFile.name}
                      </p>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Upload a professional photo (max 5MB)
                  </p>
                </div>

                <div>
                  <Label htmlFor="additionalInfo">Anything Else We Should Know?</Label>
                  <Textarea
                    id="additionalInfo"
                    placeholder="Any additional information that would help us pitch you effectively..."
                    rows={4}
                    value={data.additionalInfo}
                    onChange={(e) => updateData('additionalInfo', e.target.value)}
                  />
                </div>
              </>
            )}

            {/* Navigation Buttons */}
            <div className="flex justify-between pt-6">
              <Button
                variant="outline"
                onClick={prevStep}
                disabled={step === 1 || loading}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>

              {step < totalSteps ? (
                <Button onClick={nextStep} disabled={loading}>
                  Next
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Button onClick={handleSubmit} disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating Your Account...
                    </>
                  ) : (
                    <>
                      Complete Setup
                      <CheckCircle2 className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
