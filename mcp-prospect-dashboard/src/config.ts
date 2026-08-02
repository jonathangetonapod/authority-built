import * as dotenv from 'dotenv';

dotenv.config();

export const config = {
  supabase: {
    url: process.env.SUPABASE_URL!,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!
  },
  app: {
    url: process.env.APP_URL || 'https://getonapod.com'
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY!
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY!
  }
};

// Validate required env vars
const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY'];
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}
