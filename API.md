# Transaction API

Run `supabase_transaction_api.sql` from the Flutter project in the Supabase SQL Editor once. The API uses the signed-in user's Supabase access token, so a caller can only create transactions for its own account.

## Create an outflow

```http
POST https://mmdtntkrxrthkamldawd.supabase.co/rest/v1/rpc/create_outflow
apikey: YOUR_SUPABASE_PUBLISHABLE_KEY
Authorization: Bearer USER_ACCESS_TOKEN
Content-Type: application/json

{
  "p_portfolio_id": "main",
  "p_description": "Grocery shopping",
  "p_category": "Grocery",
  "p_amount": 125.50
}
```

## Create an inflow

Call `rpc/create_inflow` with the same JSON body. Optional `p_created_at` accepts an ISO-8601 timestamp, for example `2026-08-26T12:30:00Z`.

The response is the created transaction. Do not expose a service-role key in a browser, mobile app, or automation. Use the Supabase session access token belonging to the finance account.
