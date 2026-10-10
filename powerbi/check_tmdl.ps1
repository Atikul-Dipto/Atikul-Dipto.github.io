<#
.SYNOPSIS
    Parse every TMDL semantic model in this folder with the real Power BI parser.

.DESCRIPTION
    Runs Microsoft.AnalysisServices.Tabular.TmdlSerializer against each
    *.SemanticModel/definition folder -- the same parser Power BI Desktop uses
    when it opens a .pbip. If this passes, Desktop will not reject the model on
    a TMDL format error.

    This exists because hand-written TMDL fails in ways no amount of static
    checking catches. Two real examples, both of which shipped before this
    script existed:

      formatString: "TRUE";;"FALSE"
          TMDL reads any value beginning with a double quote as an escaped
          quoted string, and escapes an inner quote by doubling it. Written the
          obvious way, the parser rejects the entire model. Correct spelling:
          formatString: """TRUE"";;""FALSE"""

      /// a note above a relationship
          A relationship has no Description in the object model, so a ///
          block there is "Property 'description' is unknown". TMDL has no
          plain-comment form either -- // is an unexpected line type -- so
          notes about relationships belong in the README.

    What this does NOT cover: the report layer (PBIR). There is no redistributable
    parser for it, so visual and page definitions still have to be proven by
    opening the project. Use _validate_schemas.py for those, and treat a clean
    run as necessary but not sufficient.

.PARAMETER AmoVersion
    Pin the AMO package version. Defaults to the latest on nuget.org.

.EXAMPLE
    pwsh -File check_tmdl.ps1
    powershell -ExecutionPolicy Bypass -File check_tmdl.ps1
#>
[CmdletBinding()]
param(
    [string]$AmoVersion = ""
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$cache = Join-Path $root "_amo_cache"

function Get-TmdlAssembly {
    # The parser is not redistributable with Power BI Desktop (its bin folder
    # ships no Tabular assembly), so take it from the AMO NuGet package and
    # cache it. net45 target, which Windows PowerShell 5.1 can load.
    $existing = Get-ChildItem $cache -Filter "Microsoft.AnalysisServices.Tabular.dll" `
        -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($existing) { return $existing.FullName }

    Write-Host "Fetching the Analysis Services TMDL parser (one time, ~6 MB)..."
    New-Item -ItemType Directory -Force -Path $cache | Out-Null
    $pkgId = "microsoft.analysisservices.retail.amd64"
    $version = $AmoVersion
    if (-not $version) {
        $idx = Invoke-RestMethod "https://api.nuget.org/v3-flatcontainer/$pkgId/index.json"
        $version = $idx.versions | Select-Object -Last 1
    }
    Write-Host "  AMO $version"
    $nupkg = Join-Path $cache "amo.zip"
    Invoke-WebRequest -Uri "https://api.nuget.org/v3-flatcontainer/$pkgId/$version/$pkgId.$version.nupkg" `
        -OutFile $nupkg
    Expand-Archive -Path $nupkg -DestinationPath (Join-Path $cache "pkg") -Force
    $dll = Get-ChildItem (Join-Path $cache "pkg") -Filter "Microsoft.AnalysisServices.Tabular.dll" `
        -Recurse | Where-Object { $_.FullName -like "*net45*" } | Select-Object -First 1
    if (-not $dll) { throw "Microsoft.AnalysisServices.Tabular.dll not found in the package" }
    return $dll.FullName
}

Add-Type -Path (Get-TmdlAssembly)

$models = Get-ChildItem $root -Directory -Recurse -Filter "definition" |
    Where-Object { $_.Parent.Name -like "*.SemanticModel" }

if (-not $models) { Write-Host "No semantic models found under $root"; exit 0 }

$failed = 0
foreach ($m in $models) {
    $name = $m.Parent.Name
    try {
        $db = [Microsoft.AnalysisServices.Tabular.TmdlSerializer]::DeserializeDatabaseFromFolder($m.FullName)
        $model = $db.Model
        $measures = ($model.Tables | ForEach-Object { $_.Measures.Count } | Measure-Object -Sum).Sum
        $cols = ($model.Tables | ForEach-Object { $_.Columns.Count } | Measure-Object -Sum).Sum
        Write-Host "PASS  $name"
        Write-Host ("        {0} tables, {1} columns, {2} measures, {3} relationships, {4} expressions" -f `
            $model.Tables.Count, $cols, $measures, $model.Relationships.Count, $model.Expressions.Count)

        # A relationship whose columns did not resolve parses fine and then
        # silently does nothing, so check the object model, not just the text.
        foreach ($r in $model.Relationships) {
            if (-not $r.FromColumn -or -not $r.ToColumn) {
                Write-Host "  WARN  relationship '$($r.Name)' has an unresolved column"
                $failed++
            }
        }
        foreach ($t in $model.Tables) {
            if ($t.Partitions.Count -eq 0) {
                Write-Host "  WARN  table '$($t.Name)' has no partition"
                $failed++
            }
        }
    }
    catch {
        $e = $_.Exception
        while ($e.InnerException) { $e = $e.InnerException }
        Write-Host "FAIL  $name"
        Write-Host ("        " + ($e.Message -replace "`r?`n", "`n        "))
        $failed++
    }
}

Write-Host ""
if ($failed -gt 0) {
    Write-Host "$failed problem(s). Power BI Desktop will reject this."
    exit 1
}
Write-Host "All models parse with the Power BI TMDL parser."
Write-Host "Note: this proves the semantic model only. The report layer (PBIR) is"
Write-Host "not covered and still has to be proven by opening the project."
exit 0
