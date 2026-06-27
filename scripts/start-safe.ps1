# start-safe.ps1 — Arranca o servidor Next.js matando processos presos na porta
# Uso: .\scripts\start-safe.ps1 [porta]
# Exemplo: .\scripts\start-safe.ps1 3000

param(
    [int]$Port = 3000,
    [string]$Mode = "start"  # "start" ou "dev"
)

Write-Host "`n=== CD Povoa Masters — Arranque Seguro ===" -ForegroundColor Cyan

# 1. Verificar processos na porta
Write-Host "`n[1/3] A verificar porta $Port..." -ForegroundColor Yellow

$netstatOutput = netstat -ano | Select-String ":$Port\s"
if ($netstatOutput) {
    $pids = $netstatOutput | ForEach-Object {
        ($_ -split '\s+')[-1]
    } | Sort-Object -Unique | Where-Object { $_ -match '^\d+$' -and [int]$_ -gt 0 }

    foreach ($pid in $pids) {
        $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
        if ($proc) {
            Write-Host "  Processo encontrado: PID $pid ($($proc.ProcessName))" -ForegroundColor Red
            Write-Host "  A terminar..." -ForegroundColor Red
            Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
            Start-Sleep -Milliseconds 500
            Write-Host "  Terminado." -ForegroundColor Green
        }
    }
} else {
    Write-Host "  Porta $Port livre." -ForegroundColor Green
}

# 2. Limpar processos zombie do Node (opcional — apenas os que não têm janela associada)
Write-Host "`n[2/3] A verificar processos Node zombie..." -ForegroundColor Yellow

$nodeProcs = Get-Process -Name "node" -ErrorAction SilentlyContinue
if ($nodeProcs) {
    Write-Host "  Processos Node ativos: $($nodeProcs.Count)" -ForegroundColor Cyan
    foreach ($p in $nodeProcs) {
        Write-Host "  PID $($p.Id) | Mem: $([math]::Round($p.WorkingSet/1MB, 1)) MB | Inicio: $($p.StartTime)" -ForegroundColor Gray
    }
} else {
    Write-Host "  Nenhum processo Node ativo." -ForegroundColor Green
}

# 3. Arrancar servidor
Write-Host "`n[3/3] A arrancar servidor Next.js na porta $Port..." -ForegroundColor Yellow
Write-Host "  Comando: npm run $Mode -- -p $Port`n" -ForegroundColor Gray

Set-Location "C:\cdpovoa_web"
npm run $Mode -- -p $Port
