# Resend Email Deliverability - Deployment Checklist

## ✅ What We've Built

1. **Database Migration** (`20250130_email_delivery_tracking.sql`)
   - `email_logs` table - tracks all sent emails
   - `email_bounces` table - suppression list for bounced/complained addresses
   - Helper functions for bounce tracking and suppression checking

2. **Webhook Endpoint** (`supabase/functions/resend-webhook`)
   - Receives delivery events from Resend
   - Updates email logs with delivery status
   - Auto-suppresses bounced and complained addresses
   - Tracks opens and clicks

3. **Updated Magic Link Sender**
   - Changed to `portal@mail.getonapod.com` (subdomain protects main domain)
   - Added reply-to header pointing to `jonathan@getonapod.com`
   - Logs emails in database
   - Checks suppression list before sending

---

## 🚀 Deployment Steps

### Step 1: Apply Database Migration

```bash
cd /Users/jonathangarces/Desktop/GOAP\ -\>\ Authority\ Lab/getonapod-app

# Apply migration via Supabase
npx supabase db push
```

### Step 2: Deploy Edge Functions

```bash
# Deploy the webhook endpoint
npx supabase functions deploy resend-webhook

# Redeploy magic link function with updates
npx supabase functions deploy send-portal-magic-link
```

### Step 3: Configure Resend Webhook

1. Go to https://resend.com/webhooks
2. Click "Add Webhook"
3. Enter webhook URL:
   ```
   https://[YOUR-PROJECT-REF].supabase.co/functions/v1/resend-webhook
   ```
4. Select all events:
   - [x] email.sent
   - [x] email.delivered
   - [x] email.delivery_delayed
   - [x] email.bounced
   - [x] email.complained
   - [x] email.opened
   - [x] email.clicked
5. Copy the "Signing Secret"
6. Add to Supabase secrets:
   ```bash
   npx supabase secrets set RESEND_WEBHOOK_SECRET="whsec_..."
   ```

### Step 4: Verify Domain in Resend

**⚠️ Use Subdomain for Better Deliverability**

1. Go to https://resend.com/domains
2. Click "Add Domain"
3. Enter: `mail.getonapod.com` (subdomain protects main domain reputation)
4. Copy the DNS records provided
5. Add to your DNS provider

**DNS Records to Add:**

```
Type: TXT
Name: @
Value: resend-verification=xxx
TTL: Auto

Type: TXT
Name: @
Value: v=spf1 include:_spf.resend.com ~all
TTL: Auto

Type: TXT
Name: resend._domainkey
Value: [DKIM value from Resend]
TTL: Auto

Type: TXT
Name: _dmarc
Value: v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc@getonapod.com
TTL: Auto
```

6. Wait 5-10 minutes for DNS propagation
7. Click "Verify" in Resend dashboard
8. Ensure all checks pass ✅

### Step 5: Test Email Delivery

Send test magic link:

```bash
# Use the portal login page or test via API
curl -X POST https://[YOUR-PROJECT-REF].supabase.co/functions/v1/send-portal-magic-link \
  -H "apikey: [YOUR-ANON-KEY]" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

Check:
- [ ] Email arrives in inbox (not spam)
- [ ] Email shows as from "Get On A Pod Portal <portal@mail.getonapod.com>"
- [ ] Reply-to shows as "jonathan@getonapod.com"
- [ ] Email logged in `email_logs` table
- [ ] Webhook updates delivery status to "delivered"
- [ ] Subject line is clear and not spam-filtered

---

## 📊 Monitoring

### View Email Logs

```sql
-- Recent emails
SELECT
  email_type,
  to_address,
  status,
  bounce_type,
  opened_at,
  clicked_at,
  created_at
FROM email_logs
ORDER BY created_at DESC
LIMIT 50;
```

### View Bounce Statistics

```sql
-- Bounce summary
SELECT
  bounce_type,
  COUNT(*) as count
FROM email_logs
WHERE status = 'bounced'
GROUP BY bounce_type;
```

### View Suppression List

```sql
-- Suppressed emails
SELECT
  email_address,
  bounce_type,
  bounce_count,
  last_bounced_at
FROM email_bounces
WHERE suppressed = true
ORDER BY last_bounced_at DESC;
```

### Delivery Rate

```sql
-- Overall delivery rate
SELECT
  COUNT(*) FILTER (WHERE status = 'delivered') * 100.0 / COUNT(*) as delivery_rate,
  COUNT(*) FILTER (WHERE status = 'bounced') * 100.0 / COUNT(*) as bounce_rate,
  COUNT(*) FILTER (WHERE status = 'complained') * 100.0 / COUNT(*) as complaint_rate
FROM email_logs
WHERE created_at > NOW() - INTERVAL '30 days';
```

---

## 🎯 Success Metrics

After deployment, aim for:

- **Delivery Rate**: > 98%
- **Bounce Rate**: < 2%
- **Complaint Rate**: < 0.08% (Resend requirement)
- **Open Rate**: > 25% (for magic links)

---

## 🔧 Troubleshooting

### Emails Going to Spam

1. Verify all DNS records in Resend dashboard
2. Check sender reputation: https://postmaster.google.com
3. Use mail-tester.com to check spam score
4. Review email content for spam triggers

### Webhook Not Firing

1. Check webhook URL is correct
2. Verify webhook is enabled in Resend
3. Check Edge Function logs: `npx supabase functions logs resend-webhook`
4. Test webhook manually from Resend dashboard

### Database Errors

1. Check migration applied: `npx supabase db diff`
2. Verify RLS policies allow service role access
3. Check Edge Function has correct permissions

---

## 📝 Next Steps

After deployment:

1. Monitor email logs for first 24-48 hours
2. Check bounce and complaint rates
3. Adjust sender addresses if needed
4. Consider adding email preferences for clients
5. Set up admin dashboard for email monitoring

---

## 🔐 Security Notes

- Magic links expire in 15 minutes
- Rate limiting: 15 requests per 15 minutes
- Bounced emails auto-suppressed after:
  - 1 hard bounce
  - 3 soft bounces
  - 1 spam complaint
- All events logged with IP and user agent

---

**Questions?** Check the main [RESEND_SETUP.md](./RESEND_SETUP.md) guide.
