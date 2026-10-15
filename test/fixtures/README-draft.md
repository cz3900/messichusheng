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
`data/draft_scene.json` contains eleven small UI text templates from those sources.
These fixtures are regression evidence, not a held-out accuracy benchmark.

Run `npm run test:draft-lifecycle`. To replay an external observation trace through
recognition and the actual worker lifecycle/IPC (with expensive search stubbed):

```
node test/draft_worker.js /absolute/path/to/trace.jsonl
```

The replay checks continuity, retained pool identity and visible active state;
it does not reconstruct missing screenshot pixels. Stage detection is tested
separately using the screenshot regions. Neither test runs Dota or DirectML.

## Historical brightness and resolution tests

`draft_scenes_history.json` adds four anonymous header regions from September,
including the previously unsupported 距离选择结束还有 prompt and a real 960×540
capture. Together the two fixture files contain 40 cases from 22 original images.
Two of the new regions supply additional choice-prompt templates.

Run `npm run test:draft-robustness`. The three scripts check 80 lifecycle conflict
combinations, three conflicting real-pixel cue combinations, 360 native-size
photometric cases and a deterministic resize/brightness matrix. Dim HUD misses
are reported separately as conservative waits; a safety pass is not 100% scene
recognition. Pixel brightness perturbations do not simulate monitor backlight,
HDR capture or a game renderer running at another resolution.

For a larger private dataset, `test/draft_robustness.js` accepts a JSON manifest:

```
node test/draft_robustness.js /absolute/path/manifest.json --out=/absolute/path/results.json
```

Each manifest item supplies `id`, optional `label`, `sha256`, and `regionsPath`
pointing to a region JSON in the fixture schema. Set `cross` to a boolean to pin
cross-product membership for comparisons. Labels are independent references;
unlabeled cases are measured but cannot establish classification correctness.
The optional `--baseline` flag runs only original pixels at native dimensions.

`tools/debug_draft/real_pixel_worker.js` accepts full PNG paths and runs the real
worker without recognition mocks. It first requires a successful pool lock,
then feeds dimmed, brightened and restored frames. Search is disabled through
normal visibility IPC. These checks do not run Windows, Dota or DirectML.
