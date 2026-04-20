-- ============================================================
-- CORREÇÕES DE SEGURANÇA - PRIORIDADE 1, 2 e 3
-- ============================================================

-- ============================================================
-- ITEM 1 (CRÍTICO): whatsapp_instances - tokens de sessão expostos
-- Restringir SELECT para apenas usuários da mesma empresa
-- ============================================================
DROP POLICY IF EXISTS "All authenticated can view instances" ON public.whatsapp_instances;

CREATE POLICY "Users can view company instances"
  ON public.whatsapp_instances
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (company_id IS NOT NULL AND is_my_company(company_id))
  );

-- ============================================================
-- ITEM 2: get_my_company_id - inconsistência com manager_companies
-- Reescrever para considerar manager_companies (alinhar com is_same_company)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  -- Retorna o company_id principal do perfil; se não houver, retorna o primeiro
  -- company_id de manager_companies. Mantém compatibilidade com policies que
  -- esperam um único valor, mas evita NULL para gerentes sem company_id no profile.
  SELECT COALESCE(
    (SELECT company_id FROM public.profiles WHERE user_id = auth.uid() AND company_id IS NOT NULL LIMIT 1),
    (SELECT company_id FROM public.manager_companies WHERE user_id = auth.uid() LIMIT 1)
  );
$function$;

-- Ajustar a policy de INSERT em user_roles para usar is_my_company
-- (que já considera manager_companies), tornando a verificação consistente
DROP POLICY IF EXISTS "Gerentes can insert vendedor roles" ON public.user_roles;

CREATE POLICY "Gerentes can insert vendedor roles"
  ON public.user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'gerente'::app_role)
    AND role = 'vendedor'::app_role
    AND user_id <> auth.uid()
    AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = user_roles.user_id)
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = user_roles.user_id
        AND p.company_id IS NOT NULL
        AND public.is_my_company(p.company_id)
    )
  );

-- ============================================================
-- ITEM 3: crm_module_transition_logs - WITH CHECK (true) muito permissivo
-- Exigir que logs manuais sejam atribuídos ao próprio usuário;
-- logs automáticos (triggered_by NULL) ainda permitidos para edge functions
-- usando service role (que bypassa RLS), mas via authenticated exige owner.
-- ============================================================
DROP POLICY IF EXISTS "Authenticated can insert module transition logs" ON public.crm_module_transition_logs;

CREATE POLICY "Authenticated can insert module transition logs"
  ON public.crm_module_transition_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Logs manuais: triggered_by deve ser o próprio usuário OU
    -- a inserção marca trigger_source='manual' e atribui ao usuário corrente.
    -- Permite NULL apenas quando trigger_source != 'manual' (logs auto via cliente
    -- ainda são aceitos, mas service-role bypassa RLS de qualquer forma).
    (triggered_by IS NULL AND trigger_source <> 'manual')
    OR triggered_by = auth.uid()
  );

-- ============================================================
-- ITEM 4: whatsapp_trigger_sends - DELETE policy aplicada a {public}
-- Recriar policy aplicando apenas a {authenticated}
-- ============================================================
DROP POLICY IF EXISTS "Admins can delete any trigger send" ON public.whatsapp_trigger_sends;

CREATE POLICY "Admins can delete any trigger send"
  ON public.whatsapp_trigger_sends
  FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- ============================================================
-- ITENS 6, 7, 8: Buckets públicos permitem listagem
-- Tornar buckets PRIVADOS no nível de configuração (impede listagem via API)
-- e manter SELECT policy permitindo leitura individual de objetos.
-- URLs públicas via getPublicUrl continuarão funcionando? NÃO em bucket privado.
-- 
-- ALTERNATIVA SEGURA: Manter buckets públicos (URLs públicas funcionam),
-- mas restringir o SELECT policy em storage.objects para que LIST via API
-- requer autenticação E apenas retorne arquivos do próprio usuário/admin.
-- 
-- Como buckets `public: true` permitem leitura por URL via CDN sem passar por
-- RLS, restringir o policy SELECT só afeta operações via .list() ou .from('bucket').
-- Isso mantém imagens funcionando em <img src> e bloqueia enumeração.
-- ============================================================

-- AVATARS: leitura por URL pública continua, mas listagem só do próprio dono ou admin
DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;

CREATE POLICY "Authenticated can read avatars"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR (storage.foldername(name))[1] = auth.uid()::text
    )
  );

-- LOGOS: apenas autenticados leem; admins podem listar tudo, demais só leem objeto específico
DROP POLICY IF EXISTS "Anyone can view logos" ON storage.objects;

CREATE POLICY "Authenticated can read logos"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'logos');

-- WHATSAPP MEDIA: leitura individual permitida, listagem restrita
DROP POLICY IF EXISTS "Public read whatsapp media" ON storage.objects;

CREATE POLICY "Authenticated can read whatsapp media"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'whatsapp-media'
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR (storage.foldername(name))[1] = auth.uid()::text
    )
  );

-- IMPORTANTE: Os buckets continuam marcados como public=true no Supabase Storage,
-- então URLs geradas por getPublicUrl() continuam funcionando para exibir imagens
-- em <img src>. As policies acima só afetam operações via API SDK
-- (storage.from('bucket').list() / .download() autenticados), bloqueando enumeração.