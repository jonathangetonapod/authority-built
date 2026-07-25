-- Guest Resources Table
-- Stores educational content, guides, and resources for podcast guests

CREATE TYPE resource_type AS ENUM ('article', 'video', 'download', 'link');
CREATE TYPE resource_category AS ENUM ('preparation', 'technical_setup', 'best_practices', 'promotion', 'examples', 'templates');

CREATE TABLE guest_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  content TEXT, -- Markdown content for articles
  category resource_category NOT NULL,
  type resource_type NOT NULL,

  -- Type-specific fields
  url TEXT, -- For videos (YouTube/Vimeo) or external links
  file_url TEXT, -- For downloadable PDFs/files

  -- Metadata
  featured BOOLEAN DEFAULT false,
  display_order INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Resource Views Table (optional tracking)
CREATE TABLE guest_resource_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID REFERENCES guest_resources(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_guest_resources_category ON guest_resources(category);
CREATE INDEX idx_guest_resources_featured ON guest_resources(featured);
CREATE INDEX idx_guest_resources_order ON guest_resources(display_order);
CREATE INDEX idx_resource_views_resource ON guest_resource_views(resource_id);
CREATE INDEX idx_resource_views_client ON guest_resource_views(client_id);

-- RLS Policies
ALTER TABLE guest_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_resource_views ENABLE ROW LEVEL SECURITY;

-- Admin can do everything with resources
CREATE POLICY "Admins can manage guest resources"
  ON guest_resources
  FOR ALL
  TO authenticated
  USING (auth.jwt() ->> 'email' = 'jonathan@getonapod.com');

-- Clients can view resources
CREATE POLICY "Clients can view guest resources"
  ON guest_resources
  FOR SELECT
  TO authenticated
  USING (true);

-- Anonymous users can also view resources (for public access if needed)
CREATE POLICY "Public can view guest resources"
  ON guest_resources
  FOR SELECT
  TO anon
  USING (true);

-- Admin can view all resource views
CREATE POLICY "Admins can view all resource views"
  ON guest_resource_views
  FOR ALL
  TO authenticated
  USING (auth.jwt() ->> 'email' = 'jonathan@getonapod.com');

-- Clients can create views for themselves
CREATE POLICY "Clients can track their own resource views"
  ON guest_resource_views
  FOR INSERT
  TO authenticated
  WITH CHECK (
    client_id IN (
      SELECT id FROM clients
      WHERE email = auth.jwt()->>'email'
    )
  );

-- Insert some default resources
INSERT INTO guest_resources (title, description, content, category, type, featured, display_order) VALUES
(
  'Podcast Guest Preparation Guide',
  'Everything you need to know before your podcast appearance',
  E'# Podcast Guest Preparation Guide\n\n## Before the Recording\n\n### Research the Show\n- Listen to 3-5 recent episodes\n- Understand the host''s interview style\n- Note the typical episode length and format\n- Review the audience demographics\n\n### Prepare Your Key Messages\n- Identify 3-5 main points you want to communicate\n- Prepare relevant stories and examples\n- Think about actionable takeaways for listeners\n- Have your bio and intro ready\n\n### Technical Preparation\n- Test your microphone and audio quality\n- Ensure stable internet connection\n- Choose a quiet recording space\n- Have backup equipment ready\n\n### Day Before Checklist\n- Confirm recording time and timezone\n- Review show notes or questions if provided\n- Get plenty of rest\n- Prepare water and any notes\n\n## During the Recording\n\n### Best Practices\n- Speak clearly and at a moderate pace\n- Use stories and examples to illustrate points\n- Be authentic and conversational\n- Listen actively to the host\n- Don''t be afraid of pauses\n\n### Things to Avoid\n- Over-promoting yourself or products\n- Speaking too fast or rambling\n- Interrupting the host\n- Using too much jargon\n- Looking at your phone\n\n## After the Recording\n\n### Follow Up\n- Send a thank you email to the host\n- Share any promised resources or links\n- Ask when the episode will be published\n- Request the episode link for promotion\n\n### Promotion Planning\n- Prepare social media posts\n- Create audiograms or clips\n- Notify your email list\n- Engage with comments when published',
  'preparation',
  'article',
  true,
  1
),
(
  'Audio Setup for Podcast Guests',
  'How to sound professional on any podcast',
  E'# Audio Setup Guide\n\n## Essential Equipment\n\n### Microphone Options\n**Budget-Friendly ($50-100)**\n- USB microphones like Blue Yeti or Audio-Technica ATR2100x\n- Easy setup, good quality\n- Perfect for remote recordings\n\n**Professional ($200+)**\n- XLR microphones like Shure SM7B\n- Requires audio interface\n- Studio-quality sound\n\n### Headphones\n- Use closed-back headphones to prevent audio bleed\n- Avoid earbuds if possible\n- Wired is more reliable than Bluetooth\n\n## Recording Environment\n\n### Room Setup\n- Choose a small room with soft furnishings\n- Close windows and doors\n- Turn off fans, AC, and refrigerators\n- Add blankets or foam for sound dampening\n\n### Microphone Position\n- Place 6-8 inches from your mouth\n- Slightly off to the side to avoid plosives\n- Use a pop filter if available\n- Keep consistent distance throughout\n\n## Software & Connection\n\n### Platform Preparation\n- Download Zoom, Riverside.fm, or required software\n- Test connection before the call\n- Close unnecessary programs\n- Use ethernet cable if possible\n\n### Audio Settings\n- Turn off automatic gain control\n- Disable noise suppression (let host handle it)\n- Set input level to -12dB to -6dB\n- Do a sound check 5-10 minutes early\n\n## Quick Troubleshooting\n- Echo? Use headphones\n- Background noise? Close windows, turn off fans\n- Quiet audio? Move closer to mic\n- Distorted audio? Lower input gain\n- Connection issues? Switch to phone hotspot',
  'technical_setup',
  'article',
  true,
  2
),
(
  'How to Promote Your Podcast Appearance',
  'Maximize the impact of your episode after it goes live',
  E'# Promotion Strategy for Your Podcast Episode\n\n## Pre-Launch (1 Week Before)\n\n### Create Assets\n- Request episode artwork from the podcast\n- Create custom social media graphics\n- Pull 2-3 quote graphics from your conversation\n- Make short video clips or audiograms\n\n### Notify Your Network\n- Email your list with a teaser\n- Warm up your social media audience\n- Reach out to partners who might share\n- Prepare blog post or article tie-in\n\n## Launch Day\n\n### Social Media Blitz\n- Post on all your active platforms\n- Tag the host and podcast accounts\n- Use relevant hashtags\n- Post at optimal times (9am, 12pm, 6pm)\n\n### Email Announcement\n- Send dedicated email to your list\n- Include key takeaways from the episode\n- Add direct links to listen\n- Include call-to-action\n\n## Week After Launch\n\n### Extended Promotion\n- Share different clips throughout the week\n- Respond to all comments and engagement\n- Include link in your email signature\n- Add to your website/press page\n\n### Repurpose Content\n- Write blog post based on conversation\n- Create LinkedIn article with insights\n- Pull quotes for Twitter/Instagram\n- Make YouTube short clips\n\n## Long-Term Strategy\n\n### Evergreen Promotion\n- Add to your media page\n- Include in speaker one-sheets\n- Reference in future content\n- Use as social proof in marketing\n\n### Build Relationships\n- Stay connected with the host\n- Engage with their future content\n- Look for collaboration opportunities\n- Refer guests to them\n\n## Engagement Tips\n\n### Drive Action\n- Ask listeners to leave reviews\n- Encourage sharing the episode\n- Offer free resource related to topic\n- Track traffic and conversions\n\n### Measure Success\n- Monitor download numbers (if shared)\n- Track website traffic spikes\n- Count social media engagement\n- Measure email list growth\n- Note sales or inquiry increases',
  'promotion',
  'article',
  true,
  3
),
(
  'Common Mistakes to Avoid',
  'Learn from these frequent podcast guest pitfalls',
  E'# Common Podcast Guest Mistakes\n\n## Before Recording\n\n### Mistake: Not Researching the Show\n**Why it''s bad:** You might share content that doesn''t fit the audience\n**Solution:** Listen to 3-5 episodes before appearing\n\n### Mistake: Over-Preparing a Script\n**Why it''s bad:** You''ll sound robotic and unnatural\n**Solution:** Prepare bullet points and key stories, not word-for-word scripts\n\n### Mistake: Not Testing Tech\n**Why it''s bad:** Technical issues waste time and frustrate everyone\n**Solution:** Do a test recording 24 hours before\n\n## During Recording\n\n### Mistake: Selling Too Hard\n**Why it''s bad:** Listeners tune out promotional content\n**Solution:** Focus on providing value; mentions will come naturally\n\n### Mistake: One-Word Answers\n**Why it''s bad:** Makes the host work harder and creates awkward silences\n**Solution:** Elaborate with examples and stories\n\n### Mistake: Rambling Without Direction\n**Why it''s bad:** Loses listener interest and makes editing difficult\n**Solution:** Make your point, add example, then pause\n\n### Mistake: Interrupting the Host\n**Why it''s bad:** Disrupts flow and seems disrespectful\n**Solution:** Wait for complete pauses before speaking\n\n### Mistake: Using Too Much Jargon\n**Why it''s bad:** Alienates general audience\n**Solution:** Explain concepts as if talking to a friend\n\n### Mistake: Being Too Modest\n**Why it''s bad:** Listeners won''t understand your expertise\n**Solution:** Share wins and credentials confidently but authentically\n\n## After Recording\n\n### Mistake: Not Following Up\n**Why it''s bad:** Missed relationship-building opportunity\n**Solution:** Send thank you email with any promised resources\n\n### Mistake: Weak Promotion\n**Why it''s bad:** Episode reaches limited audience\n**Solution:** Promote multiple times across all channels\n\n### Mistake: Self-Promotion Only\n**Why it''s bad:** Appears self-serving\n**Solution:** Highlight value for listeners, not just yourself\n\n## Communication Errors\n\n### Mistake: No-Shows or Late Arrivals\n**Why it''s bad:** Extremely unprofessional and burns bridges\n**Solution:** Set multiple reminders and arrive 5-10 minutes early\n\n### Mistake: Not Reading Prep Materials\n**Why it''s bad:** Shows lack of respect for host''s time\n**Solution:** Review any pre-show notes or questions sent\n\n### Mistake: Being Difficult to Schedule\n**Why it''s bad:** Host may move on to other guests\n**Solution:** Respond quickly and offer multiple time options\n\n## Remember\n\nThe best podcast guests are:\n- Prepared but flexible\n- Professional but personable\n- Confident but humble\n- Knowledgeable but accessible\n- Promotional but valuable',
  'best_practices',
  'article',
  false,
  4
),
(
  'Podcast Guest Bio Template',
  'A template to help you craft the perfect guest bio',
  E'# Guest Bio Template\n\nUse this template to create a compelling bio for podcast introductions:\n\n---\n\n## Short Bio (50 words)\n[Your Name] is a [Title/Role] who [main achievement or expertise]. [He/She/They] [what you do] and has [impressive credential]. [Your Name] [one interesting fact or unique angle].\n\n**Example:**\nJohn Smith is a digital marketing strategist who has helped over 100 SaaS companies scale to 7-figures. He founded GrowthLab in 2015 and has been featured in Forbes and Entrepreneur. John is also a stand-up comedian who uses humor to make marketing fun.\n\n---\n\n## Medium Bio (100 words)\n[Your Name] is a [Title/Role] specializing in [specific area]. With [X years] of experience, [he/she/they] [main achievement].\n\n[Second paragraph: education, credentials, notable clients, or media appearances]\n\n[Third paragraph: personal touch - where you live, hobbies, or interesting fact]\n\n**Example:**\nJohn Smith is a digital marketing strategist specializing in SaaS growth and content marketing. With 12 years of experience, he has helped over 100 companies scale from startup to 7-figure ARR.\n\nJohn founded GrowthLab in 2015 and has worked with clients like Zoom, Slack, and HubSpot. He has been featured in Forbes, Entrepreneur, and Fast Company, and speaks regularly at marketing conferences.\n\nWhen he''s not helping companies grow, John performs stand-up comedy in San Francisco and hosts a podcast about the intersection of humor and marketing.\n\n---\n\n## Long Bio (200 words)\n[Start with an attention-grabbing opening line about your unique angle or biggest achievement]\n\n[Paragraph 2: Your background and expertise]\n\n[Paragraph 3: Major accomplishments, clients, or results]\n\n[Paragraph 4: Media appearances, publications, speaking]\n\n[Paragraph 5: Personal information and contact/social media]\n\n---\n\n## What to Include\n\n✅ **DO Include:**\n- Current title and company\n- Main area of expertise\n- Impressive credentials or results\n- Notable clients or companies\n- Media appearances\n- Books or major publications\n- Unique angle or personality trait\n- Where you''re based\n- How to connect (website, social)\n\n❌ **DON''T Include:**\n- Excessive credentials that aren''t relevant\n- Generic statements without proof\n- Too much personal information\n- Long history of every job\n- Overly promotional language\n- Jargon or buzzwords\n\n---\n\n## Tips for a Great Bio\n\n1. **Lead with your unique angle** - What makes you different?\n2. **Use specific numbers** - "Helped 100 companies" beats "Helped many companies"\n3. **Show personality** - Let your voice come through\n4. **Update regularly** - Keep credentials current\n5. **Tailor to the show** - Emphasize relevant expertise\n6. **End with contact info** - Make it easy to connect\n\n---\n\n## Action Steps\n\n1. Write all three versions (short, medium, long)\n2. Ask a friend to review for clarity\n3. Save in a document for easy copy/paste\n4. Update every 6 months\n5. Send appropriate version based on podcast request',
  'templates',
  'article',
  false,
  5
);
