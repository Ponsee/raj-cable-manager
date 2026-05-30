-- =====================================================================
-- Auth: signup details + admin approval + roles
-- Run this once in Supabase -> SQL Editor -> New query -> Run.
-- Safe to run more than once.
-- =====================================================================

-- 1. New profile columns -------------------------------------------------
alter table profiles add column if not exists email       text;
alter table profiles add column if not exists phone       text;
alter table profiles add column if not exists status      text not null default 'pending'; -- pending | approved | disabled
alter table profiles add column if not exists approved_at timestamptz;
alter table profiles add column if not exists approved_by uuid references auth.users (id);

-- Role may now be empty until an admin assigns one.
alter table profiles alter column role drop not null;
alter table profiles alter column role drop default;

-- Existing users keep working: treat everyone already here as approved.
update profiles set status = 'approved' where status is null or status = 'pending';

-- 2. Who becomes admin automatically on signup --------------------------
--    >>> To add/remove admins later: edit this list and re-run this block. <<<
create or replace function public.set_profile_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  user_email   text;
  admin_emails text[] := array[
    'ponseelan.11@gmail.com',
    'rajbroadbandsendamaram@gmail.com'
  ];
begin
  -- Pull the verified email from the auth account (not trusting client input).
  select email into user_email from auth.users where id = new.id;
  new.email := coalesce(new.email, user_email);

  if user_email = any (admin_emails) then
    new.role        := 'admin';
    new.status      := 'approved';
    new.approved_at := now();
  else
    new.role   := null;        -- no access until an admin assigns a role
    new.status := 'pending';   -- must be approved before login works
  end if;

  return new;
end;
$$;

drop trigger if exists trg_set_profile_on_signup on profiles;
create trigger trg_set_profile_on_signup
  before insert on profiles
  for each row execute function set_profile_on_signup();

-- 3. Role helper now also requires an APPROVED account ------------------
--    Disabling a user (status != 'approved') instantly cuts off all access.
create or replace function get_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid() and status = 'approved'
$$;

-- 4. Let admins manage other users -------------------------------------
drop policy if exists "Admin update profiles" on profiles;
create policy "Admin update profiles"
  on profiles for update
  using (get_user_role() = 'admin')
  with check (get_user_role() = 'admin');

-- =====================================================================
-- Done. New signups (except the admin emails above) will be 'pending'
-- until an admin approves them on the Users screen and assigns a role.
-- =====================================================================
