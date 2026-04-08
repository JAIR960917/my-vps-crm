
-- Fix storage logos policies: restrict write operations to admins only

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Admins can upload logos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update logos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete logos" ON storage.objects;

-- Recreate with admin role check
CREATE POLICY "Admins can upload logos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'logos' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update logos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'logos' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete logos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'logos' AND has_role(auth.uid(), 'admin'::app_role));

-- Fix gerente role race condition: add unique constraint on user_id
-- This prevents concurrent duplicate inserts at the database level
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_unique UNIQUE (user_id);
