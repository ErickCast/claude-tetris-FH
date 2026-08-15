# Consulta el clima actual de una ciudad usando wttr.in (sin API key).
# Uso: powershell -File clima.ps1 -Ciudad Culiacan [-Pronostico]

[CmdletBinding()]
param(
    [string]$Ciudad = "Culiacan",
    [switch]$Pronostico
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
# wttr.in responde en UTF-8; sin esto los acentos salen mal en la consola
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$traducciones = @{
    "Sunny"                         = "soleado"
    "Clear"                         = "despejado"
    "Partly cloudy"                 = "parcialmente nublado"
    "Cloudy"                        = "nublado"
    "Overcast"                      = "cielo cubierto"
    "Mist"                          = "neblina"
    "Fog"                           = "niebla"
    "Patchy rain possible"          = "posible lluvia dispersa"
    "Patchy rain nearby"            = "lluvia dispersa cerca"
    "Light rain"                    = "lluvia ligera"
    "Light rain shower"             = "chubasco ligero"
    "Moderate rain"                 = "lluvia moderada"
    "Moderate or heavy rain shower" = "chubasco moderado o fuerte"
    "Heavy rain"                    = "lluvia fuerte"
    "Thundery outbreaks possible"   = "posibles tormentas electricas"
    "Moderate or heavy rain with thunder" = "lluvia con tormenta electrica"
}

# wttr.in devuelve los nombres de lugar con UTF-8 doblemente codificado
# ("LeÃ³n" en vez de "León"): se reinterpretan los bytes latin1 como UTF-8.
function ArreglarAcentos([string]$texto) {
    if ([string]::IsNullOrEmpty($texto)) { return $texto }
    $bytes = [Text.Encoding]::GetEncoding(28591).GetBytes($texto)
    return [Text.Encoding]::UTF8.GetString($bytes)
}

function Traducir([string]$texto) {
    # wttr.in suele devolver la descripcion con espacios sobrantes
    $texto = $texto.Trim()
    if ($traducciones.ContainsKey($texto)) { return $traducciones[$texto] }
    return $texto.ToLower()
}

$url = "https://wttr.in/$([Uri]::EscapeDataString($Ciudad))?format=j1"

try {
    # Se decodifica a mano: wttr.in no declara charset y PS 5.1 asumiria ISO-8859-1
    $resp = Invoke-WebRequest -Uri $url -Headers @{ "User-Agent" = "curl" } -TimeoutSec 20 -UseBasicParsing
    $data = [Text.Encoding]::UTF8.GetString($resp.RawContentStream.ToArray()) | ConvertFrom-Json
} catch {
    Write-Output "Error: no se pudo consultar el clima de '$Ciudad' ($($_.Exception.Message))"
    exit 1
}

$actual = $data.current_condition[0]
$area   = $data.nearest_area[0]
$lugar  = ArreglarAcentos $area.areaName[0].value
$region = ArreglarAcentos $area.region[0].value
$desc   = Traducir $actual.weatherDesc[0].value

Write-Output "$lugar, $region"
Write-Output "  Temperatura : $($actual.temp_C) C (sensacion $($actual.FeelsLikeC) C)"
Write-Output "  Estado      : $desc"
Write-Output "  Humedad     : $($actual.humidity)%"
Write-Output "  Viento      : $($actual.windspeedKmph) km/h ($($actual.winddir16Point))"
Write-Output "  Presion     : $($actual.pressure) mb"
Write-Output "  Visibilidad : $($actual.visibility) km"
Write-Output "  Indice UV   : $($actual.uvIndex)"
$observado = $actual.localObsDateTime
if ([string]::IsNullOrWhiteSpace($observado)) { $observado = "$($actual.observation_time) UTC" }
Write-Output "  Observado   : $observado"

if ($Pronostico) {
    Write-Output ""
    Write-Output "Pronostico:"
    foreach ($dia in $data.weather) {
        $d = Traducir $dia.hourly[4].weatherDesc[0].value
        Write-Output "  $($dia.date): min $($dia.mintempC) C / max $($dia.maxtempC) C - $d"
    }
}
