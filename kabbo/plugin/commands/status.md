---
description: Show a quick overview of your Kabbo publication pipeline
---

Give me a concise overview of my Kabbo pipeline.

Call the `get_pipeline_summary` MCP tool (or read the `kabbo://pipeline/summary`
resource). Then report, in a few lines:

- counts by stage (idea → published),
- anything stalled 30+ days that needs a nudge,
- what moved recently.

If the user passed an argument ($ARGUMENTS), treat it as a filter or follow-up
question and answer it against the same data. Keep it tight — this is a glance,
not a report.
