-- Para poder volver a abrir una compra con su tipo de cambio, aduana, envío y precios originales.
-- Corre esto UNA vez en Supabase > SQL Editor.
alter table lotes add column if not exists compra jsonb;
alter table productos add column if not exists precio_origen numeric;
