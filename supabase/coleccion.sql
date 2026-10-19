-- Colección personal (compras de aficionado) y costo/fecha de venta en cartas.
-- Corre esto UNA vez en Supabase > SQL Editor.
create table if not exists coleccion (
  id_compra text primary key,
  fecha date,
  descripcion text not null,
  monto numeric not null default 0,
  vendido numeric not null default 0,   -- lo recuperado vendiendo de esta compra
  notas text
);

alter table cartas add column if not exists costo numeric default 0;        -- lo que pagaste por la carta
alter table cartas add column if not exists fecha_venta date;
alter table cartas add column if not exists id_compra text references coleccion(id_compra) on update cascade on delete set null;
alter table cartas add column if not exists notas text;

alter table coleccion enable row level security;
drop policy if exists "auth_all" on coleccion;
create policy "auth_all" on coleccion for all to authenticated using (true) with check (true);
