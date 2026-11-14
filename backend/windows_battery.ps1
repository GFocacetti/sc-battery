# Reads the battery level Windows knows for Bluetooth game controllers (the one shown in Windows'
# Bluetooth settings) and writes it to a JSON file every minute, for controllers whose level Steam
# doesn't get (Xbox controllers). Runs hidden while Steam runs, one copy at a time.
param([string]$Out)

$mutex = New-Object System.Threading.Mutex($false, 'Local\sc-battery-windows-battery')
if (-not $mutex.WaitOne(0)) { exit }

# DEVPKEY_Bluetooth_Battery
$batteryKey = '{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2'

while (Get-Process -Name steam -ErrorAction SilentlyContinue) {
	$found = @(Get-PnpDevice -Class Bluetooth -PresentOnly -ErrorAction SilentlyContinue |
		Where-Object { $_.FriendlyName -match 'controller|gamepad' } |
		ForEach-Object {
			$battery = Get-PnpDeviceProperty -InstanceId $_.InstanceId -KeyName $batteryKey -ErrorAction SilentlyContinue
			if ($battery -and $null -ne $battery.Data) { [pscustomobject]@{ name = $_.FriendlyName; level = [int]$battery.Data } }
		})
	$json = ConvertTo-Json -InputObject $found -Compress
	[System.IO.File]::WriteAllText("$Out.tmp", $json)
	Move-Item -Force "$Out.tmp" $Out
	Start-Sleep -Seconds 60
}
Remove-Item -ErrorAction SilentlyContinue $Out
