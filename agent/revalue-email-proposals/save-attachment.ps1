# save-attachment.ps1: saves ONE PDF attachment of ONE email into a project's contract folders, for the
# "revalue-email-proposals" task. It prints a single JSON line:
#   {"status":"saved"|"existing"|"failed","path":"...","link":"https://solargik.sharepoint.com/...","fileName":"...","reason":"..."}
#
#   & 'C:\Users\LeoraPenn\.claude\scheduled-tasks\revalue-email-proposals\save-attachment.ps1' `
#       -InternetMessageId '<id>' -AttachmentName 'invoice.pdf' -ProjectFolder '259 (Revalue, Rignano Flaminio 1, Italy)' `
#       -Subfolder 'Contracts + Legal\Invoices' -ReceivedDate 2026-10-12
#
# Guarantees:
#   - Outlook is only READ: the message is found and ONE attachment is saved to a temporary file. Nothing in the
#     mailbox is changed and Outlook is never closed.
#   - Writes only inside <OneDrive - Solargik>\Projects - EXECUTION\<ProjectFolder>\Contracts + Legal[\Invoices | \Proof of payment].
#     The project folder and "Contracts + Legal" must already exist; only "Invoices" and "Proof of payment" are ever created.
#   - Only a non-inline .pdf of at most 10 MB, that starts with %PDF and ends with %%EOF.
#   - Never overwrites, renames, moves or deletes an existing file. A same-named different file gets the received date
#     (and (2), (3)...) added to the new file's name; an identical copy is not saved again (the existing one is linked).
#   - The only thing it deletes is its own temporary folder under %TEMP%.
param(
  [Parameter(Mandatory = $true)][string]$InternetMessageId,
  [Parameter(Mandatory = $true)][string]$AttachmentName,
  [Parameter(Mandatory = $true)][string]$ProjectFolder,
  [Parameter(Mandatory = $true)][ValidateSet('Contracts + Legal', 'Contracts + Legal\Invoices', 'Contracts + Legal\Proof of payment')][string]$Subfolder,
  [Parameter(Mandatory = $true)][string]$ReceivedDate
)

$ErrorActionPreference = 'Stop'
$maxBytes = 10MB
$sharePointBase = 'https://solargik.sharepoint.com/sites/Projects/Shared%20Documents/EXECUTION/'

function Result([string]$status, [string]$reason, [string]$path = '', [string]$link = '', [string]$fileName = '') {
  return [pscustomobject]@{ status = $status; path = $path; link = $link; fileName = $fileName; reason = $reason }
}

# A PDF starts with %PDF and has %%EOF near its end.
function Test-PdfFile([string]$file) {
  $bytes = [IO.File]::ReadAllBytes($file)
  if ($bytes.Length -lt 16) { return $false }
  if ($bytes[0] -ne 0x25 -or $bytes[1] -ne 0x50 -or $bytes[2] -ne 0x44 -or $bytes[3] -ne 0x46) { return $false }
  $tailStart = [Math]::Max(0, $bytes.Length - 1024)
  $tail = [Text.Encoding]::GetEncoding(28591).GetString($bytes, $tailStart, $bytes.Length - $tailStart)
  return $tail.Contains('%%EOF')
}

# Copies $source into $targetDir without ever touching an existing file. Returns the final path and whether it
# was newly saved or an identical file already existed.
function Place-Pdf([string]$source, [string]$targetDir, [string]$fileName, [string]$receivedDate) {
  $stem = [IO.Path]::GetFileNameWithoutExtension($fileName)
  $names = New-Object System.Collections.Generic.List[string]
  $names.Add("$stem.pdf")
  $names.Add("$stem - $receivedDate.pdf")
  for ($n = 2; $n -le 20; $n++) { $names.Add("$stem - $receivedDate ($n).pdf") }
  $newHash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
  foreach ($name in $names) {
    $target = Join-Path $targetDir $name
    if (Test-Path -LiteralPath $target) {
      if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -eq $newHash) {
        return [pscustomobject]@{ status = 'existing'; path = $target; fileName = $name }
      }
      continue
    }
    [IO.File]::Copy($source, $target, $false)
    if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $newHash) {
      throw 'the saved copy does not match the attachment'
    }
    return [pscustomobject]@{ status = 'saved'; path = $target; fileName = $name }
  }
  throw 'too many files with this name already exist'
}

