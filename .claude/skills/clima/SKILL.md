---
name: clima
description: Consulta el clima actual (temperatura, sensación térmica, humedad, viento, pronóstico) de una ciudad usando wttr.in desde la terminal local, sin API key. Úsala cuando el usuario pregunte por el clima, la temperatura o el pronóstico de cualquier ciudad; por defecto Culiacán, Sinaloa.
---

# Clima

Obtiene el clima ejecutando un script local contra `wttr.in`. No requiere API key ni registro.

## Uso

1. Determina la ciudad:
   - Si el usuario nombra una ciudad, úsala.
   - Si no nombra ninguna, usa **Culiacan** (Sinaloa, México), la ciudad por defecto.
   - Para ciudades con espacios usa `+` o comillas: `"Ciudad de Mexico"` → `Ciudad+de+Mexico`.
   - Evita acentos y la `ñ` en el nombre para que la URL resuelva bien (`Culiacan`, no `Culiacán`).

2. Ejecuta el script con la herramienta PowerShell:

   ```powershell
   powershell -File .claude/skills/clima/scripts/clima.ps1 -Ciudad Culiacan
   ```

   Para incluir el pronóstico de los próximos 3 días:

   ```powershell
   powershell -File .claude/skills/clima/scripts/clima.ps1 -Ciudad Culiacan -Pronostico
   ```

3. Reporta el resultado **en español** y en formato breve. Formato por defecto (una línea):

   `Culiacán, Sinaloa: 29 °C (sensación 35 °C), nublado, humedad 81%.`

   Solo da el detalle completo (viento, presión, UV, visibilidad) o el pronóstico si el usuario lo pide.

## Notas

- `wttr.in` actualiza sus observaciones cada 15–60 minutos: consultar más seguido que eso devuelve el mismo valor. Si el usuario pide un sondeo repetido, sugiérele un intervalo de 15–30 min.
- El script traduce al español las descripciones de clima más comunes; si aparece una sin traducir, se muestra el texto original en inglés.
- Si la red falla o `wttr.in` no responde, el script sale con código 1 y un mensaje de error: informa al usuario en vez de inventar datos.
