-- Fix infinite recursion in profiles RLS policy
-- Run this ENTIRE script in Supabase SQL Editor

-- Why this fails:
-- A policy on `profiles` that does `select ... from profiles where id = auth.uid()`
-- recursively evaluates itself and can trigger Postgres error 42P17.
--
-- Solution:
-- Move those lookups to SECURITY DEFINER helpers and reference those helpers in policies.

-- Step 1: helper to fetch current user's company without recursive RLS checks
CREATE OR REPLACE FUNCTION public.current_user_company_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT company_id
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;
$$;

-- Step 2: helper to check owner status for a target company
CREATE OR REPLACE FUNCTION public.is_company_owner(target_company_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND company_id = target_company_id
      AND role = 'owner'
  );
$$;

REVOKE ALL ON FUNCTION public.current_user_company_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_company_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_company_owner(uuid) TO authenticated;

-- Step 3: replace policies on profiles with non-recursive checks
DROP POLICY IF EXISTS "Users can view profiles in their company" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Owners can insert new members" ON profiles;
DROP POLICY IF EXISTS "Owners can delete members" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view company profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view company member profiles" ON profiles;

CREATE POLICY "Users can view profiles in their company"
  ON profiles FOR SELECT
  USING (company_id = public.current_user_company_id());

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Owners can insert new members"
  ON profiles FOR INSERT
  WITH CHECK (public.is_company_owner(company_id));

CREATE POLICY "Owners can delete members"
  ON profiles FOR DELETE
  USING (public.is_company_owner(company_id) AND id <> auth.uid());

-- Step 4 (recommended): make related table policies non-recursive too
DROP POLICY IF EXISTS "Users can view their company" ON companies;
DROP POLICY IF EXISTS "Owners can update company" ON companies;
DROP POLICY IF EXISTS "Users can view their company subscription" ON subscriptions;
DROP POLICY IF EXISTS "Owners can manage subscriptions" ON subscriptions;

CREATE POLICY "Users can view their company"
  ON companies FOR SELECT
  USING (id = public.current_user_company_id());

CREATE POLICY "Owners can update company"
  ON companies FOR UPDATE
  USING (public.is_company_owner(id));

CREATE POLICY "Users can view their company subscription"
  ON subscriptions FOR SELECT
  USING (company_id = public.current_user_company_id());

CREATE POLICY "Owners can manage subscriptions"
  ON subscriptions FOR ALL
  USING (public.is_company_owner(company_id))
  WITH CHECK (public.is_company_owner(company_id));

-- Step 5: verify policies
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename IN ('profiles', 'companies', 'subscriptions')
ORDER BY tablename, policyname;
