-- =====================================================================
-- Subscriptions: Stripe / Mollie subscription support for FluentFlow.
-- Tracks student subscriptions, active status, recurring revenue (MRR)
-- and billing periods. Idempotent: safe to re-run.
-- =====================================================================

create table if not exists public.subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users (id) on delete cascade,
  provider             text not null default 'stripe',       -- 'stripe' | 'mollie'
  customer_id          text,                                -- Stripe cus_... or Mollie cst_...
  subscription_id      text,                                -- Stripe sub_... or Mollie sub_...
  plan                 text not null default 'monthly',     -- 'monthly' | 'yearly' | 'lifetime'
  status               text not null default 'active',      -- 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete'
  amount_cents         int not null default 0,              -- e.g. 2900 for 29.00 EUR
  currency             text not null default 'eur',         -- 'eur' | 'usd'
  current_period_start timestamptz,
  current_period_end   timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists subscriptions_user_idx on public.subscriptions (user_id);
create index if not exists subscriptions_status_idx on public.subscriptions (status);
create index if not exists subscriptions_created_idx on public.subscriptions (created_at desc);

-- Automatic updated_at trigger
drop trigger if exists subscriptions_touch_updated_at on public.subscriptions;
create trigger subscriptions_touch_updated_at
  before update on public.subscriptions
  for each row execute function public.touch_updated_at();

-- The browser never reads it directly: only the server with service_role
alter table public.subscriptions enable row level security;
revoke all on table public.subscriptions from anon, authenticated;
grant select, insert, update, delete on table public.subscriptions to service_role;
