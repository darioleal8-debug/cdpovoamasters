@echo off
echo [CD Povoa] A instalar dependencias via junction (fix para npm non-ASCII path bug)...
if not exist C:\cdpovoa_web (
    mklink /J C:\cdpovoa_web "G:\Repositorios\cdpovoamasters\web"
    echo Junction criado.
) else (
    echo Junction ja existe.
)
cd /d C:\cdpovoa_web
npm install %*