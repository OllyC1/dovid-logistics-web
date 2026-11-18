drop index if exists public.payment_intents_idempotency_idx;
create unique index payment_intents_idempotency_idx on public.payment_intents(idempotency_key)
where idempotency_key is not null
  and status in ('pending','processing','paid','partially_refunded','refunded');

create table public.payment_checkout_sessions (
  payment_intent_id uuid primary key references public.payment_intents(id) on delete cascade,
  provider text not null default 'paystack' check (provider = 'paystack'),
  status text not null check (status in ('initializing','ready','failed')),
  authorization_url text,
  expires_at timestamptz not null,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_checkout_sessions_ready_url check (
    status <> 'ready' or authorization_url is not null
  )
);

alter table public.payment_checkout_sessions enable row level security;
create policy payment_checkout_sessions_client_deny on public.payment_checkout_sessions
for all to anon,authenticated using (false) with check (false);

revoke all on table public.payment_checkout_sessions from public,anon,authenticated;
grant all on table public.payment_checkout_sessions to service_role;

comment on table public.payment_checkout_sessions is
'Server-only Paystack hosted checkout state used to make initialization retries idempotent. Authorization URLs must never be exposed through browser database roles.';
