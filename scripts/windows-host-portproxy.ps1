# Run this in an elevated PowerShell on the real Windows host, not inside WSL
# and not inside the VMware Windows 10 guest.
#
# It exposes WSL/Docker dev ports to LAN clients such as the domain-joined
# Windows 10 VM. By default the proxy target is the current WSL IP, not
# Windows loopback. Re-run after WSL restarts because the WSL IP can change.

param(
  [string]$WslIp = "",
  [int[]]$Ports = @(3000, 3100, 3200, 3300, 3400, 8000, 8080),
  [string]$ListenAddress = "",
  [string]$ConnectAddress = "wsl",
  [string]$CanonicalHost = "app.ecommerce.local",
  [switch]$UpdateHostsFile,
  [switch]$AllowAllWslInbound,
  [switch]$SkipHyperVFirewall,
  [switch]$SkipChecks
)

$ErrorActionPreference = "Stop"

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Open PowerShell as Administrator on the real Windows host, then run this script again."
}

if ([string]::IsNullOrWhiteSpace($WslIp)) {
  $raw = (wsl.exe sh -lc "hostname -I") 2>$null
  if (-not $raw) {
    throw "Could not read WSL IP. Start WSL first, then run this script again."
  }
  $WslIp = (($raw.Trim() -split "\s+") | Where-Object {
      $_ -match "^\d{1,3}(\.\d{1,3}){3}$" -and $_ -notmatch "^(127|169\.254)\."
    } | Select-Object -First 1)
  if (-not $WslIp) {
    throw "Could not find an IPv4 WSL address from: $raw"
  }
}

function Remove-PortProxy {
  param([int]$Port, [string[]]$Addresses)

  foreach ($address in ($Addresses | Where-Object { $_ } | Select-Object -Unique)) {
    netsh interface portproxy delete v4tov4 listenaddress=$address listenport=$Port 2>$null | Out-Null
  }
}

function Test-Port {
  param([string]$HostName, [int]$Port)

  $result = Test-NetConnection -ComputerName $HostName -Port $Port -InformationLevel Quiet -WarningAction SilentlyContinue
  if ($result) {
    Write-Host "OK   TCP $HostName`:$Port"
  } else {
    Write-Warning "FAIL TCP $HostName`:$Port"
  }
}

function Invoke-CurlHead {
  param([string]$Url, [string]$ResolveRule = "")

  $curlArgs = @(
    "--head",
    "--silent",
    "--show-error",
    "--noproxy", "*",
    "--connect-timeout", "3",
    "--max-time", "8"
  )
  if (-not [string]::IsNullOrWhiteSpace($ResolveRule)) {
    $curlArgs += @("--resolve", $ResolveRule)
  }
  $curlArgs += $Url

  $previousErrorActionPreference = $ErrorActionPreference
  $output = @()
  $exitCode = 1
  try {
    # curl.exe writes diagnostics to stderr. Keep that as output for reporting,
    # but never let it abort the whole portproxy setup.
    $ErrorActionPreference = "Continue"
    $output = & curl.exe @curlArgs 2>&1
    $exitCode = $LASTEXITCODE
  } catch {
    $output = @($_.Exception.Message)
    if ($LASTEXITCODE -is [int] -and $LASTEXITCODE -ne 0) {
      $exitCode = $LASTEXITCODE
    }
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }

  [pscustomobject]@{
    ExitCode = $exitCode
    Output = @($output | ForEach-Object { "$_" })
  }
}

function Test-Http {
  param([string]$HostName, [int]$Port, [string]$ResolveAddress = "")

  $url = "http://${HostName}:$Port/"
  $resolveRule = ""
  if (-not [string]::IsNullOrWhiteSpace($ResolveAddress)) {
    $resolveRule = "${HostName}:${Port}:${ResolveAddress}"
  }

  $result = Invoke-CurlHead -Url $url -ResolveRule $resolveRule
  $output = @($result.Output)
  if ($result.ExitCode -eq 0 -and ($output -match "HTTP/")) {
    $status = ($output | Where-Object { $_ -match "^HTTP/" } | Select-Object -First 1)
    Write-Host "OK   HTTP $url -> $status"
  } else {
    $lastLine = ($output | Select-Object -Last 1)
    Write-Warning "FAIL HTTP $url exit=$($result.ExitCode) $lastLine"
  }
}

function Get-HostnameAddresses {
  param([string]$HostName)

  try {
    return [System.Net.Dns]::GetHostAddresses($HostName) |
      Where-Object { $_.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork } |
      ForEach-Object { $_.IPAddressToString }
  } catch {
    return @()
  }
}

