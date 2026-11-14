# SC-Battery

A Millennium plugin that shows the battery level of the connected Steam Controller in the top bar of the Steam desktop client, the way Big Picture already does.

## Features

- A controller icon with Steam's own battery gauge (the one Big Picture uses) and the percentage, or either of them alone, right next to the news and notification buttons.
- The gauge shows charging and turns red below 15%.
- Every Steam Controller connected at the same time gets its own indicator; with more than one, each shows its player number on a dot of its LED colour.
- Other wireless controllers too (turn off "Steam Controller only"), with the icon of their model. Steam gets no level for Xbox controllers, so for those connected over Bluetooth the level Windows reports is used instead, read every minute by a small hidden helper while Steam runs.
- Optionally shows any other wireless controller Steam reports a battery for.
- Click the indicator for a battery chart: scroll to zoom from the last hour to the last 30 days, hover for the level at any reading, and see the average drain with an estimate of the time left.
- The history is kept across Steam restarts. While a controller is off, the chart joins the last reading before and the first one after with a dashed line; a green dot marks a charge done in the meantime.
- A level is recorded once it has held for 15 seconds, so the placeholder Steam shows right after a controller connects never reaches the chart.
- Separate drain figures in game and outside games (any running game counts, non-Steam ones too), with the play time left.

The level comes from Steam itself (the same value Big Picture shows), as reported by the controller firmware.

## Settings

The switches for what the indicator shows (colour, numbers, controller icons, battery, percentage) are in Millennium's plugin panel (pick **SC-Battery**), together with **Steam Controller only**. The same switches above the chart apply to that controller alone; **Use general settings** brings it back in line.

## Building

```
pnpm install
npm run build
```

Copy `plugin.json`, `backend/` and `.millennium/Dist` into `Steam\millennium\plugins\sc-battery`, then restart Steam.

The battery history is stored in `data/history.json` inside the plugin folder; readings older than 31 days are dropped.

## License

GPL-3.0-only. See [LICENSE](LICENSE).
