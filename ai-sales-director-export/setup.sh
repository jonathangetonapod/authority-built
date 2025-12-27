#!/bin/bash

# AI Sales Director - Automated Setup Script
# This script will guide you through the entire setup process

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                                                           ║"
echo "║         AI SALES DIRECTOR - AUTOMATED SETUP               ║"
echo "║                                                           ║"
echo "║  This script will set up everything you need:             ║"
echo "║  • Database tables                                        ║"
echo "║  • Edge functions                                         ║"
echo "║  • API keys configuration                                 ║"
echo "║                                                           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""

# Check if supabase CLI is installed
echo -e "${YELLOW}Checking prerequisites...${NC}"
if ! command -v supabase &> /dev/null; then
    echo -e "${RED}❌ Supabase CLI not found.${NC}"
    echo ""
    echo "Please install it first:"
    echo "  npm install -g supabase"
    echo ""
    echo "Or with Homebrew:"
    echo "  brew install supabase/tap/supabase"
    echo ""
    exit 1
fi
echo -e "${GREEN}✅ Supabase CLI found${NC}"
echo ""

# Login to Supabase
echo -e "${YELLOW}Step 1: Login to Supabase${NC}"
echo "This will open a browser window for authentication..."
echo ""
read -p "Press Enter to continue..."
supabase login
echo -e "${GREEN}✅ Logged in successfully${NC}"
echo ""

# Get project reference
echo -e "${YELLOW}Step 2: Link to your Supabase project${NC}"
echo ""
echo "You'll need your project reference ID."
echo "Find it at: https://supabase.com/dashboard → Select your project → Settings → General"
echo ""
read -p "Enter your Supabase project reference ID: " PROJECT_REF

if [ -z "$PROJECT_REF" ]; then
    echo -e "${RED}❌ Project reference is required${NC}"
    exit 1
fi

echo ""
echo "Linking to project: $PROJECT_REF"
supabase link --project-ref "$PROJECT_REF"
echo -e "${GREEN}✅ Linked to project${NC}"
echo ""

# Run migrations
echo -e "${YELLOW}Step 3: Creating database tables${NC}"
echo "This will create all necessary tables for the AI Sales Director..."
echo ""

# Check if we have migrations directory
if [ ! -d "migrations" ]; then
    echo -e "${RED}❌ Migrations directory not found${NC}"
    echo "Make sure you're running this from the ai-sales-director-export directory"
    exit 1
fi

# Combine all migrations into one file
echo "Preparing migrations..."
cat migrations/20250126_sales_calls.sql \
    migrations/20250126_add_call_type.sql \
    migrations/20250126_add_hidden_to_sales_calls.sql \
    migrations/20250127_corey_jackson_framework.sql > combined_migration.sql

echo ""
echo -e "${BLUE}To create the database tables, follow these steps:${NC}"
echo ""
echo "1. Open this URL in your browser:"
echo -e "   ${GREEN}https://supabase.com/dashboard/project/$PROJECT_REF/sql/new${NC}"
echo ""
echo "2. Copy ALL the SQL from this file:"
echo -e "   ${GREEN}$(pwd)/combined_migration.sql${NC}"
echo ""
echo "3. Paste it into the SQL Editor and click 'Run'"
echo ""
echo -e "${YELLOW}Tip: The file is already open and ready to copy!${NC}"
echo ""

# Try to open the file in default editor for easy copying
if [[ "$OSTYPE" == "darwin"* ]]; then
    open combined_migration.sql 2>/dev/null || true
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    xdg-open combined_migration.sql 2>/dev/null || true
fi

read -p "Press Enter once you've run the SQL in Supabase Dashboard..."

# Clean up combined migration
rm combined_migration.sql

echo -e "${GREEN}✅ Database tables created${NC}"
echo ""

# Get API keys
echo -e "${YELLOW}Step 4: Configure API keys${NC}"
echo ""
echo "You'll need two API keys:"
echo ""

