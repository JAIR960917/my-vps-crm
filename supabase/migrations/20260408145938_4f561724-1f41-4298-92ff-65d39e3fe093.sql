
DROP FUNCTION IF EXISTS public.get_profile_names();

CREATE FUNCTION public.get_profile_names()
 RETURNS TABLE(user_id uuid, full_name text, avatar_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT user_id, full_name, avatar_url FROM public.profiles;
$$;
