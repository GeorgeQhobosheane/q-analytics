-- Migration: add Stripe billing columns to profiles
-- Applies: subscription tier, status, and Stripe customer ID

alter table public.profiles
  add column if not exists stripe_customer_id  text unique,
  add column if not exists subscription_tier   text not null default 'free'
    check (subscription_tier in ('free', 'starter', 'pro')),
  add column if not exists subscription_status text not null default 'inactive'
    check (subscription_status in ('inactive', 'active', 'past_due', 'canceled'));

-- Index for webhook lookups by stripe_customer_id
create index if not exists profiles_stripe_customer_id_idx
  on public.profiles (stripe_customer_id)
  where stripe_customer_id is not null;

-- RLS: users can read their own billing info; only service role can write
-- (profiles table already has row-level security enabled from earlier migration)
-- Note: CREATE POLICY IF NOT EXISTS is not valid PostgreSQL — use DROP + CREATE
drop policy if exists "Users can read own subscription" on public.profiles;
create policy "Users can read own subscription"
  on public.profiles
  for select
  using (auth.uid() = id);

-- Note: UPDATE is handled server-side via service role key in the Stripe webhook
-- handler, so no user-facing UPDATE policy is needed for these fields.
