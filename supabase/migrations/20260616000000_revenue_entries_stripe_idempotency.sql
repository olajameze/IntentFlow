-- Idempotent Stripe sync into revenue_entries (business_id + Stripe txn id).
create unique index if not exists revenue_entries_business_stripe_tx_uidx
  on public.revenue_entries (business_id, source_transaction_id)
  where source_transaction_id is not null;
