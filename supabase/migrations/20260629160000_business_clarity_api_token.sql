-- Per-business Clarity Data Export API tokens (AES-256-GCM, same vault as Stripe keys).

alter table public.businesses
  add column if not exists clarity_api_token_ciphertext text,
  add column if not exists clarity_api_token_iv text,
  add column if not exists clarity_api_token_tag text;

comment on column public.businesses.clarity_api_token_ciphertext is
  'Encrypted Clarity Data Export JWT for this project (Settings → Data Export).';
