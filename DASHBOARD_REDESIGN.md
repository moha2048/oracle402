# Dashboard redesign: Morpho-style (task for Claude Code)

Goal: restyle and re-layout `public/index.html` so the operator dashboard looks like morpho.org: dark, minimal, premium. The demo video is recorded on this page, so it has to look good on a 1440x900 screen recording.

## Hard constraints (do not break)

- **Do not change behavior.** Every element `id` that `public/index.html`'s script uses must keep working: `b-llm b-pay b-run spent budget fill mark remaining appr maxcall gbal kill resume raise resetSpend q ask answer ledger trace modal mtext yes no`. Keep all `/api/*` calls exactly as they are (`/api/state`, `/api/ask`, `/api/kill`, `/api/resume`, `/api/budget`, `/api/reset-spend`, `/api/approve`). Do not touch `src/`.
- Keep it a single static file (`public/index.html`) with inline CSS and JS. No build step, no framework.
- Fonts: Inter (300/400/500) and JetBrains Mono (400/500) from Google Fonts, with a system-font fallback stack so the page still renders offline.
- Before starting: `git status` must be clean. Work on the file, then check it with `MOCK_GEMINI=1 MOCK_PAY=1 npm run agent` (or the project's mock dev command) and a real run to confirm the ledger, trace, approval modal and kill switch still work.
- Do not commit until I say so. Show me a summary of changes and a screenshot if you can.

## Visual language (from the Morpho reference)

**Background.** Near-black `#0b0b0c` page. A faint 1px grid (`rgba(120,150,255,0.06)`, about 48px cells) behind the main content. Small corner brackets (L-shaped 1px marks, `rgba(255,255,255,0.25)`) on the corners of the hero panel.

**Color tokens** (define as CSS variables):
- `--bg: #0b0b0c`, `--panel: transparent`, `--line: rgba(255,255,255,0.08)`
- `--text: #f5f6f8`, `--muted: #8a8f98`
- `--accent: #3b6bff` (Morpho blue). Use it for primary buttons, the budget fill line, links and focus rings only.
- `--ok: #3ddc97` for paid or settled, `--warn: #f5b942` for waiting on approval, `--danger: #ff5a5f` for the kill switch and denied or blocked rows. Use these only for status, never as decoration.

**Typography.**
- Headlines and big numbers: Inter 300, tight letter-spacing (`-0.02em`), large (hero number 72-96px).
- Body: Inter 400, 15px.
- Labels: JetBrains Mono 500, 11-12px, UPPERCASE, letter-spacing `0.12em`, color `--muted` (like TOTAL DEPOSITS / OUTSTANDING LOANS).
- Hashes, addresses, tickers, prices: JetBrains Mono.

**Panels.** No boxed cards and no drop shadows. Sections are separated by 1px `--line` dividers and generous whitespace (padding 32-48px). Buttons are pill-shaped (`border-radius: 999px`): primary is filled `--accent`, secondary is a 1px outline. Max page width about 1200px, centered.

## Layout (top to bottom)

1. **Top nav bar.** Left: "Oracle402" wordmark (a small simple SVG mark, e.g. an eye or a circle with a coin dot, plus the name). Right: status badges in mono caps. Keep the three existing status elements (`b-llm` = LLM or SCRIPTED mode, `b-pay` = LIVE PAY or MOCK PAY, `b-run` = RUNNING or KILLED) as small pills with a colored dot.
2. **Hero panel (the star of the demo).** Corner brackets, grid behind it. Left side: the headline "Agent spending, under control." (Inter 300, about 56px) and one muted sentence under it: "Pay-per-query prediction-market odds, settled in USDC on Arc." Right side, right-aligned like Morpho's stat block:
   - `SPENT` label, then the big number from `#spent` (for example `$0.004`), hero size.
   - `OF BUDGET` label, then the number from `#budget` at about half size.
   - Under them, a **thin 2px budget line** (`#fill`) that grows in `--accent` as spend rises. Keep the approval-threshold marker (`#mark`) as a small tick on the line. Turn the line `--warn` above the approval threshold and `--danger` at 100%.
3. **Stat strip.** Four borderless columns divided by 1px lines, each with a mono caps label and a medium-size number: `REMAINING` (`#remaining`), `HUMAN APPROVAL ABOVE` (`#appr`), `MAX PER CALL` (`#maxcall`), `GATEWAY BALANCE` (`#gbal`).
4. **Ask box.** A single wide input (`#q`) with an underline instead of a box, an arrow pill button (`#ask`) on the right, and the three example chips below as small outlined pills. The answer text (`#answer`) renders below in Inter 400 with generous line height, with the same markdown/line handling it has today.
5. **Controls row.** Kill switch (`#kill`) as a prominent outlined `--danger` pill with a small dot, Resume (`#resume`), Raise budget (`#raise`) and Reset spend (`#resetSpend`) as quiet secondary pills. Kill must be visible without scrolling.
6. **Ledger and Decision trace, side by side** on screens 1100px and wider, stacked below that. Each has a mono caps section title with a count. Ledger: table with no cell borders, row dividers only, columns for time, ticker, amount, status and tx or payment id in mono. Status shown as a colored dot plus text (paid, denied, awaiting approval, blocked). Trace: a vertical timeline with a thin line on the left and small dots, one entry per decision (search, buy, policy allow or deny), timestamp in mono and the reasoning in muted text.
7. **Approval modal** (`#modal`, `#mtext`, `#yes`, `#no`). Dark overlay with blur, a centered panel with a 1px border, `--warn` label "HUMAN APPROVAL REQUIRED", the existing text, and Approve (accent pill) and Deny (outline pill) buttons. A subtle pulse on the warn dot so it is noticeable on video.

## Motion and polish

- Numbers ease between values (CSS transition or a 300ms count tween) so spend visibly ticks up during the demo.
- The budget line animates its width (`transition: width .4s ease`).
- New ledger and trace rows fade and slide in once (150-250ms).
- No external images or heavy effects. Respect `prefers-reduced-motion`.
- Focus-visible rings in `--accent` on all controls.

## Responsive

Primary target is a 1440x900 recording. It must also be readable at 1024px and not break at 390px (stat strip becomes 2x2, ledger and trace stack, hero number scales down with `clamp()`).

## Acceptance checklist

- [ ] All listed ids still exist and every button still works (ask, kill, resume, raise budget, reset spend, approve, deny).
- [ ] Spent number, budget line, threshold tick, remaining, and Gateway balance update live from `/api/state`.
- [ ] Mock run (`MOCK_GEMINI=1 MOCK_PAY=1`) and a real paid run both render ledger rows and trace entries correctly.
- [ ] Approval modal appears and works; denied and blocked rows are visually distinct from paid rows.
- [ ] Looks right at 1440x900 with no scrolling needed to see hero, stat strip, ask box and kill switch (ledger and trace may be below the fold).
- [ ] No console errors; page works with the network blocked except for the font request.
- [ ] Take a 1440x900 screenshot and save it as `docs/dashboard.png` (I will use it as the Devpost thumbnail).

When done, tell me what changed and wait for my go-ahead before committing and pushing.
