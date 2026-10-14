-- Arreglos de datos — Marinero Cards (14 oct 2026)
-- Pégalo completo en Supabase > SQL Editor y dale Run. Se puede correr más de una vez sin dañar nada.
-- Qué hace:
--  1) Las ventas externas (sin producto) ahora SÍ cuentan en Vendido, Posición y en su lote EXT.
--  2) Borra las 11 ventas duplicadas que creó el importador de TikTok (V0130 a V0140) y deja sus
--     pedidos ligados a la venta original (V0001: 10 sobres de la Super Box; V0011: blister Perfect Order).
--  3) Pone fecha, monto exacto y estado "En espera" a las ventas que sí aparecen en tu hoja "Ventas tiktok".

begin;

-- 1) Vistas: las ventas sueltas (sin producto) suman a su lote y al total
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
alter view v_lotes set (security_invoker = on);
alter view v_resumen set (security_invoker = on);

-- 2) Duplicados del importador
-- V0001 (Super Box, 1847) ya incluía los 10 sobres de TikTok: se queda con sus pedidos
update ventas set
  id_pedido_tiktok = (select string_agg(id_pedido_tiktok, ',' order by id_venta) from ventas
                      where id_venta in ('V0130','V0131','V0133','V0134','V0135','V0136','V0137','V0138','V0139','V0140')
                        and id_pedido_tiktok is not null),
  estado = 'Pagado', fecha = coalesce(fecha, date '2026-09-19')
where id_venta = 'V0001'
  and exists (select 1 from ventas where id_venta in ('V0130','V0131','V0133','V0134','V0135','V0136','V0137','V0138','V0139','V0140') and id_pedido_tiktok is not null);

-- V0011 (blister Perfect Order) estaba en el Excel a costo (423.72); TikTok pagó 636.12 el 20-sep
update ventas v set
  monto_neto = d.monto_neto, id_pedido_tiktok = d.id_pedido_tiktok, estado = 'Pagado', fecha = d.fecha
from ventas d
where v.id_venta = 'V0011' and d.id_venta = 'V0132' and d.id_pedido_tiktok is not null;

delete from ventas
where id_venta in ('V0130','V0131','V0132','V0133','V0134','V0135','V0136','V0137','V0138','V0139','V0140')
  and canal = 'TikTok' and id_pedido_tiktok is not null;

-- 3) Ventas que en tu hoja "Ventas tiktok" están En espera: fecha, monto liquidado y estado

