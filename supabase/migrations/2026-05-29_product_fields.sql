-- Product module enhancements (run once in Supabase SQL Editor; safe to re-run).
-- product_type : 'shop' (resale goods) | 'service' (materials used for cable work)
-- subcategory  : free-text brand/variant (e.g. TCCL, Airtel)
-- image_url    : public URL of the product photo (Supabase Storage)

alter table products add column if not exists product_type text;
alter table products add column if not exists subcategory text;
alter table products add column if not exists image_url text;

-- IMAGE UPLOADS also need a Storage bucket. In the Supabase dashboard:
--   Storage -> New bucket -> name: product-images -> Public bucket: ON
-- (Public so the <img> tags can load the photos.)
