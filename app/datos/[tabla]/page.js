import { notFound } from "next/navigation";
import Volver from "@/components/Volver";
import TablaEditable from "@/components/TablaEditable";
import { TABLAS } from "@/lib/tablas";

export default function Pagina({ params }) {
  if (!TABLAS[params.tabla]) notFound();
  return <div className="space-y-3"><Volver a="/datos" /><TablaEditable tabla={params.tabla} /></div>;
}
