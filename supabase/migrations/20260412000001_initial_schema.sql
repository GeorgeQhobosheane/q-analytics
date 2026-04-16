-- ============================================================
-- Q Analytics — Initial Schema
-- Migration: 20260412000001_initial_schema
-- ============================================================

-- Enable UUID extension (already enabled in Supabase by default)
create extension if not exists "uuid-ossp";

-- ============================================================
-- 1. PROFILES
-- ============================================================
create table public.profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  agency_name         text not null,
  contact_email       text not null,
  subscription_tier   text not null default 'free'
    check (subscription_tier in ('free', 'starter', 'pro', 'enterprise')),
  subscription_status text not null default 'active'
    check (subscription_status in ('active', 'trialing', 'past_due', 'canceled', 'unpaid')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: owner read"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles: owner update"
  on public.profiles for update
  using (auth.uid() = id);

create policy "profiles: owner insert"
  on public.profiles for insert
  with check (auth.uid() = id);

create index idx_profiles_created_at on public.profiles(created_at);

-- ============================================================
-- 2. AGENCY_PROFILES
-- ============================================================
create table public.agency_profiles (
  id               uuid primary key default uuid_generate_v4(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  agency_type      text,
  address          text,
  city             text,
  state            text,
  zip              text,
  population       integer,
  department_focus text,
  current_projects text,
  contact_name     text,
  contact_title    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.agency_profiles enable row level security;

create policy "agency_profiles: owner all"
  on public.agency_profiles for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index idx_agency_profiles_user_id    on public.agency_profiles(user_id);
create index idx_agency_profiles_created_at on public.agency_profiles(created_at);

-- ============================================================
-- 3. DOCUMENTS
-- ============================================================
create table public.documents (
  id          uuid primary key default uuid_generate_v4(),
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  file_name   text not null,
  file_path   text not null,
  file_size   bigint not null,
  created_at  timestamptz not null default now()
);

alter table public.documents enable row level security;

create policy "documents: owner all"
  on public.documents for all
  using (auth.uid() = uploaded_by)
  with check (auth.uid() = uploaded_by);

create index idx_documents_uploaded_by on public.documents(uploaded_by);
create index idx_documents_created_at  on public.documents(created_at);

-- ============================================================
-- 4. CONVERSATIONS
-- ============================================================
create table public.conversations (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  document_id uuid references public.documents(id) on delete set null,
  question    text not null,
  answer      text,
  created_at  timestamptz not null default now()
);

alter table public.conversations enable row level security;

create policy "conversations: owner all"
  on public.conversations for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index idx_conversations_user_id    on public.conversations(user_id);
create index idx_conversations_created_at on public.conversations(created_at);

-- ============================================================
-- 5. DIGESTS
-- ============================================================
create table public.digests (
  id              uuid primary key default uuid_generate_v4(),
  title           text not null,
  summary_text    text,
  source_url      text,
  regulation_type text,
  published_date  date,
  created_at      timestamptz not null default now()
);

-- Shared reference data — all authenticated users may read
alter table public.digests enable row level security;

create policy "digests: authenticated read"
  on public.digests for select
  using (auth.role() = 'authenticated');

create index idx_digests_published_date on public.digests(published_date);
create index idx_digests_created_at     on public.digests(created_at);

-- ============================================================
-- 6. GRANT_MATCHES
-- ============================================================
create table public.grant_matches (
  id             uuid primary key default uuid_generate_v4(),
  agency_id      uuid not null references public.profiles(id) on delete cascade,
  grant_title    text not null,
  amount_min     numeric(14,2),
  amount_max     numeric(14,2),
  deadline       date,
  match_score    numeric(5,2),
  qualify_reason text,
  action_items   text,
  source_url     text,
  status         text not null default 'new'
    check (status in ('new', 'saved', 'applied', 'awarded', 'declined')),
  created_at     timestamptz not null default now()
);

alter table public.grant_matches enable row level security;

create policy "grant_matches: owner all"
  on public.grant_matches for all
  using (auth.uid() = agency_id)
  with check (auth.uid() = agency_id);

create index idx_grant_matches_agency_id  on public.grant_matches(agency_id);
create index idx_grant_matches_created_at on public.grant_matches(created_at);

-- ============================================================
-- 7. GRANT_PROPOSALS
-- ============================================================
create table public.grant_proposals (
  id            uuid primary key default uuid_generate_v4(),
  agency_id     uuid not null references public.profiles(id) on delete cascade,
  grant_id      uuid references public.grant_matches(id) on delete set null,
  draft_content text,
  status        text not null default 'draft'
    check (status in ('draft', 'review', 'submitted', 'awarded', 'rejected')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.grant_proposals enable row level security;

create policy "grant_proposals: owner all"
  on public.grant_proposals for all
  using (auth.uid() = agency_id)
  with check (auth.uid() = agency_id);

create index idx_grant_proposals_agency_id  on public.grant_proposals(agency_id);
create index idx_grant_proposals_created_at on public.grant_proposals(created_at);

-- ============================================================
-- 8. COMPLIANCE_ITEMS
-- ============================================================
create table public.compliance_items (
  id               uuid primary key default uuid_generate_v4(),
  agency_id        uuid not null references public.profiles(id) on delete cascade,
  regulation_title text not null,
  action_required  text,
  deadline         date,
  urgency          text check (urgency in ('low', 'medium', 'high', 'critical')),
  status           text not null default 'pending'
    check (status in ('pending', 'complete', 'overdue')),
  source_url       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.compliance_items enable row level security;

create policy "compliance_items: owner all"
  on public.compliance_items for all
  using (auth.uid() = agency_id)
  with check (auth.uid() = agency_id);

create index idx_compliance_items_agency_id  on public.compliance_items(agency_id);
create index idx_compliance_items_created_at on public.compliance_items(created_at);
create index idx_compliance_items_deadline   on public.compliance_items(deadline);

-- ============================================================
-- 9. NOTIFICATIONS
-- ============================================================
create table public.notifications (
  id         uuid primary key default uuid_generate_v4(),
  agency_id  uuid not null references public.profiles(id) on delete cascade,
  type       text not null,
  title      text not null,
  message    text,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;

create policy "notifications: owner all"
  on public.notifications for all
  using (auth.uid() = agency_id)
  with check (auth.uid() = agency_id);

create index idx_notifications_agency_id  on public.notifications(agency_id);
create index idx_notifications_created_at on public.notifications(created_at);
create index idx_notifications_read       on public.notifications(read);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger trg_agency_profiles_updated_at
  before update on public.agency_profiles
  for each row execute function public.set_updated_at();

create trigger trg_grant_proposals_updated_at
  before update on public.grant_proposals
  for each row execute function public.set_updated_at();

create trigger trg_compliance_items_updated_at
  before update on public.compliance_items
  for each row execute function public.set_updated_at();
