$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$src = Join-Path $PSScriptRoot "..\\src\\app\\icon.png"
$src = (Resolve-Path $src).Path

$outDir = Join-Path $PSScriptRoot "..\\public\\icons"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$img = [System.Drawing.Image]::FromFile($src)
try {
  foreach ($size in @(192, 512)) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    try {
      $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $g.Clear([System.Drawing.Color]::Transparent)
      $g.DrawImage($img, 0, 0, $size, $size)
      $dest = Join-Path $outDir ("icon-$size.png")
      $bmp.Save($dest, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $g.Dispose()
      $bmp.Dispose()
    }
  }
} finally {
  $img.Dispose()
}

Get-ChildItem $outDir | Select-Object Name, Length

