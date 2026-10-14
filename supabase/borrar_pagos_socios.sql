-- Borra SOLO los pagos a socios (los que vinieron del Excel). Lotes, compras, ventas y cartas no se tocan.
-- Después, conforme captures ventas, en la pantalla Socios tocas "Ya pagué $X" por lo que sí pagaste.
delete from pagos_socios;
select count(*) as pagos_que_quedan from pagos_socios;