update ventas set fecha = date '2026-09-25', monto_neto = 2227.7, estado = 'En espera' where id_venta = 'V0067' and estado = 'Sin empatar';  -- Pokémon TCG: 30TH Celebration Elite Trainer B
update ventas set fecha = date '2026-09-28', monto_neto = 2227.7, estado = 'En espera' where id_venta = 'V0066' and estado = 'Sin empatar';  -- Pokémon TCG: 30TH Celebration Elite Trainer B
update ventas set fecha = date '2026-09-29', monto_neto = 2227.7, estado = 'En espera' where id_venta = 'V0065' and estado = 'Sin empatar';  -- Pokémon TCG: 30TH Celebration Elite Trainer B
update ventas set fecha = date '2026-09-30', monto_neto = 590.63, estado = 'En espera' where id_venta = 'V0103' and estado = 'Sin empatar';  -- Pokémon TCG 30th Celebration — Poster Collect
update ventas set fecha = date '2026-09-30', monto_neto = 2227.7, estado = 'En espera' where id_venta = 'V0064' and estado = 'Sin empatar';  -- Pokémon TCG: 30TH Celebration Elite Trainer B
update ventas set fecha = date '2026-09-30', monto_neto = 681.59, estado = 'En espera' where id_venta = 'V0096' and estado = 'Sin empatar';  -- Pokémon TCG: 30TH Celebration Tech Sticker Co
update ventas set fecha = date '2026-09-30', monto_neto = 590.63, estado = 'En espera' where id_venta = 'V0085' and estado = 'Sin empatar';  -- Pokémon TCG: 30TH Celebration Tech Sticker Co
update ventas set fecha = date '2026-09-30', monto_neto = 818.01, estado = 'En espera' where id_venta = 'V0083' and estado = 'Sin empatar';  -- Pokémon TCG: 30TH Celebration Greninja EX Box
update ventas set fecha = date '2026-09-30', monto_neto = 2227.7, estado = 'En espera' where id_venta = 'V0063' and estado = 'Sin empatar';  -- Pokémon TCG: 30TH Celebration Elite Trainer B
update ventas set fecha = date '2026-10-02', monto_neto = 772.53, estado = 'En espera' where id_venta = 'V0084' and estado = 'Sin empatar';  -- Pokémon TCG: 30TH Celebration Greninja EX Box
update ventas set fecha = date '2026-10-03', monto_neto = 772.53, estado = 'En espera' where id_venta = 'V0078' and estado = 'Sin empatar';  -- Pokémon TCG: 30TH Celebration Greninja EX Box
update ventas set fecha = date '2026-10-03', monto_neto = 1318.22, estado = 'En espera' where id_venta = 'V0113' and estado = 'Sin empatar';  -- Pokémon 30TH Celebration Booster Bundle
update ventas set fecha = date '2026-10-03', monto_neto = 1318.22, estado = 'En espera' where id_venta = 'V0112' and estado = 'Sin empatar';  -- Pokémon 30TH Celebration Booster Bundle
update ventas set fecha = date '2026-10-03', monto_neto = 545.16, estado = 'En espera' where id_venta = 'V0116' and estado = 'Sin empatar';  -- Pokémon TCG: 30TH Celebration Mini Tin - Mew 
update ventas set fecha = date '2026-10-04', monto_neto = 1318.22, estado = 'En espera' where id_venta = 'V0111' and estado = 'Sin empatar';  -- Pokémon 30TH Celebration Booster Bundle
update ventas set fecha = date '2026-10-06', monto_neto = 727.06, estado = 'En espera' where id_venta = 'V0087' and estado = 'Sin empatar';  -- Pokémon TCG: 30TH Celebration Greninja EX Box
update ventas set fecha = date '2026-10-07', monto_neto = 681.59, estado = 'En espera' where id_venta = 'V0095' and estado = 'Sin empatar';  -- Pokémon TCG: 30TH Celebration Greninja EX Box
update ventas set fecha = date '2026-10-07', monto_neto = 681.59, estado = 'En espera' where id_venta = 'V0092' and estado = 'Sin empatar';  -- Pokémon TCG: 30TH Celebration Greninja EX Box
update ventas set fecha = date '2026-10-08', monto_neto = 681.59, estado = 'En espera' where id_venta = 'V0091' and estado = 'Sin empatar';  -- Pokémon TCG: 30TH Celebration Greninja EX Box
update ventas set fecha = date '2026-10-08', monto_neto = 1591.07, estado = 'En espera' where id_venta = 'V0108' and estado = 'Sin empatar';  -- Pokémon Caja DE Entrenador ÉLITE DE CELEBRACI
update ventas set fecha = date '2026-10-08', monto_neto = 1591.07, estado = 'En espera' where id_venta = 'V0107' and estado = 'Sin empatar';  -- Pokémon Caja DE Entrenador ÉLITE DE CELEBRACI
update ventas set fecha = date '2026-10-09', monto_neto = 681.59, estado = 'En espera' where id_venta = 'V0088' and estado = 'Sin empatar';  -- Pokémon TCG: 30TH Celebration Greninja EX Box
update ventas set fecha = date '2026-09-29', monto_neto = 2195.37, estado = 'En espera' where id_venta = 'V0062' and estado = 'Sin empatar';  -- Pokémon TCG: 30TH Celebration Elite Trainer B
update ventas set fecha = date '2026-09-30', monto_neto = 2195.37, estado = 'En espera' where id_venta = 'V0061' and estado = 'Sin empatar';  -- Pokémon TCG: 30TH Celebration Elite Trainer B
update ventas set fecha = date '2026-10-01', monto_neto = 2195.37, estado = 'En espera' where id_venta = 'V0060' and estado = 'Sin empatar';  -- Pokémon TCG: 30TH Celebration Elite Trainer B

commit;

-- Revisión rápida: ganancia por lote y resumen general
select id_lote, nombre, round(venta::numeric,2) as venta, round(ganancia_real::numeric,2) as ganancia from v_lotes order by id_lote;
select round(total_vendido::numeric,2) as total_vendido, round(posicion::numeric,2) as posicion from v_resumen;
