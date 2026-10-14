import { notFound } from "next/navigation";
import TablaEditable from "@/components/TablaEditable";
import { TABLAS } from "@/lib/tablas";

export default function Pagina({ params }) {
  const cfg = TABLAS[params.tabla];
  if (!cfg) notFound();
  return <TablaEditable cfg={cfg} tabla={params.tabla} />;
}
