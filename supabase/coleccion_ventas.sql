-- Ventas sueltas de la colección (por ejemplo "Bases 1,000+ cartas": las vas vendiendo poco a poco).
-- Corre esto UNA vez en Supabase > SQL Editor (pega el contenido, no el nombre del archivo).
create table if not exists coleccion_ventas (
  id bigint generated always as identity primary key,
  id_carta text,
  fecha date not null default current_date,
  cantidad numeric not null default 1,
  monto numeric not null default 0,
  cliente text,
  notas text,
  creado_en timestamptz default now()
);
alter table coleccion_ventas enable row level security;
drop policy if exists "auth_all" on coleccion_ventas;
create policy "auth_all" on coleccion_ventas for all to authenticated using (true) with check (true);
