-- Libreta: pre-registro de ventas por fuera, antes de pasarlas a Ventas.
-- Corre esto UNA vez en Supabase > SQL Editor (pega el contenido, no el nombre del archivo).
create table if not exists libreta (
  id bigint generated always as identity primary key,
  fecha date not null default current_date,
  producto text not null,
  cliente text,
  cantidad numeric not null default 1,
  monto numeric not null default 0,       -- total cobrado
  id_producto text,                       -- opcional: producto del inventario al que se liga
  pasada_a text,                          -- id_venta cuando ya se pasó a Ventas
  notas text,
  creado_en timestamptz default now()
);
alter table libreta enable row level security;
drop policy if exists "auth_all" on libreta;
create policy "auth_all" on libreta for all to authenticated using (true) with check (true);
