-- 137: funções adicionais (roles_extra) passam a dar acesso também nas funções SQL/RLS.
-- Antes, is_admin / is_staff / is_trainer_or_above só olhavam para users.role, pelo que um jogador
-- a quem o administrador atribuísse "treinador", "seccionista" ou "admin" ficava sem o acesso
-- correspondente nas políticas RLS. has_active_role / is_manager / is_finance já respeitavam roles_extra.
-- roles_extra só pode ser alterado por admin (trigger enforce_sensitive_columns + API do admin).

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = (SELECT auth.uid())
      AND (role = 'admin' OR COALESCE(roles_extra, '[]'::jsonb) ? 'admin')
  )
$function$;

CREATE OR REPLACE FUNCTION public.is_staff()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = (SELECT auth.uid())
      AND (role IN ('admin', 'seccionista') OR COALESCE(roles_extra, '[]'::jsonb) ?| ARRAY['admin', 'seccionista'])
  )
$function$;

CREATE OR REPLACE FUNCTION public.is_trainer_or_above()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = (SELECT auth.uid())
      AND (role IN ('admin', 'seccionista', 'treinador')
           OR COALESCE(roles_extra, '[]'::jsonb) ?| ARRAY['admin', 'seccionista', 'treinador'])
  )
$function$;
