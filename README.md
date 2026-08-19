try the app :

https://mohammedali224.github.io/smart-pr-review-copilot/


# Smart PR Review Copilot

A single-page web app that turns a pasted Git diff into an instant pull request risk assessment.

## Problem

Code reviews are slow and noisy. Reviewers often spend time scanning changes to understand which pull requests require deeper attention. Small UI changes and sensitive database or authentication changes should not receive the same level of scrutiny.

## Solution

Smart PR Review Copilot gives a fast first-pass risk assessment for any Git diff. Paste a pull request diff, click **Assess Risk**, and get a risk level plus semantic impacted areas.

The demo runs locally in the browser with no sign-up, backend, database, or external setup.

## Features

- **Risk Assessment** — Classifies a diff as `Low`, `Medium`, or `High` with a color-coded result.
- **Semantic Impacted Areas** — Identifies areas such as `Authentication`, `Payments`, `Database Schema`, `Public API`, `Inventory`, and `UI Layer`.
- **Sample Diffs** — Load Low, Medium, or High-risk examples instantly.
- **Input Validation** — Handles empty input and text that does not look like a Git diff.
- **Safe Fallback** — Keeps the demo functional if an external model request fails.
- **Privacy-friendly Demo** — The current demo performs local deterministic analysis in the browser.

## Tech Stack

- HTML5
- CSS3
- Vanilla JavaScript (ES6+)
- No framework
- No build step
- No external runtime dependency

## Local Run Instructions

1. Clone or download this repository.
2. Open `index.html` in a modern browser.
3. Paste a Git diff into the input area.
4. Click **Assess Risk**.
5. Review the risk level and impacted areas.

You can also serve the folder with a static file server:

```bash
python -m http.server
```

Then open the local address shown in the terminal.

No installation or configuration is required.

## Demo Flow

1. Open `index.html`.
2. Click **Load Low** and then **Assess Risk**.
3. Confirm that the result shows a low-risk UI change.
4. Click **Load Medium** and run the assessment again.
5. Confirm that business logic areas are identified.
6. Click **Load High** and run the assessment again.
7. Confirm that sensitive areas such as database schema, payments, or authentication are highlighted.
8. Paste a real Git diff from your own repository and test it.

## AI / Vibe Coding Usage

This project was built during the Vibe Coding Arena sprint using the approved tools OpenCode and LLM Arena.

OpenCode and LLM Arena were used to generate, refine, debug, and validate the application structure, interface, prompts, and analysis flow.

The current demo includes a deterministic local fallback to keep the product functional and reliable during judging. The demo should not be described as making a live model request unless an approved model endpoint is configured.

## Limitations

This is a fast first-pass risk assessment, not a replacement for full static analysis, automated tests, or human code review.
