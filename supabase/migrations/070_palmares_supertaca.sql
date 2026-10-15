-- 070_palmares_supertaca.sql
-- Adiciona "Supertaça" aos valores permitidos na coluna competicao do palmarés.

ALTER TABLE public.palmares
  DROP CONSTRAINT IF EXISTS palmares_competicao_check;

ALTER TABLE public.palmares
  ADD CONSTRAINT palmares_competicao_check
    CHECK (competicao IN ('Liga', 'Taça', 'Supertaça'));
