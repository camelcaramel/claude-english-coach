<#
  en-coach 핫키 설치.

  Windows 바로가기(.lnk)의 Hotkey 속성이 전역 핫키를 공짜로 준다.
  AutoHotkey 도 Electron 도 네이티브 모듈도 필요 없다.

  .lnk 는 반드시 시작 메뉴나 바탕화면에 있어야 핫키가 먹는다. 임의 폴더에 두면
  Windows 가 등록하지 않는다.

    .\install.ps1              설치
    .\install.ps1 -Uninstall   제거
#>
param(
  [string]$Hotkey = 'CTRL+ALT+E',
  [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$programs = [Environment]::GetFolderPath('Programs')
$startup  = [Environment]::GetFolderPath('Startup')
$lnk      = Join-Path $programs 'en-coach 영어 변환.lnk'
$autorun  = Join-Path $startup  'en-coach daemon.lnk'
$vbs      = Join-Path $here 'run-hidden.vbs'

if ($Uninstall) {
  foreach ($f in @($lnk, $autorun)) {
    if (Test-Path $f) { Remove-Item $f -Force; Write-Host "제거: $f" }
  }
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -like '*hotkey*daemon.js*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Host "데몬 종료: PID $($_.ProcessId)" }
  Write-Host '제거 완료.'
  return
}

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw 'node 를 찾을 수 없습니다. Node.js 가 PATH 에 있어야 합니다.' }
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
  Write-Warning 'claude CLI 를 찾을 수 없습니다. 번역이 동작하지 않습니다.'
}

# 콘솔 창이 번쩍이지 않도록 vbs 로 감싼다.
#
# BOM 없이, ASCII 로만 쓴다. Set-Content -Encoding UTF8 은 PowerShell 5.1 에서
# BOM 을 붙이는데 wscript 가 그걸 스크립트 본문으로 읽어 실행이 조용히 실패한다.
$vbsBody = @"
' en-coach: run without a console window
Set a = WScript.Arguments
Set sh = CreateObject("WScript.Shell")
cmd = """$node"" """ & a(0) & """"
sh.Run cmd, 0, False
"@
[IO.File]::WriteAllText($vbs, $vbsBody, (New-Object Text.UTF8Encoding $false))

# 쓴 결과를 확인한다. BOM 이나 비 ASCII 바이트가 하나라도 있으면 wscript 가
# "유효하지 않은 문자입니다 (800A0408)" 대화상자를 띄우고 핫키가 통째로 죽는다.
# 실제로 한 번 그렇게 깨졌으므로 조용히 넘어가지 않는다.
$vbsBytes = [IO.File]::ReadAllBytes($vbs)
if ($vbsBytes[0] -eq 0xEF -and $vbsBytes[1] -eq 0xBB -and $vbsBytes[2] -eq 0xBF) {
  throw "run-hidden.vbs 에 BOM 이 붙었습니다. wscript 가 이것을 본문으로 읽어 실패합니다."
}
if ($vbsBytes | Where-Object { $_ -gt 127 }) {
  throw "run-hidden.vbs 에 비 ASCII 바이트가 있습니다. 주석까지 ASCII 로만 쓰세요."
}

$w = New-Object -ComObject WScript.Shell

$s = $w.CreateShortcut($lnk)
$s.TargetPath       = "$env:SystemRoot\System32\wscript.exe"
$s.Arguments        = """$vbs"" ""$here\client.js"""
$s.WorkingDirectory = $here
$s.IconLocation     = "$env:SystemRoot\System32\shell32.dll,44"
$s.Description      = '클립보드의 한국어/영어를 자연스러운 개발 영어로 바꿔 다시 클립보드에 넣는다'
$s.Hotkey           = $Hotkey
$s.Save()

$d = $w.CreateShortcut($autorun)
$d.TargetPath       = "$env:SystemRoot\System32\wscript.exe"
$d.Arguments        = """$vbs"" ""$here\daemon.js"""
$d.WorkingDirectory = $here
$d.Description      = 'en-coach 상주 세션'
$d.Save()

Write-Host ''
Write-Host '설치 완료' -ForegroundColor Green
Write-Host "  핫키      : $Hotkey"
Write-Host "  바로가기  : $lnk"
Write-Host "  자동 시작 : $autorun"
Write-Host ''
Write-Host '쓰는 법: 한국어(또는 어설픈 영어)를 복사하고 핫키를 누른다.'
Write-Host '5~11초 뒤 알림이 뜨면 클립보드가 영어로 바뀌어 있다. 그대로 붙여넣으면 된다.'
Write-Host ''
Write-Host '지금 데몬을 띄웁니다...'
Start-Process -FilePath "$env:SystemRoot\System32\wscript.exe" -ArgumentList """$vbs"" ""$here\daemon.js""" -WindowStyle Hidden
