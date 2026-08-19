# GrowthOS Complete MVP
Frontend + Cloudflare Worker API + Gemini integration + Supabase starter schema.

## Deploy
1. Create Cloudflare account.
2. Install Wrangler: npm install -g wrangler
3. cd worker && wrangler login
4. wrangler secret put GEMINI_API_KEY
5. wrangler deploy

## Supabase
Run supabase/schema.sql in Supabase SQL Editor.

## Production work remaining
Authentication, usage limits, payment checkout/webhooks, customer dashboard, agency workspaces, referrals, email automation and SEO pages must be connected before production. Use only verified accounts and legitimate payment information.
