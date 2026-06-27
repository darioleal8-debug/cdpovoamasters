# kill-port.ps1 — Mata tudo o que estiver a usar uma porta
# Uso: .\scripts\kill-port.ps1 3000

param([int]$Port = 3000)

$found = $false
$netstat = netstat -ano | Select-String ":$Port\s"

if (-not $netstat) {
    Write-Host "Porta $Port esta livre." -ForegroundColor Green
    exit 0
}

$pids = $netstat | ForEach-Object {
    ($_ -split '\s+')[-1]
} | Sort-Object -Unique | Where-Object { $_ -match '^\d+$' -and [int]$_ -gt 0 }

foreach ($pid in $pids) {
    $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
    if ($proc) {
        Write-Host "Terminando: PID $pid ($($proc.ProcessName))" -ForegroundColor Red
        Stop-Process -Id $pid -Force
        $found = $true
    }
}

if ($found) {
    Start-Sleep -Milliseconds 300
    $check = netstat -ano | Select-String ":$Port\s"
    if ($check) {
        Write-Host "AVISO: Porta $Port ainda em uso!" -ForegroundColor Red
    } else {
        Write-Host "Porta $Port libertada com sucesso." -ForegroundColor Green
    }
}
