-- ── Auto-create profile row on signup ────────────────────────────────────────
-- Runs as SECURITY DEFINER (superuser privileges) so it bypasses RLS.
-- Triggered after every new row in auth.users, whether email is confirmed or not.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, agency_name, contact_email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'agency_name', 'My Agency'),
    new.email
  )
  on conflict (id) do nothing;   -- safe to run multiple times
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
