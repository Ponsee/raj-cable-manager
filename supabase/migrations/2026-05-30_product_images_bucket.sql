-- 2026-05-30: product photo storage — bucket + access policies.
-- Run this in the Supabase SQL Editor. It's safe to re-run.

-- 1) Create the public bucket the app uploads to (no-op if it already exists).
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

-- 2) Access policies on storage.objects for this bucket.
--    (drop-then-create so this file is safe to run again)

-- Logged-in users can upload photos.
drop policy if exists "auth upload product-images" on storage.objects;
create policy "auth upload product-images"
on storage.objects for insert to authenticated
with check (bucket_id = 'product-images');

-- Logged-in users can replace photos.
drop policy if exists "auth update product-images" on storage.objects;
create policy "auth update product-images"
on storage.objects for update to authenticated
using (bucket_id = 'product-images');

-- Logged-in users can delete photos.
drop policy if exists "auth delete product-images" on storage.objects;
create policy "auth delete product-images"
on storage.objects for delete to authenticated
using (bucket_id = 'product-images');

-- Anyone can view photos (public bucket).
drop policy if exists "public read product-images" on storage.objects;
create policy "public read product-images"
on storage.objects for select to public
using (bucket_id = 'product-images');
