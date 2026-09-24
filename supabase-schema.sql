-- AL AZEEM TRADERS — Supabase database schema
-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor → New query → paste → Run)

create table if not exists admins (
  id bigint generated always as identity primary key,
  username text unique not null,
  password_hash text not null,
  created_at timestamptz default now()
);

create table if not exists customers (
  id bigint generated always as identity primary key,
  name text not null,
  phone text unique not null,
  password_hash text not null,
  address text default '',
  created_at timestamptz default now()
);

create table if not exists products (
  id bigint generated always as identity primary key,
  name text not null,
  category text not null,
  unit text not null,
  cost_price numeric default 0,
  retail_price numeric not null,
  wholesale_price numeric not null,
  stock_qty numeric not null default 0,
  low_stock_threshold numeric not null default 5,
  image_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists orders (
  id bigint generated always as identity primary key,
  customer_id bigint references customers(id),
  customer_name text,
  items jsonb not null default '[]',
  total numeric not null default 0,
  payment_method text not null,
  payment_status text not null default 'pending',
  order_status text not null default 'placed',
  delivery_address text default '',
  razorpay_order_id text,
  created_at timestamptz default now()
);

-- Helpful indexes
create index if not exists idx_products_category on products (category);
create index if not exists idx_orders_customer on orders (customer_id);
