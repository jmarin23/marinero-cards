-- Marinero Cards: esquema Supabase. Pégalo completo en SQL Editor y dale Run.

create table if not exists config (
  clave text primary key,
  valor numeric not null
);
insert into config (clave, valor) values
  ('porcentaje_socio', 0.5),
  ('tiktok_comision', 0.0905),
  ('tiktok_fijo', 46)
on conflict (clave) do nothing;

create table if not exists lotes (
  id_lote text primary key,
  nombre text not null,
  fecha date,
  proveedor_notas text
);

create table if not exists productos (
  id_producto text primary key,
  id_lote text references lotes(id_lote) on update cascade,
  nombre text not null,
  categoria text,                  -- Pokémon, MLB, NFL, NBA, Fut, Costo extra, Otro
  socio text default 'Yo',         -- "Yo" o nombre del socio
  quien_puso_costo text default 'Yo',  -- Yo / Socio
  cantidad numeric not null default 1,
  costo_total numeric not null default 0,
  reventa numeric,
  fecha_compra date,
  creado_en timestamptz default now()
);
create index if not exists productos_lote_idx on productos(id_lote);

create table if not exists ventas (
  id_venta text primary key,
  fecha date,
  id_producto text references productos(id_producto) on update cascade,  -- vacío = venta suelta
  id_lote text references lotes(id_lote) on update cascade,
  canal text,                      -- TikTok, Externa, Mercado Libre
  cantidad numeric not null default 1,
  monto_neto numeric not null default 0,
  estado text not null default 'Sin empatar'
    check (estado in ('Sin empatar','En espera','Pagado','Cobrado','Reembolso','Revisar')),
  cliente_notas text,
  id_pedido_tiktok text,
  creado_en timestamptz default now()
);
create index if not exists ventas_producto_idx on ventas(id_producto);
create index if not exists ventas_pedido_idx on ventas(id_pedido_tiktok);

create table if not exists pagos_socios (
  id_pago text primary key,
  fecha date,
  socio text not null,
  id_producto text references productos(id_producto) on update cascade,
  id_lote text references lotes(id_lote) on update cascade,   -- pago de lote completo
  tipo text check (tipo in ('Costo','Ganancia')),
  monto numeric not null default 0,
  notas text
);
alter table pagos_socios add column if not exists id_lote text references lotes(id_lote) on update cascade;

create table if not exists cartas (
  id_carta text primary key,
  nombre text not null,
  valoracion numeric default 0,
  valor_venta numeric default 0,   -- > 0 = vendida
  deporte text,
  foto text
);

-- ---------- Vistas de cálculo (nada se captura a mano) ----------

create or replace view v_productos as
select
  p.*,
  coalesce(v.vendidas, 0) as vendidas,
  coalesce(v.venta_total, 0) as venta_total,
  case when p.categoria = 'Costo extra' then 0
       else p.cantidad - coalesce(v.vendidas, 0) end as inventario,
  case when p.cantidad > 0 then p.costo_total / p.cantidad else 0 end as costo_unitario,
  case when p.categoria = 'Costo extra' then 0
       else (case when p.cantidad > 0 then p.costo_total / p.cantidad else 0 end)
            * (p.cantidad - coalesce(v.vendidas, 0)) end as costo_inventario,
  coalesce(v.venta_total, 0)
    + case when p.categoria = 'Costo extra' then 0
           else (case when p.cantidad > 0 then p.costo_total / p.cantidad else 0 end)
                * (p.cantidad - coalesce(v.vendidas, 0)) end
    - p.costo_total as ganancia_real,
  v.ultima_venta,
  (current_date - coalesce(p.fecha_compra, p.creado_en::date)) as dias_en_inventario
from productos p
left join (
  select id_producto,
         sum(cantidad) as vendidas,
         sum(monto_neto) filter (where estado <> 'Reembolso') as venta_total,
         max(fecha) as ultima_venta
  from ventas where id_producto is not null
  group by id_producto
) v on v.id_producto = p.id_producto;

create or replace view v_lotes as
select
  l.id_lote, l.nombre, l.fecha,
  coalesce(sum(vp.costo_total), 0) as costo,
  coalesce(sum(vp.venta_total), 0) + coalesce(max(s.suelta), 0) as venta,
  coalesce(sum(vp.costo_inventario), 0) as inventario_a_costo,
  coalesce(sum(vp.inventario) filter (where vp.categoria <> 'Costo extra'), 0) as pzas_inventario,
  coalesce(sum(vp.ganancia_real), 0) + coalesce(max(s.suelta), 0) as ganancia_real
