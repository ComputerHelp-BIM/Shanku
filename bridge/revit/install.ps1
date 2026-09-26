<#
.SYNOPSIS
    Installs (or removes) Shanku Bridge for Revit for the current user.
.DESCRIPTION
    Copies Shanku.Revit.dll and its manifest to %APPDATA%\Autodesk\Revit\Addins\<version>\.
    Keeps an existing shanku_bridge_config.json. Revit must be closed.
    Run from the unzipped folder:
        Unblock-File .\install.ps1
        powershell -ExecutionPolicy RemoteSigned -File .\install.ps1
    Remove:
        powershell -ExecutionPolicy RemoteSigned -File .\install.ps1 -Uninstall
.NOTES
    Shanku Bridge 0.7.1 · Revit 2025
#>
[CmdletBinding()]
param(
    [string]$RevitVersion = '2025',
    [switch]$Uninstall
)
$ErrorActionPreference = 'Stop'

$here     = Split-Path -Parent $MyInvocation.MyCommand.Path
$addins   = Join-Path $env:APPDATA "Autodesk\Revit\Addins\$RevitVersion"
$target   = Join-Path $addins 'Shanku.Revit'
$manifest = Join-Path $addins 'Shanku.Revit.addin'

if (Get-Process -Name 'Revit' -ErrorAction SilentlyContinue) {
    Write-Warning 'Revit is running. Close Revit, then run this again.'
    exit 1
}

if ($Uninstall) {
    Remove-Item -LiteralPath $manifest -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host 'Shanku Bridge removed.'
    exit 0
}

$dll = Join-Path $here 'Shanku.Revit\Shanku.Revit.dll'
if (-not (Test-Path -LiteralPath $dll)) {
    Write-Error "Shanku.Revit.dll not found next to this script ($dll)."
    exit 1
}

New-Item -ItemType Directory -Force -Path $target | Out-Null
Copy-Item -LiteralPath $dll -Destination $target -Force
# Settings files are copied once: edits made in the add-in folder are kept on later installs.
foreach ($name in 'shanku_bridge_config.json', 'shanku_export_config.json') {
    $config = Join-Path $target $name
    if (-not (Test-Path -LiteralPath $config)) {
        Copy-Item -LiteralPath (Join-Path $here "Shanku.Revit\$name") -Destination $config
    }
}
Copy-Item -LiteralPath (Join-Path $here 'Shanku.Revit.addin') -Destination $manifest -Force

# Files from a downloaded zip carry the internet mark; clear it on what Revit loads.
Get-ChildItem -LiteralPath $target -File | Unblock-File
Unblock-File -LiteralPath $manifest

Write-Host "Installed Shanku Bridge for Revit $RevitVersion in $target"
Write-Host 'Start Revit, then Shanku tab -> Connect.'
