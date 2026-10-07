# Server locale minimo per provare l'app e usare gli strumenti di verifica.
# Uso: powershell -ExecutionPolicy Bypass -File strumenti\server.ps1   poi apri http://localhost:8777
param([string]$Root = (Split-Path -Parent $PSScriptRoot), [int]$Port = 8777)
$l = New-Object System.Net.HttpListener
$l.Prefixes.Add("http://localhost:$Port/")
$l.Start()
Write-Host "Laboratorio di gravitazione su http://localhost:$Port/  (cartella: $Root)  - Ctrl+C per fermare"
$tipi = @{ ".html" = "text/html; charset=utf-8"; ".js" = "text/javascript; charset=utf-8"; ".css" = "text/css; charset=utf-8"; ".json" = "application/json"; ".md" = "text/plain; charset=utf-8" }
while ($l.IsListening) {
  $ctx = $l.GetContext()
  $p = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
  if ($p -eq "") { $p = "index.html" }
  $f = Join-Path $Root $p
  if ((Test-Path $f -PathType Leaf) -and ([IO.Path]::GetFullPath($f).StartsWith([IO.Path]::GetFullPath($Root)))) {
    $b = [IO.File]::ReadAllBytes($f)
    $ext = [IO.Path]::GetExtension($f)
    $ctx.Response.ContentType = $(if ($tipi[$ext]) { $tipi[$ext] } else { "application/octet-stream" })
    $ctx.Response.Headers.Add("Cache-Control", "no-store")
    $ctx.Response.OutputStream.Write($b, 0, $b.Length)
  } else { $ctx.Response.StatusCode = 404 }
  $ctx.Response.Close()
}
