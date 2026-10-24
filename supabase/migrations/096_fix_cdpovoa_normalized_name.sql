-- Fix stale normalized_name for CD Póvoa (was 'cd povoa masters', should match canonical alias)
UPDATE public.league_teams
SET normalized_name = 'cd povoa'
WHERE id = '06e1a757-838b-4caa-9bdf-6dd2341b28f3';
