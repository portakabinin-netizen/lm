Add-Type -AssemblyName System.IO.Compression.FileSystem

$apkPath = "C:\hipk\android\app\build\outputs\apk\release\app-release.apk"
$zip = [System.IO.Compression.ZipFile]::OpenRead($apkPath)
$outDir = "C:\hipk\scratch\apk_extracted"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }

$entriesToExtract = @("assets/app.config", "assets/app.manifest", "AndroidManifest.xml")
foreach ($name in $entriesToExtract) {
    $entry = $zip.GetEntry($name)
    if ($entry) {
        $dest = Join-Path $outDir ($entry.Name)
        [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $dest, $true)
        Write-Host "Extracted: $name -> $dest ($($entry.Length) bytes)"
    }
}

$zip.Dispose()
