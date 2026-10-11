Add-Type -AssemblyName System.IO.Compression.FileSystem

$apkPath = "C:\hipk\android\app\build\outputs\apk\release\app-release.apk"
$zip = [System.IO.Compression.ZipFile]::OpenRead($apkPath)

Write-Host "Total entries in APK: $($zip.Entries.Count)"

$assetEntries = $zip.Entries | Where-Object { $_.FullName -like "assets/*" }
Write-Host "Asset entries count: $($assetEntries.Count)"

Write-Host "`n--- Assets Overview ---"
$assetEntries | Select-Object -First 40 | Format-Table FullName, Length -AutoSize

# Check if index.android.bundle exists
$bundle = $zip.Entries | Where-Object { $_.FullName -like "*index.android.bundle*" }
if ($bundle) {
    Write-Host "`nFound bundle: $($bundle.FullName) ($($bundle.Length) bytes)"
    $outDir = "C:\hipk\scratch\apk_extracted"
    if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }
    [System.IO.Compression.ZipFileExtensions]::ExtractToFile($bundle, "$outDir\index.android.bundle", $true)
    Write-Host "Extracted bundle to $outDir\index.android.bundle"
}

$zip.Dispose()
