-- Un solo estado: "Pagado" (el dinero ya te llegó, por TikTok o directo). Quita "Cobrado".
update ventas set estado = 'Pagado' where estado = 'Cobrado';
alter table ventas drop constraint if exists ventas_estado_check;
alter table ventas add constraint ventas_estado_check
  check (estado in ('Sin empatar','En espera','Pagado','Reembolso','Revisar'));
