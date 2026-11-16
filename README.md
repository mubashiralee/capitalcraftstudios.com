# capitalcraftstudios.com

The website of CapitalCraft Studios Ltd. Plain HTML, CSS and JavaScript modules: no framework, no build step for the pages, no dependencies.

## Run it

```bash
python3 tools/dev-server.py
```

Then open http://localhost:4173.

## Test it

```bash
node --test tests/
```

The numbers behind every moving part (the plate, the stone's drop, the domino run and its camera, the Hub's floor, the sample books, the rosettes) live in modules that never touch the page, so they are tested in Node. `node tools/check-plate.mjs` checks the plate's drawing point by point.

## Publish it

Push to `main`. The workflow in `.github/workflows/publish.yml` runs the tests, puts together the published folder (`node tools/make-site.mjs _site`: the pages and what they load, without tests or tools) and deploys it to GitHub Pages. Nothing is published if a test fails or a page names a file that is not there.

## House rules

- Nothing loads from another company's servers. Each page's Content-Security-Policy enforces it: no inline scripts or styles, every asset local.
- No cookies and no trackers. The site stores only the visitor's light and speed settings and the serial of their last plate, on their own device.
- Every edition of the front page is drawn from its serial. `?e=CC26-KQX-418207` reproduces one.

## The Money Tycoon legal pages

The privacy policy and terms of service are printed from `legal/money-tycoon/*.json` by `node tools/make-legal.mjs`; change the data, not the printed pages. The wording is the same as the pages the apps link to, and the two must be kept in step: save the published page, run `python3 -I tools/import-legal.py <saved page> <its address> <date> <out.json>`, then `node tools/make-legal.mjs`.

## Fonts

Mona Sans, under the SIL Open Font License (`fonts/OFL.txt`).
