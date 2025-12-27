#!/bin/bash

# Quick deployment script for AI Sales Director
# Run this after setting up your Supabase project

set -e

echo "🚀 Deploying AI Sales Director..."

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Install it with: npm install -g supabase"
    exit 1
fi

# Check if linked to a project
if [ ! -f ".supabase/config.toml" ]; then
    echo "❌ Not linked to a Supabase project."
    echo "Run: supabase link --project-ref YOUR_PROJECT_REF"
    exit 1
fi

# Prompt for API keys
echo ""
echo "📝 Please provide your API keys:"
read -p "Fathom API Key: " FATHOM_KEY
read -p "Anthropic API Key: " ANTHROPIC_KEY

echo ""
echo "🔐 Setting secrets..."
supabase secrets set \
  FATHOM_API_KEY="$FATHOM_KEY" \
  ANTHROPIC_API_KEY="$ANTHROPIC_KEY"

echo ""
echo "⚡ Deploying edge functions..."
supabase functions deploy sync-fathom-calls
supabase functions deploy classify-sales-call
supabase functions deploy analyze-sales-call

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Run the database migrations in Supabase Dashboard → SQL Editor"
echo "2. Copy frontend files to your React app"
echo "3. Navigate to /admin/ai-sales-director"
echo ""
echo "See SETUP_GUIDE.md for detailed instructions."
