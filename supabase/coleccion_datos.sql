-- Datos iniciales de tu tabla "Mis compras como aficionado".
-- Corre DESPUÉS de coleccion.sql. Todo es colección (no reventa).
insert into coleccion (id_compra, descripcion, monto, notas) values
  ('CC001', 'Varias 2026', 7270, 'Niño y gordo'),
  ('CC002', 'Marvel Chrome', 1414, 'Joy banamex david'),
  ('CC003', 'Panini Prizm FIFA WC', 1200, '4 Cajas Pagadas'),
  ('CC004', '2 Mega Boxes NBA Chrome Updates', 3200, '2 Mega Pagadas'),
  ('CC005', 'Alt Favr (2)', 1560, 'Bóveda alt'),
  ('CC006', 'Lote Onda', 22324, '25,074 menos 2,750 que fue reventa (1,850 + 900). Jude (469), Flagg (560) y Messi (349), Turner PSA, Lewa, Musiala, Yamal 807, Break inception tomar casino y ventas bellingham y karetsas 1,980')
on conflict (id_compra) do nothing;

-- Las 8 cartas graduadas: su costo es lo que pagaste (no se duplican como compra)
update cartas set costo = valoracion where id_carta in ('C083','C084','C085','C086','C087','C088','C089','C090');
