-- Para guardar la foto (captura del pedido) de cada lote.
-- Corre esto UNA vez en Supabase > SQL Editor (pega el contenido, no el nombre del archivo).
alter table lotes add column if not exists foto text;
