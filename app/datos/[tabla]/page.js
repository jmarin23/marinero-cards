import { notFound } from "next/navigation";
import TablaEditable from "@/components/TablaEditable";
import { TABLAS } from "@/lib/tablas";

export default function Pagina({ params }) {
  if (!TABLAS[params.tabla]) notFound();
  return <TablaEditable tabla={params.tabla} />;
}