from lotes l
left join v_productos vp on vp.id_lote = l.id_lote
left join (
  select id_lote, sum(monto_neto) as suelta
  from ventas where id_producto is null and estado <> 'Reembolso' group by id_lote
) s on s.id_lote = l.id_lote
group by l.id_lote, l.nombre, l.fecha;

-- Posición general y ROI
create or replace view v_resumen as
with p as (select * from v_productos),
     s as (select coalesce(sum(monto_neto), 0) as suelta from ventas where id_producto is null and estado <> 'Reembolso')
select
  coalesce(sum(p.costo_total), 0) as total_invertido,
  coalesce(sum(p.venta_total), 0) + (select suelta from s) as total_vendido,
  coalesce(sum(p.costo_inventario), 0) as inventario_a_costo,
  coalesce(sum(p.venta_total), 0) + (select suelta from s) + coalesce(sum(p.costo_inventario), 0) - coalesce(sum(p.costo_total), 0) as posicion,
  case when sum(p.costo_total) > 0
       then (coalesce(sum(p.venta_total),0) + (select suelta from s) + coalesce(sum(p.costo_inventario),0) - sum(p.costo_total)) / sum(p.costo_total)
       else 0 end as roi
from p;

-- Ventas por canal y por mes
create or replace view v_ventas_canal as
select coalesce(canal, 'Sin canal') as canal, sum(monto_neto) as monto, sum(cantidad) as piezas
from ventas where estado <> 'Reembolso' group by 1;

create or replace view v_ventas_mes as
select to_char(date_trunc('month', fecha), 'YYYY-MM') as mes, sum(monto_neto) as monto
from ventas where fecha is not null and estado <> 'Reembolso' group by 1 order by 1;

-- Inventario por categoría
create or replace view v_inventario_categoria as
select coalesce(categoria, 'Otro') as categoria,
       sum(inventario) as piezas, sum(costo_inventario) as costo
from v_productos where categoria <> 'Costo extra' group by 1;

-- Saldo por socio: parte_socio = % de la ganancia; debo = costo por regresar + parte - pagos
create or replace view v_socios as
with pct as (select valor from config where clave = 'porcentaje_socio'),
base as (
  select socio,
         sum(ganancia_real) as ganancia,
         sum(case when quien_puso_costo = 'Socio' then costo_total - costo_inventario else 0 end) as costo_por_regresar
  from v_productos
  where socio is not null and socio not in ('Yo', '—', '')
  group by socio
),
pagos as (
  select socio, sum(monto) as pagado from pagos_socios group by socio
)
select b.socio,
       b.ganancia,
       b.ganancia * (select valor from pct) as parte_socio,
       b.costo_por_regresar,
       coalesce(p.pagado, 0) as pagos_registrados,
       b.costo_por_regresar + b.ganancia * (select valor from pct) - coalesce(p.pagado, 0) as debo_al_socio
from base b left join pagos p on p.socio = b.socio;

-- Alertas: más de 30 días sin venderse / lotes con pérdida
create or replace view v_alertas_estancados as
select id_producto, nombre, categoria, inventario, costo_inventario, dias_en_inventario
from v_productos
where inventario > 0 and categoria <> 'Costo extra'
  and (ultima_venta is null or current_date - ultima_venta > 30)
  and dias_en_inventario > 30;

create or replace view v_alertas_lotes_perdida as
select * from v_lotes where ganancia_real < 0;

-- ---------- Seguridad: solo usuarios con sesión ----------
do $$
declare t text;
begin
  foreach t in array array['config','lotes','productos','ventas','pagos_socios','cartas'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "auth_all" on %I', t);
    execute format('create policy "auth_all" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

alter view v_productos set (security_invoker = on);
alter view v_lotes set (security_invoker = on);
alter view v_resumen set (security_invoker = on);
alter view v_ventas_canal set (security_invoker = on);
alter view v_ventas_mes set (security_invoker = on);
alter view v_inventario_categoria set (security_invoker = on);
alter view v_socios set (security_invoker = on);
alter view v_alertas_estancados set (security_invoker = on);
alter view v_alertas_lotes_perdida set (security_invoker = on);