function Set-HostsFileEntry {
  param([string]$HostName, [string]$IPAddress)

  $hostsPath = Join-Path $env:SystemRoot "System32\drivers\etc\hosts"
  try {
    $escapedHost = [regex]::Escape($HostName)
    $activeHostLinePattern = "(?i)^\s*\d{1,3}(\.\d{1,3}){3}\s+.*(^|\s)$escapedHost(\s|$)"
    $newLine = "$IPAddress $HostName"
    $lines = @()
    if ([System.IO.File]::Exists($hostsPath)) {
      $lines = @([System.IO.File]::ReadAllLines($hostsPath))
    }

    $updated = @()
    $written = $false
    foreach ($line in $lines) {
      if ($line -notmatch "^\s*#" -and $line -match $activeHostLinePattern) {
        if (-not $written) {
          $updated += $newLine
          $written = $true
        }
      } else {
        $updated += $line
      }
    }
    if (-not $written) {
      $updated += $newLine
    }

    $hostsItem = Get-Item -LiteralPath $hostsPath -ErrorAction SilentlyContinue
    if ($hostsItem -and $hostsItem.IsReadOnly) {
      $hostsItem.IsReadOnly = $false
    }

    [System.IO.File]::WriteAllLines($hostsPath, [string[]]$updated, [System.Text.Encoding]::ASCII)
    Write-Host "Updated Windows hosts file: $HostName -> $IPAddress"
  } catch {
    Write-Warning "Could not update Windows hosts file ($hostsPath): $($_.Exception.Message)"
    Write-Warning "Continuing without changing hosts. You can update it manually, or rely on the DC DNS A record for $HostName."
  }
}

function Get-PrimaryLanIp {
  $route = Get-NetRoute -DestinationPrefix "0.0.0.0/0" -ErrorAction Stop |
    Where-Object { $_.NextHop -ne "0.0.0.0" } |
    Sort-Object RouteMetric, InterfaceMetric |
    Select-Object -First 1

  if ($route) {
    $ip = Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex $route.InterfaceIndex -ErrorAction Stop |
      Where-Object { $_.IPAddress -notmatch "^(127|169\.254)\." } |
      Select-Object -First 1 -ExpandProperty IPAddress
    if ($ip) {
      return $ip
    }
  }

  return Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
    Where-Object {
      $_.IPAddress -notmatch "^(127|169\.254)\." -and
      $_.InterfaceAlias -notmatch "vEthernet|VMware|Loopback"
    } |
    Sort-Object InterfaceAlias, IPAddress |
    Select-Object -First 1 -ExpandProperty IPAddress
}

if ([string]::IsNullOrWhiteSpace($ListenAddress)) {
  $ListenAddress = Get-PrimaryLanIp
  if (-not $ListenAddress) {
    throw "Could not detect a LAN IPv4 listen address. Pass -ListenAddress manually."
  }
}

if ([string]::IsNullOrWhiteSpace($ConnectAddress) -or $ConnectAddress -eq "auto" -or $ConnectAddress -eq "wsl") {
  $ConnectAddress = $WslIp
}

if ($ConnectAddress -match "^127\." -and ($ListenAddress -eq "0.0.0.0" -or $ListenAddress -match "^127\.")) {
  throw "When ConnectAddress is loopback, ListenAddress must be a concrete LAN IP, not $ListenAddress."
}

$localAddresses = @("0.0.0.0", "127.0.0.1", $ListenAddress)
$PortStrings = $Ports | ForEach-Object { [string]$_ }
try {
  $localAddresses += Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
    Select-Object -ExpandProperty IPAddress
} catch {
  Write-Warning "Could not enumerate local IPv4 addresses: $($_.Exception.Message)"
}

Write-Host "Using WSL IP: $WslIp"
Write-Host "Using listen address: $ListenAddress"
Write-Host "Using connect address: $ConnectAddress"

foreach ($port in $Ports) {
  Remove-PortProxy -Port $port -Addresses $localAddresses
  netsh interface portproxy add v4tov4 listenaddress=$ListenAddress listenport=$port connectaddress=$ConnectAddress connectport=$port | Out-Null
  Write-Host "Port $ListenAddress`:$port -> $ConnectAddress`:$port"
}

$ruleName = "Ecommerce Platform WSL dev ports"
$existingRule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($existingRule) {
  Remove-NetFirewallRule -DisplayName $ruleName
}
New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Ports | Out-Null

