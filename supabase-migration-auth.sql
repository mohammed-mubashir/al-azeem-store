-- AL AZEEM TRADERS — Auth upgrade migration
-- Adds email login, Google sign-in, email verification, and forgot-password support.
-- Run this once in the Supabase SQL Editor (safe to run even if some columns already exist).

alter table customers
  add column if not exists email text,
  add column if not exists email_verified boolean not null default false,
  add column if not exists google_id text,
  add column if not exists reset_token text,
  add column if not exists reset_token_expires timestamptz;

-- phone is no longer required (Google sign-in has no phone number)
alter table customers alter column phone drop not null;

-- password is no longer required (Google-only accounts have no password)
alter table customers alter column password_hash drop not null;

-- email must be unique once set, but multiple NULLs are allowed
create unique index if not exists customers_email_unique on customers (email) where email is not null;
create unique index if not exists customers_google_id_unique on customers (google_id) where google_id is not null;
