#!/bin/bash

# Export AI Sales Director for easy setup
# This script packages all necessary files into a single directory

set -e

echo "🚀 Exporting AI Sales Director..."

# Create export directory
EXPORT_DIR="ai-sales-director-export"
rm -rf "$EXPORT_DIR"
mkdir -p "$EXPORT_DIR"

echo "📁 Creating directory structure..."

# Create subdirectories
mkdir -p "$EXPORT_DIR/migrations"
mkdir -p "$EXPORT_DIR/functions/sync-fathom-calls"
mkdir -p "$EXPORT_DIR/functions/classify-sales-call"
mkdir -p "$EXPORT_DIR/functions/analyze-sales-call"
mkdir -p "$EXPORT_DIR/frontend/pages/admin"
mkdir -p "$EXPORT_DIR/frontend/services"

echo "📋 Copying database migrations..."

# Copy migrations
cp supabase/migrations/20250126_sales_calls.sql "$EXPORT_DIR/migrations/"
cp supabase/migrations/20250126_add_call_type.sql "$EXPORT_DIR/migrations/"
cp supabase/migrations/20250126_add_hidden_to_sales_calls.sql "$EXPORT_DIR/migrations/"
cp supabase/migrations/20250127_corey_jackson_framework.sql "$EXPORT_DIR/migrations/"

echo "⚡ Copying edge functions..."

# Copy edge functions
cp supabase/functions/sync-fathom-calls/index.ts "$EXPORT_DIR/functions/sync-fathom-calls/"
cp supabase/functions/classify-sales-call/index.ts "$EXPORT_DIR/functions/classify-sales-call/"
cp supabase/functions/analyze-sales-call/index.ts "$EXPORT_DIR/functions/analyze-sales-call/"

echo "🎨 Copying frontend files..."

# Copy frontend files
cp src/pages/admin/AISalesDirector.tsx "$EXPORT_DIR/frontend/pages/admin/"
cp src/services/salesCalls.ts "$EXPORT_DIR/frontend/services/"

echo "📄 Copying setup guide..."

# Copy setup guide
cp AI_SALES_DIRECTOR_SETUP.md "$EXPORT_DIR/SETUP_GUIDE.md"

echo "📦 Creating deployment scripts..."

# Create deployment script
cat > "$EXPORT_DIR/deploy.sh" << 'EOF'
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
EOF

chmod +x "$EXPORT_DIR/deploy.sh"

# Create README
cat > "$EXPORT_DIR/README.md" << 'EOF'
# AI Sales Director Export Package

This package contains everything needed to set up the AI Sales Director feature.

## Quick Start

1. **Read the setup guide**: Open `SETUP_GUIDE.md`
2. **Run migrations**: Copy SQL from `migrations/` to Supabase SQL Editor
3. **Deploy functions**: Use `deploy.sh` script or deploy manually
4. **Copy frontend**: Add files from `frontend/` to your React app
5. **Start using**: Navigate to `/admin/ai-sales-director`

## What's Included

```
ai-sales-director-export/
├── SETUP_GUIDE.md              # Complete setup instructions
├── README.md                   # This file
├── deploy.sh                   # Quick deployment script
├── migrations/                 # Database migrations (run in order)
│   ├── 20250126_sales_calls.sql
│   ├── 20250126_add_call_type.sql
│   ├── 20250126_add_hidden_to_sales_calls.sql
│   └── 20250127_corey_jackson_framework.sql
├── functions/                  # Supabase Edge Functions
│   ├── sync-fathom-calls/
│   ├── classify-sales-call/
│   └── analyze-sales-call/
└── frontend/                   # React components
    ├── pages/admin/AISalesDirector.tsx
    └── services/salesCalls.ts
```

## Requirements

- Supabase project
- Fathom API key
- Anthropic API key
- Node.js & npm
- Supabase CLI

## Support

See `SETUP_GUIDE.md` for troubleshooting and detailed instructions.
EOF

echo ""
echo "✅ Export complete!"
echo ""
echo "📦 Package created at: $EXPORT_DIR/"
echo ""
echo "🎁 To share with Jay:"
echo "   1. Zip the folder: zip -r ai-sales-director.zip $EXPORT_DIR/"
echo "   2. Send him the zip file"
echo "   3. He follows SETUP_GUIDE.md inside"
echo ""
echo "Or copy to Desktop:"
echo "   cp -r $EXPORT_DIR ~/Desktop/"
echo ""