if (-not $SkipHyperVFirewall -and (Get-Command New-NetFirewallHyperVRule -ErrorAction SilentlyContinue)) {
  # Microsoft documents this fixed creator id for WSL.
  $wslVmCreatorId = "{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}"

  if ($AllowAllWslInbound -and (Get-Command Set-NetFirewallHyperVVMSetting -ErrorAction SilentlyContinue)) {
    try {
      Set-NetFirewallHyperVVMSetting -Name $wslVmCreatorId -DefaultInboundAction Allow
      Write-Host "Set Hyper-V firewall DefaultInboundAction=Allow for WSL."
    } catch {
      Write-Warning "Could not set Hyper-V firewall default inbound action for WSL: $($_.Exception.Message)"
    }
  }

  $hyperVRuleName = "EcommercePlatformWslDevPorts"
  try {
    Remove-NetFirewallHyperVRule -Name $hyperVRuleName -ErrorAction SilentlyContinue | Out-Null
    New-NetFirewallHyperVRule `
      -Name $hyperVRuleName `
      -DisplayName "Ecommerce Platform WSL dev ports" `
      -Direction Inbound `
      -VMCreatorId $wslVmCreatorId `
      -Protocol TCP `
      -LocalPorts $PortStrings `
      -Action Allow | Out-Null
    Write-Host "Added Hyper-V firewall rule for WSL inbound ports."
  } catch {
    Write-Warning "Could not add Hyper-V firewall rule for WSL: $($_.Exception.Message)"
    Write-Warning "If Windows cannot connect to the WSL IP on ports 3000-3400, run this script on Windows 11 with PowerShell Admin."
  }
}

Write-Host ""
Write-Host "Current portproxy table:"
netsh interface portproxy show v4tov4

Write-Host ""
Write-Host "Current Windows IPv4 addresses that may be used in the DC DNS A record:"
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notmatch "^(127|169\.254)\." } |
  Sort-Object InterfaceAlias, IPAddress |
  Format-Table -AutoSize InterfaceAlias, IPAddress

if (-not [string]::IsNullOrWhiteSpace($CanonicalHost)) {
  if ($UpdateHostsFile) {
    Set-HostsFileEntry -HostName $CanonicalHost -IPAddress $ListenAddress
  }

  Write-Host ""
  Write-Host "Kerberos hostname resolution on this Windows host:"
  $canonicalAddresses = @(Get-HostnameAddresses -HostName $CanonicalHost)
  if ($canonicalAddresses.Count -eq 0) {
    Write-Warning "$CanonicalHost does not resolve on this Windows host."
  } else {
    Write-Host "$CanonicalHost -> $($canonicalAddresses -join ', ')"
    if ($canonicalAddresses -notcontains $ListenAddress) {
      Write-Warning "$CanonicalHost should resolve to $ListenAddress for this lab. Update the DC DNS A record or rerun this script with -UpdateHostsFile for host-only testing."
    }
  }
}

if (-not $SkipChecks) {
  Write-Host ""
  Write-Host "HTTP checks from Windows host directly to portproxy backend:"
  foreach ($port in $Ports) {
    Test-Http -HostName $ConnectAddress -Port $port
  }

  Write-Host ""
  Write-Host "Diagnostic TCP checks from Windows host to WSL IP:"
  foreach ($port in $Ports) {
    Test-Port -HostName $WslIp -Port $port
  }

  Write-Host ""
  Write-Host "TCP checks through portproxy listen address:"
  foreach ($port in $Ports) {
    Test-Port -HostName $ListenAddress -Port $port
  }

  Write-Host ""
  Write-Host "HTTP checks through portproxy listen address:"
  foreach ($port in $Ports) {
    Test-Http -HostName $ListenAddress -Port $port
  }

  if (-not [string]::IsNullOrWhiteSpace($CanonicalHost)) {
    Write-Host ""
    Write-Host "HTTP checks with Kerberos hostname forced to portproxy listen address:"
    foreach ($port in $Ports) {
      Test-Http -HostName $CanonicalHost -Port $port -ResolveAddress $ListenAddress
    }
  }
}

Write-Host ""
Write-Host "For Kerberos/SPNEGO, open http://${CanonicalHost}:<port>, not the raw IP address."
Write-Host "Update the DC DNS A record $CanonicalHost to $ListenAddress, then flush DNS in the Windows 10 VM."
Write-Host "If the real Windows host itself cannot resolve $CanonicalHost, rerun with -UpdateHostsFile or edit the hosts file as Administrator."
