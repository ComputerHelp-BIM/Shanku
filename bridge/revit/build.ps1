<#
.SYNOPSIS
    Builds Shanku Bridge for Revit and assembles the install folder in .\dist.
.DESCRIPTION
    Needs the .NET 8 SDK. Revit's API comes from reference packages; Revit itself is not needed to build.
    Also runs the tests of the parts that do not need Revit.
#>
[CmdletBinding()]
param([switch]$SkipTests)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not $SkipTests) {
    dotnet test (Join-Path $here 'Shanku.Revit.Tests') -c Release
    if ($LASTEXITCODE -ne 0) { Write-Error 'Tests failed.'; exit 1 }
}
dotnet build (Join-Path $here 'Shanku.Revit') -c Release
if ($LASTEXITCODE -ne 0) { Write-Error 'Build failed.'; exit 1 }

$out  = Join-Path $here 'Shanku.Revit\bin\Release\net8.0-windows'
$dist = Join-Path $here 'dist\Shanku.Revit'
New-Item -ItemType Directory -Force -Path $dist | Out-Null
Copy-Item -LiteralPath (Join-Path $out 'Shanku.Revit.dll') -Destination $dist -Force
Copy-Item -LiteralPath (Join-Path $out 'shanku_bridge_config.json') -Destination $dist -Force
Copy-Item -LiteralPath (Join-Path $here 'Shanku.Revit.addin') -Destination (Join-Path $here 'dist') -Force
Copy-Item -LiteralPath (Join-Path $here 'install.ps1') -Destination (Join-Path $here 'dist') -Force
Copy-Item -LiteralPath (Join-Path $here 'README.md') -Destination (Join-Path $here 'dist') -Force
Write-Host "Ready in $(Join-Path $here 'dist')"
