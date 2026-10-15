# Draft lifecycle regression fixtures

`draft_overcount.json` is the anonymized recognition state at frame 194 of the
Oct 14 failure trace (52 counted picks, incomplete panels). It contains game keys
and seat coordinates, without player names or account identifiers.

`draft_scenes.json` contains 18 distinct historical screenshot samples, each at
1280×720 and its original resolution (36 cases). Only stage text and, for game
HUD samples, health/mana bars and minimap geometry remain. The text region is
stored as losslessly compressed maximum-channel greyscale; HUD regions retain
RGB. Names, avatars and chat are excluded. Source filenames and SHA-256 identify
the original screenshots; full screenshots and uploaded logs stay outside Git.
`data/draft_scene.json` contains nine small UI text templates from those sources.
These fixtures are regression evidence, not a held-out accuracy benchmark.

Run `npm run test:draft-lifecycle`. To replay an external observation trace through
recognition and the actual worker lifecycle/IPC (with expensive search stubbed):

```
node test/draft_worker.js /absolute/path/to/trace.jsonl
```

The replay checks continuity, retained pool identity and visible active state;
it does not reconstruct missing screenshot pixels. Stage detection is tested
separately using the screenshot regions. Neither test runs Dota or DirectML.
