# Modelo multi-clube (HoopHub)

## Estado
- Fases 1, 2 e 3a aplicadas em produção (migrações 123–129). Rollback: `supabase/rollbacks/123_125_multiclube_rollback.sql`.
- Backup pré-alteração: schema `backup_20261112` (mesma BD; apagar quando estável).
- **Ainda NÃO é seguro dar contas de gestão a outros clubes** (ver "Pendente").

## Master Admin e clubes da Liga
- `platform_admins`: darioleal8@gmail.com é o único Master Admin (`is_master_admin()`); `my_club_ids()` devolve todos os clubes para ele.
- Cada equipa real da Liga tem um clube **inativo** sem membros (inclui o CBF Felgueiras BAD): os delegados não acedem à app de gestão. Ativar um clube = `clubs.active=true` + criar membros.
- Só o Master Admin cria/edita clubes e membros.

## Ecrã Master Admin
`/master-clubes` (só Master Admin; API em `/api/master/clubs`): criar clubes (sempre inativos), ativar/desativar, criar utilizadores por clube e ativar/desativar o acesso.

## Storage
Uploads fazem-se pelas rotas (service role). Escrita direta nos buckets club-documents/club-logos/player-photos só para o Master Admin (migração 128). Buckets públicos continuam legíveis por URL (nomes não adivinháveis); novos documentos ficam em `documents/<club_id>/`.

## Modelo
- `clubs` (1 por clube; `league_team_id` liga à equipa da Liga) e `club_members` (utilizador ↔ clube, papel).
- `club_id` nas tabelas de dados. Políticas RLS **RESTRICTIVE** (`club_isolation*`) por cima das existentes, via `my_club_ids()`.
- Trigger `set_club_id` preenche `club_id` no INSERT: pelo clube do utilizador autenticado, ou (service role) pelo único clube ativo **enquanto só existir 1**.

## Regra de código
Todo o insert com service role (que ignora RLS) numa tabela de clube tem de definir `club_id` explicitamente.
O teste `web/lib/auth/club-id-guard.test.ts` falha para ficheiros novos; os existentes estão numa allowlist a esvaziar.

## Pendente
- **Isolamento nas rotas (feito, parcial):** `createServiceClient()` filtra por clube (`lib/supabase/club-scope.ts`) as tabelas com `club_id` e `users`, e força o `club_id` nos inserts. Cron/páginas públicas (sem sessão) ficam sem filtro. Jogos da Liga (`events.club_id` nulo) continuam acessíveis.
- **Tabelas filhas (feito, migração 129):** têm `club_id` herdado do pai por trigger e entram no isolamento das rotas; as que não são do chat têm também RLS restritiva. Fora do âmbito: tabelas da Liga (game_photos, game_sheet_imports, match_reconciliations, news, result_submissions, game_audit_log), que pertencem ao domínio da Liga.
- Branding/definições por clube: `club_settings` ainda usa `id='default'` (logo já é por clube).
- (feito) todas as escritas service-role definem `club_id`; a allowlist do teste está vazia.
- Storage buckets, leituras públicas de `club_settings`/`team_aliases`, `is_our_team` e referências "Póvoa" no código.
- Jogos de outros clubes na tabela `events` do CD Póvoa (Fase 4: `league_games`).
- Proteção de leaked passwords (dashboard Supabase); RPCs anónimas usadas pelo cliente.
