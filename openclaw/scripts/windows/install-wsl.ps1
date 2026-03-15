$ErrorActionPreference = "Stop"

$currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($currentIdentity)
$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
  throw "Run this script from an elevated PowerShell window. WSL2 installation needs administrator rights."
}

wsl --install -d Ubuntu

Write-Host ""
Write-Host "If Windows asks for a reboot, do that first."
Write-Host "Then open Ubuntu and run:"
Write-Host "  cd /mnt/c/Users/ripot/Desktop/projects/openclaw"
Write-Host "  bash scripts/wsl/install-openclaw.sh"
