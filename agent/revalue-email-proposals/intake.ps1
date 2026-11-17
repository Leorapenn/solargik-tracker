# intake.ps1: the ONLY way the "revalue-email-proposals" task talks to Solargik 360.
#
#   & 'C:\Users\LeoraPenn\.claude\scheduled-tasks\revalue-email-proposals\intake.ps1' -Method GET  -Path projects
#   & '...\intake.ps1' -Method POST -Path suggestions -Json '{"suggestions":[...]}'
#
# What it does and does not do:
#   - Sends only to https://solargik-tracker.vercel.app/api/intake/<path>, with <path> one of four fixed names and
#     the method one of the combinations below. Nothing else can be called through it.
#   - Reads INTAKE_TOKEN from the Windows USER environment variable (the session's own copy can be out of date),
#     falls back to the process copy. The token is only put in the Authorization header. It is never printed,
#     logged or written anywhere, and errors never include request headers.
#   - Sends the body as UTF-8 bytes so Hebrew and other non-English text survives, and prints the response as UTF-8.
#   - On any failure it prints one line starting with FAILED (or "INTAKE_TOKEN is not set") and exits non-zero.
#     It never retries.
param(
  [Parameter(Mandatory = $true)][ValidateSet('GET', 'POST')][string]$Method,
  [Parameter(Mandatory = $true)][ValidateSet('import-run', 'customers', 'projects', 'suggestions')][string]$Path,
  [string]$Json
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$OutputEncoding = [Text.Encoding]::UTF8
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch { }

$base = 'https://solargik-tracker.vercel.app/api/intake/'
$allowed = @{ GET = @('import-run', 'customers', 'projects', 'suggestions'); POST = @('import-run', 'suggestions') }

function Stop-With([string]$message, [int]$code) {
  Write-Output $message
  exit $code
}

if ($allowed[$Method] -notcontains $Path) { Stop-With "FAILED: $Method $Path is not allowed" 3 }
if ($Method -eq 'GET' -and $Json) { Stop-With 'FAILED: GET takes no body' 3 }
if ($Method -eq 'POST') {
  if (-not $Json) { Stop-With 'FAILED: POST needs -Json' 3 }
  if ($Json.Length -gt 1000000) { Stop-With 'FAILED: body is larger than 1 MB' 3 }
  try { $null = $Json | ConvertFrom-Json } catch { Stop-With 'FAILED: -Json is not valid JSON' 3 }
}

# The user-level value is current; the process copy may predate it.
$t = [Environment]::GetEnvironmentVariable('INTAKE_TOKEN', 'User')
if (-not $t) { $t = $env:INTAKE_TOKEN }
if (-not $t) { Stop-With 'INTAKE_TOKEN is not set' 2 }

$request = @{
  Uri             = $base + $Path
  Method          = $Method
  Headers         = @{ Authorization = "Bearer $t" }
  UseBasicParsing = $true
  TimeoutSec      = 120
}
if ($Method -eq 'POST') {
  $request.Body = [Text.Encoding]::UTF8.GetBytes($Json)
  $request.ContentType = 'application/json; charset=utf-8'
}

try {
  $response = Invoke-WebRequest @request
  # Decode the bytes ourselves: Windows PowerShell 5.1 would read a response without a charset as Latin-1.
  Write-Output ([Text.Encoding]::UTF8.GetString($response.RawContentStream.ToArray()))
} catch {
  $status = 'no response'
  $detail = ''
  $failure = $_.Exception.Response
  if ($failure) {
    $status = [int]$failure.StatusCode
    try {
      $reader = New-Object IO.StreamReader($failure.GetResponseStream(), [Text.Encoding]::UTF8)
      $detail = $reader.ReadToEnd()
      if ($detail.Length -gt 500) { $detail = $detail.Substring(0, 500) }
    } catch { }
  } else {
    $detail = $_.Exception.Message
  }
  Stop-With "FAILED: $Method $Path -> HTTP $status $detail" 1
}
