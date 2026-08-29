-- Run once in the Supabase SQL Editor before syncing the Loans feature.
-- This only expands the allowed record types; it does not change existing data.
alter table public.finance_records
  drop constraint if exists finance_records_record_type_check;

alter table public.finance_records
  add constraint finance_records_record_type_check
  check (record_type in ('profile', 'category', 'portfolio', 'transaction', 'plan', 'loan'));
