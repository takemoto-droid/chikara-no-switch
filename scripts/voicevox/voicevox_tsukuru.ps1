# チカラのスイッチ：読み上げの音声 98 本を、VOICEVOX（No.7・読み聞かせ）で作る
# 使い方：VOICEVOX を起動しておき、同じフォルダの bat をダブルクリックする
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$speaker = 31   # No.7（読み聞かせ）
$base = 'http://127.0.0.1:50021'
$out = Join-Path $here 'voicevox_onsei'
New-Item -ItemType Directory -Force -Path $out | Out-Null
try { Invoke-RestMethod -Uri "$base/version" -TimeoutSec 5 | Out-Null }
catch { Write-Host 'NG：VOICEVOX が開いていません。VOICEVOX を起動してから、もう一度押してください。' -ForegroundColor Red; Read-Host 'Enter で閉じます'; exit 1 }
$lines = @(Get-Content -Path (Join-Path $here 'voicevox_bun.tsv') -Encoding UTF8 | Where-Object { $_.Trim() })
$n = 0
foreach ($l in $lines) {
  $f, $t = $l -split "`t", 2
  $wav = Join-Path $out ($f -replace '\.mp3$', '.wav')
  $q = Invoke-RestMethod -Method Post -Uri ("$base/audio_query?speaker=$speaker&text=" + [uri]::EscapeDataString($t))
  $body = [System.Text.Encoding]::UTF8.GetBytes(($q | ConvertTo-Json -Depth 20 -Compress))
  Invoke-WebRequest -Method Post -Uri "$base/synthesis?speaker=$speaker" -ContentType 'application/json' -Body $body -OutFile $wav -UseBasicParsing
  $n++
  Write-Host ("{0} / {1}  {2}" -f $n, $lines.Count, $f)
}
$zip = Join-Path ([Environment]::GetFolderPath('Desktop')) 'voicevox_onsei.zip'
if (Test-Path $zip) { Remove-Item $zip }
Compress-Archive -Path (Join-Path $out '*.wav') -DestinationPath $zip
if ($n -eq $lines.Count) { Write-Host "OK：$n 本できました。デスクトップの voicevox_onsei.zip を、Claude のチャットに添付してください。" -ForegroundColor Green }
else { Write-Host "NG：$n / $($lines.Count) 本しかできませんでした。画面を写して Claude に見せてください。" -ForegroundColor Red }
Read-Host 'Enter で閉じます'
