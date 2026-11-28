# Reads the battery levels Windows knows for game controllers whose level Steam doesn't get (Xbox
# controllers) and writes them to a JSON file every minute. Runs hidden while Steam runs, one copy at a time.
# - Bluetooth controllers: the level in %, the one shown in Windows' Bluetooth settings.
# - Controllers on the Xbox Wireless Adapter: XInput only gives four steps (empty, low, medium, full),
#   written with "steps": true. Wired ones (USB cable) report no level and are left out.
param([string]$Out)

$mutex = New-Object System.Threading.Mutex($false, 'Local\sc-battery-windows-battery')
if (-not $mutex.WaitOne(0)) { exit }

# DEVPKEY_Bluetooth_Battery
$batteryKey = '{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2'

$xinput = $null
try {
	Add-Type -Namespace ScBattery -Name XInput -MemberDefinition @'
[StructLayout(LayoutKind.Sequential)]
public struct BatteryInformation { public byte BatteryType; public byte BatteryLevel; }
[DllImport("xinput1_4.dll")]
public static extern uint XInputGetBatteryInformation(uint userIndex, byte devType, ref BatteryInformation info);
'@
	$xinput = [ScBattery.XInput]
} catch {}

# XInput's BATTERY_LEVEL_EMPTY / LOW / MEDIUM / FULL
$stepLevels = @(5, 35, 65, 100)

while (Get-Process -Name steam -ErrorAction SilentlyContinue) {
	$bluetooth = @(Get-PnpDevice -Class Bluetooth -PresentOnly -ErrorAction SilentlyContinue |
		Where-Object { $_.FriendlyName -match 'controller|gamepad' } |
		ForEach-Object {
			$battery = Get-PnpDeviceProperty -InstanceId $_.InstanceId -KeyName $batteryKey -ErrorAction SilentlyContinue
			if ($battery -and $null -ne $battery.Data) { [pscustomobject]@{ name = $_.FriendlyName; level = [int]$battery.Data } }
		})
	$adapter = @()
	if ($xinput) {
		for ($i = 0; $i -lt 4; $i++) {
			$info = New-Object ScBattery.XInput+BatteryInformation
			# BATTERY_DEVTYPE_GAMEPAD; types 2 (alkaline) and 3 (NiMH) are wireless, 1 is a cable, 0 no controller
			if ($xinput::XInputGetBatteryInformation($i, 0, [ref]$info) -eq 0 -and ($info.BatteryType -eq 2 -or $info.BatteryType -eq 3)) {
				$adapter += [pscustomobject]@{ name = 'Xbox Wireless Controller'; level = $stepLevels[[Math]::Min(3, $info.BatteryLevel)]; steps = $true }
			}
		}
	}
	# A Bluetooth controller is an XInput one too: the adapter's readings count only beyond the Bluetooth ones
	$found = @($bluetooth) + @($adapter | Select-Object -Skip $bluetooth.Count)
	$json = ConvertTo-Json -InputObject $found -Compress
	[System.IO.File]::WriteAllText("$Out.tmp", $json)
	Move-Item -Force "$Out.tmp" $Out
	Start-Sleep -Seconds 60
}
Remove-Item -ErrorAction SilentlyContinue $Out
