// Reduce una imagen (captura de pantalla o foto) para guardarla dentro de la base sin pesar de más.
export function comprimirImagen(archivo, ancho = 1600, calidad = 0.85) {
  return new Promise((ok, mal) => {
    if (!archivo || !archivo.type?.startsWith("image/")) return mal(new Error("Ese archivo no es una imagen"));
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, ancho / img.width);
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const g = c.getContext("2d");
      g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); // fondo blanco por si trae transparencia
      g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      ok(c.toDataURL("image/jpeg", calidad));
    };
    img.onerror = () => { URL.revokeObjectURL(url); mal(new Error("No pude leer la imagen")); };
    img.src = url;
  });
}
