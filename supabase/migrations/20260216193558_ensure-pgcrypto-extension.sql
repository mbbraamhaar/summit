-- Ensure pgcrypto exists for invite token hashing
create extension if not exists pgcrypto with schema extensions;