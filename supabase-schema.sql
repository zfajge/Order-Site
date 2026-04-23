-- Run this SQL in Supabase SQL Editor.
-- It creates the shared inventory table used by this app.

create table if not exists public.moveout_items (
  id text primary key,
  name text not null,
  price numeric not null check (price >= 0),
  description text not null,
  main_image text not null default '',
  extra_images jsonb not null default '[]'::jsonb,
  status text not null default 'available' check (status in ('available', 'hold', 'bought')),
  owner_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_moveout_items_updated_at on public.moveout_items (updated_at desc);

create or replace function public.set_moveout_items_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_moveout_items_updated_at on public.moveout_items;
create trigger trg_moveout_items_updated_at
before update on public.moveout_items
for each row
execute function public.set_moveout_items_updated_at();
