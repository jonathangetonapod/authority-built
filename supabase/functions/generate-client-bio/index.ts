import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface OnboardingData {
  name: string
  title?: string
  company: string
  bio: string
  expertise: string[]
  compellingStory: string
  uniqueJourney: string
  topicsConfident: string[]
  passions: string
  audienceValue: string
  personalStories?: string
  hobbies?: string
  futureVision?: string
  specificAngles?: string
  idealAudience: string
  goals: string[]
  socialFollowers?: string
  previousPodcasts?: string
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const data: OnboardingData = await req.json()

    // Validation
    if (!data.name || !data.bio || !data.compellingStory) {
      return new Response(
        JSON.stringify({ error: 'Required fields missing' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicApiKey) {
      console.error('[Generate Bio] ANTHROPIC_API_KEY not configured')
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Build comprehensive context
    const context = `
Name: ${data.name}${data.title ? `, ${data.title}` : ''}
Company: ${data.company}

Professional Background:
${data.bio}

Areas of Expertise: ${data.expertise.join(', ')}

Compelling Story:
${data.compellingStory}

What Makes Them Unique:
${data.uniqueJourney}

Topics They Speak About: ${data.topicsConfident.join(', ')}

Passions: ${data.passions}

${data.audienceValue ? `Value They Provide: ${data.audienceValue}` : ''}

${data.personalStories ? `Additional Stories: ${data.personalStories}` : ''}

${data.hobbies ? `Hobbies/Interests: ${data.hobbies}` : ''}

${data.futureVision ? `Future Vision: ${data.futureVision}` : ''}

${data.specificAngles ? `Specific Angles: ${data.specificAngles}` : ''}

Ideal Audience: ${data.idealAudience}

Goals: ${data.goals.join(', ')}

${data.socialFollowers ? `Social Following: ${data.socialFollowers}` : ''}

${data.previousPodcasts ? `Previous Media: ${data.previousPodcasts}` : ''}
    `.trim()

    const prompt = `You are a professional podcast booking agent creating a compelling guest bio for pitching to podcast hosts.

Based on the following information about a potential podcast guest, write a compelling, professional bio that will make podcast hosts excited to book them. The bio should:

1. Start with a strong hook that captures their unique story or achievement
2. Highlight their expertise and credibility
3. Showcase what makes them different/unique in their field
4. Emphasize the value they bring to audiences
5. Include specific accomplishments or results
6. Be conversational yet professional
7. Be 3-4 paragraphs long
8. Focus on what makes them an AMAZING podcast guest

Guest Information:
${context}

Write a bio that will get them booked on top podcasts. Make it compelling, authentic, and focused on their strengths.`

    console.log('[Generate Bio] Calling Claude API')
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1000,
        temperature: 0.7,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Generate Bio] Claude API error:', response.status, errorText)
      return new Response(
        JSON.stringify({
          error: 'Failed to generate bio',
          details: `API returned ${response.status}`,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const apiData = await response.json()
    const generatedBio = apiData.content[0].text

    console.log(`[Generate Bio] Bio generated for ${data.name}`)

    return new Response(
      JSON.stringify({
        success: true,
        bio: generatedBio,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[Generate Bio] Error:', error)

    return new Response(
      JSON.stringify({
        error: error.message || 'Internal server error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
