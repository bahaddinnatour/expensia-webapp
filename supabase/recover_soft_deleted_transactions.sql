-- Use only to recover transactions that were unexpectedly hidden by an old
-- web sync. Replace the email before running this in the Supabase SQL Editor.
-- This also restores intentionally deleted transactions, so review them in
-- the app afterward and delete any that should remain removed.
update public.finance_records
set deleted_at = null,
    updated_at = now()
where user_id = (
  select id from auth.users where email = 'YOUR_EMAIL_ADDRESS'
)
  and record_type = 'transaction'
  and deleted_at is not null;