# Fathom API Key
echo -e "${BLUE}📹 Fathom API Key${NC}"
echo "Get it from: https://app.fathom.video/settings"
echo "Navigate to: Settings → API → Generate API Key"
echo ""
read -p "Enter your Fathom API Key: " FATHOM_KEY

if [ -z "$FATHOM_KEY" ]; then
    echo -e "${RED}❌ Fathom API key is required${NC}"
    exit 1
fi
echo ""

# Anthropic API Key
echo -e "${BLUE}🤖 Anthropic API Key${NC}"
echo "Get it from: https://console.anthropic.com/settings/keys"
echo "Click: Create Key"
echo ""
read -p "Enter your Anthropic API Key: " ANTHROPIC_KEY

if [ -z "$ANTHROPIC_KEY" ]; then
    echo -e "${RED}❌ Anthropic API key is required${NC}"
    exit 1
fi
echo ""

echo "Setting secrets in Supabase..."
supabase secrets set \
  FATHOM_API_KEY="$FATHOM_KEY" \
  ANTHROPIC_API_KEY="$ANTHROPIC_KEY"

echo -e "${GREEN}✅ API keys configured${NC}"
echo ""

# Deploy edge functions
echo -e "${YELLOW}Step 5: Deploying edge functions${NC}"
echo "This will deploy 3 functions: sync, classify, and analyze..."
echo ""

# Check if functions directory exists
if [ ! -d "functions" ]; then
    echo -e "${RED}❌ Functions directory not found${NC}"
    echo "Make sure you're running this from the ai-sales-director-export directory"
    exit 1
fi

echo "Deploying sync-fathom-calls..."
supabase functions deploy sync-fathom-calls --project-ref "$PROJECT_REF"

echo "Deploying classify-sales-call..."
supabase functions deploy classify-sales-call --project-ref "$PROJECT_REF"

echo "Deploying analyze-sales-call..."
supabase functions deploy analyze-sales-call --project-ref "$PROJECT_REF"

echo -e "${GREEN}✅ Edge functions deployed${NC}"
echo ""

# Summary
echo -e "${GREEN}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                                                           ║"
echo "║                 ✅ SETUP COMPLETE!                        ║"
echo "║                                                           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""
echo -e "${BLUE}What was set up:${NC}"
echo "  ✅ Database tables (sales_calls, sales_call_analysis)"
echo "  ✅ Edge functions (sync, classify, analyze)"
echo "  ✅ API keys (Fathom, Anthropic)"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo ""
echo "1. ${YELLOW}Copy frontend files to your React app:${NC}"
echo "   • frontend/pages/admin/AISalesDirector.tsx → Your app"
echo "   • frontend/services/salesCalls.ts → Your app"
echo ""
echo "2. ${YELLOW}Install dependencies:${NC}"
echo "   npm install recharts @tanstack/react-query"
echo ""
echo "3. ${YELLOW}Add route to your app:${NC}"
echo "   <Route path=\"/admin/ai-sales-director\" element={<AISalesDirector />} />"
echo ""
echo "4. ${YELLOW}Set environment variables:${NC}"
echo "   VITE_SUPABASE_URL=https://$PROJECT_REF.supabase.co"
echo "   VITE_SUPABASE_ANON_KEY=[your-anon-key]"
echo ""
echo "5. ${YELLOW}Build and deploy your app${NC}"
echo ""
echo -e "${GREEN}Once deployed, navigate to /admin/ai-sales-director${NC}"
echo ""
echo -e "${BLUE}Need help?${NC} Check SETUP_GUIDE.md for detailed instructions"
echo ""
echo -e "${YELLOW}API Costs (approximate):${NC}"
echo "  • Classification: ~\$0.001 per call"
echo "  • Analysis: ~\$0.05-0.15 per call"
echo "  • Monthly (100 calls, 50 analyzed): ~\$3-8"
echo ""
echo "Happy analyzing! 🚀"
echo ""
