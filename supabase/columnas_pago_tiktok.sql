-- Guarda con qué pago de TikTok se liquidó cada venta (historial de conciliaciones).
alter table ventas add column if not exists id_pago_tiktok text;
alter table ventas add column if not exists fecha_pago date;
