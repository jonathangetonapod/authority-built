# AI Sales Director Export Package

This package contains everything needed to set up the AI Sales Director feature.

## Quick Start (Automated)

The easiest way to get started:

```bash
./setup.sh
```

This interactive script will:
- ✅ Log you into Supabase
- ✅ Link to your project
- ✅ Create all database tables
- ✅ Configure API keys
- ✅ Deploy edge functions

**Total time: ~10 minutes**

## Manual Setup

If you prefer manual setup:

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
