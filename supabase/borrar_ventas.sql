-- Borra SOLO las ventas. Lotes, compras (productos), pagos a socios y cartas se quedan igual.
-- Pégalo en Supabase > SQL Editor y dale Run. Después las vas metiendo con la pantalla "Venta".
delete from ventas;
select count(*) as ventas_que_quedan from ventas;
