-- 2026-05-30: easy-to-remember product code + multiple product images.

-- A short human code like CAB001 / RTR001 (category prefix + running number).
alter table products add column if not exists code text;
create index if not exists idx_products_code on products (code);

-- Up to ~5 image URLs per product (image_url stays as the first/primary one).
alter table products add column if not exists image_urls text[];

-- Seed image_urls from the existing single image for old rows.
update products
  set image_urls = array[image_url]
  where image_url is not null and image_urls is null;
