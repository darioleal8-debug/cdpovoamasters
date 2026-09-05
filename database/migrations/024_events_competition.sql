-- Adiciona campo competition à tabela events
-- Valores: 'Liga' | 'Taça' (default 'Liga' para retrocompatibilidade)
ALTER TABLE events ADD COLUMN IF NOT EXISTS competition VARCHAR(20) DEFAULT 'Liga';