function Save-Attachment {
  # ---- check the inputs ----
  if ($ReceivedDate -notmatch '^\d{4}-\d{2}-\d{2}$') { return Result 'failed' 'ReceivedDate must be yyyy-MM-dd' }
  try { $null = [datetime]::ParseExact($ReceivedDate, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture) } catch { return Result 'failed' 'ReceivedDate is not a real date' }
  if ($InternetMessageId.Length -gt 500 -or $InternetMessageId -match '[\x00-\x1f]') { return Result 'failed' 'InternetMessageId is not valid' }
  if ($ProjectFolder.Length -gt 200 -or $ProjectFolder -match '[\\/:*?"<>|\x00-\x1f]' -or $ProjectFolder -match '^\.+$') { return Result 'failed' 'ProjectFolder must be a folder name only' }
  if ($AttachmentName -notmatch '\.pdf$') { return Result 'failed' 'only .pdf attachments are saved' }

  # ---- the target folder (must already exist, except Invoices / Proof of payment) ----
  $root = Join-Path $env:USERPROFILE 'OneDrive - Solargik\Projects - EXECUTION'
  $projectDir = Join-Path $root $ProjectFolder
  if (-not (Test-Path -LiteralPath $projectDir -PathType Container)) { return Result 'failed' 'the project folder does not exist' }
  $legalDir = Join-Path $projectDir 'Contracts + Legal'
  if (-not (Test-Path -LiteralPath $legalDir -PathType Container)) { return Result 'failed' 'the project has no "Contracts + Legal" folder' }
  $targetDir = Join-Path $projectDir $Subfolder
  if (-not (Test-Path -LiteralPath $targetDir -PathType Container)) {
    if ($Subfolder -eq 'Contracts + Legal') { return Result 'failed' 'the target folder does not exist' }
    $null = New-Item -ItemType Directory -Path $targetDir
  }

  # ---- find the message and the attachment in classic Outlook (read only) ----
  try { $outlook = New-Object -ComObject Outlook.Application } catch { return Result 'failed' 'classic Outlook is not available' }
  $namespace = $outlook.GetNamespace('MAPI')
  $escaped = $InternetMessageId.Replace("'", "''")
  $filter = '@SQL="http://schemas.microsoft.com/mapi/proptag/0x1035001F" = ''' + $escaped + ''''
  $mail = $null
  foreach ($folderId in 6, 5) {   # 6 = Inbox, 5 = Sent Items
    $hit = $namespace.GetDefaultFolder($folderId).Items.Restrict($filter)
    if ($hit.Count -gt 0) { $mail = $hit.Item(1); break }
  }
  if (-not $mail) { return Result 'failed' 'the message was not found in classic Outlook' }
  $attachment = $null
  for ($i = 1; $i -le $mail.Attachments.Count; $i++) {
    $candidate = $mail.Attachments.Item($i)
    if ($candidate.Type -eq 1 -and $candidate.FileName -ieq $AttachmentName) { $attachment = $candidate; break }
  }
  if (-not $attachment) { return Result 'failed' 'the attachment was not found on the message' }
  if ($attachment.Size -gt $maxBytes) { return Result 'failed' 'the attachment is larger than 10 MB' }

  # ---- save it to a temporary folder, verify it, then place it without overwriting anything ----
  $tempDir = Join-Path ([IO.Path]::GetTempPath()) ('revalue-attach-' + [guid]::NewGuid().ToString('N'))
  $null = New-Item -ItemType Directory -Path $tempDir
  try {
    $temp = Join-Path $tempDir 'attachment.pdf'
    $attachment.SaveAsFile($temp)
    if (-not (Test-Path -LiteralPath $temp)) { return Result 'failed' 'Outlook did not save the attachment' }
    if ((Get-Item -LiteralPath $temp).Length -gt $maxBytes) { return Result 'failed' 'the attachment is larger than 10 MB' }
    if (-not (Test-PdfFile $temp)) { return Result 'failed' 'the file is not a complete PDF' }
    $fileName = ($AttachmentName -replace '[\\/:*?"<>|]', '_').Trim().TrimEnd('.')
    if ($fileName -notmatch '\.pdf$') { $fileName += '.pdf' }
    $placed = Place-Pdf $temp $targetDir $fileName $ReceivedDate
    $segments = @($ProjectFolder) + @($Subfolder -split '\\') + @($placed.fileName)
    $link = $sharePointBase + (($segments | ForEach-Object { [uri]::EscapeDataString($_) }) -join '/')
    return Result $placed.status '' $placed.path $link $placed.fileName
  } finally {
    # only the temporary folder created above
    if ($tempDir -like (Join-Path ([IO.Path]::GetTempPath()) 'revalue-attach-*')) {
      Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}

try {
  $result = Save-Attachment
} catch {
  $result = Result 'failed' ('error: ' + $_.Exception.Message)
}
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Write-Output ($result | ConvertTo-Json -Compress)
