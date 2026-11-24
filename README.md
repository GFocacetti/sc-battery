# SC-Battery

A Millennium plugin that shows the battery level of your controllers in the top bar of the Steam desktop client, the way Big Picture already does.

**Tested controllers:** Steam Controller, PlayStation (DualShock 4) and Xbox. Steam Controllers are shown by default; turn off **Steam Controller only** for the others.

## Features

- A controller icon with Steam's own battery gauge (the one Big Picture uses) and the percentage, or either of them alone, right next to the news and notification buttons.
- The gauge shows charging and turns red below 15%.
- Every controller connected at the same time gets its own indicator; with more than one, each shows its player number on a coloured dot. The dot takes the LED colour set in Steam, or any colour you pick for that controller.
- Each controller shows the icon of its model. For Xbox controllers Steam gets no level, so the level Windows reports is used instead, read every minute by a small hidden helper while Steam runs.
- Click the indicator for a battery chart:
  - scroll to zoom, from the last hour to the last 30 days;
  - drag with the left button to move through the past, double click to come back to now;
  - hover for the level at any reading;
  - average drain in game and outside games (any running game counts, non-Steam ones too), with an estimate of the play time left.
- The history is kept across Steam restarts. While a controller is off, the chart joins the last reading before and the first one after with a dashed line; a green dot marks a charge done in the meantime.
- Steam briefly reports 100% when a controller connects. Those false readings never reach the chart: a level is recorded once it has held for 15 seconds, and a 100% that falls back to the level it came from (within 5%) is dropped.

The level comes from Steam itself (the same value Big Picture shows), as reported by the controller firmware.

## Settings

The general switches (colour, numbers, controller icons, battery, percentage, **Steam Controller only**) are in the plugin's settings in Millennium (pick **SC-Battery**).

Each controller can also have its own: open its chart and click **Options**. There you can pick the controller, switch the parts of its indicator on and off, choose the colour of its dot, and go back to the general settings with **Use general settings**.

## Installing

1. Download `sc-battery-0.1.zip` from the [latest release](../../releases/latest).
2. Extract it into `Steam\millennium\plugins`, so that you get `Steam\millennium\plugins\sc-battery\plugin.json`.
3. Restart Steam and turn the plugin on in Millennium's plugin list.

## Building

```
pnpm install
pnpm run build
```

Copy `plugin.json`, `backend/` and `.millennium/Dist` into `Steam\millennium\plugins\sc-battery`, then restart Steam.

The battery history is stored in `data/history.json` inside the plugin folder; readings older than 31 days are dropped.

## License

GPL-3.0-only. See [LICENSE](LICENSE).
