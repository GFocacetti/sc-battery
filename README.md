# SC-Battery

A Millennium plugin that shows the battery level of the connected Steam Controller in the top bar of the Steam desktop client, the way Big Picture already does.

## Features

- A controller icon with Steam's own battery gauge (the one Big Picture uses) and the percentage, or either of them alone, right next to the news and notification buttons.
- The gauge shows charging and turns red below 15%.
- Every Steam Controller connected at the same time gets its own indicator.
- Optionally shows any other wireless controller Steam reports a battery for.
- Click the indicator for a battery chart: scroll to zoom from the last hour to the last 30 days, hover for the level at any reading, and see the average drain with an estimate of the time left.
- The history is kept across Steam restarts. While a controller is off, the chart joins the last reading before and the first one after with a dashed line; a green dot marks a charge done in the meantime.
- A level is recorded once it has held for 15 seconds, so the placeholder Steam shows right after a controller connects never reaches the chart.
- Separate drain figures in game and outside games (any running game counts, non-Steam ones too), with the play time left.

The level comes from Steam itself (the same value Big Picture shows), as reported by the controller firmware.

## Settings

Open Millennium's plugin panel and pick **SC-Battery**:

- **Show**: icon and percentage, icon only, or percentage only.
- **Steam Controller only**: turn off to include other wireless controllers.

## Building

```
pnpm install
npm run build
```

Copy `plugin.json`, `backend/` and `.millennium/Dist` into `Steam\millennium\plugins\sc-battery`, then restart Steam.

The battery history is stored in `data/history.json` inside the plugin folder; readings older than 31 days are dropped.

## License

GPL-3.0-only. See [LICENSE](LICENSE).
