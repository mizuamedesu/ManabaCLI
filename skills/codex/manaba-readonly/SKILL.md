---
name: manaba-readonly
description: Operate the ManabaCLI repository safely in read-only mode for manaba course inspection, content crawling, page text extraction, and attachment downloads. Use when asked to read manaba courses, posts, course contents, bulletin board topics, assignments, surveys, reports, grades, or files through the local ManabaCLI without submitting, writing, deleting, registering, favoriting, or otherwise changing site state.
---

# Manaba Read-only

## Ground Rules

- Treat `.key` as secret. Never print, stage, commit, or paste its contents.
- Use the repository CLI instead of ad hoc browser automation when possible.
- Keep operations read-only. Do not click submit buttons or run commands intended to write, register, delete, favorite, answer, submit, or logout.
- Prefer JSON/file outputs and summarize counts in chat. Do not paste private course text or attachment contents unless explicitly asked.
- Run commands from the repository root containing `package.json`.

## Setup Check

If `manaba-readonly` is not available, use local execution:

```sh
node bin/manaba-readonly.js --help
```

If dependencies are missing:

```sh
scripts/install-skills.sh
```

## Common Commands

List courses:

```sh
manaba courses --json
```

Read one page:

```sh
manaba read <target> --json
```

List links or attachment candidates on one page:

```sh
manaba links <target> --json
manaba downloads <target> --json
```

Download a known same-origin document URL with authenticated GET:

```sh
manaba download '<url-or-path>' --out downloads
```

Full course crawl:

```sh
manaba crawl <course-id> --out manaba-export --max-pages 500
```

Use `--no-download` when only page text/HTML/JSON should be exported.

Session cache:

```sh
manaba auth setup
manaba auth login
manaba auth status
manaba auth clear
```

`auth setup` interactively writes `.key`. It prompts for URL, ID, and PASS; do not paste or summarize the saved password.

`auth login` stores Playwright session state in `.manaba-auth/`. It must not store passwords.

## Crawl Output

`crawl` writes:

- `manifest.json`: pages, attachments, skipped URLs, truncation flag
- `pages/*.html`: Playwright-rendered DOM
- `pages/*.txt`: full visible page text
- `pages/*.json`: title, URL, headings, links, forms, attachment candidates
- `attachments/*`: downloaded attachment/document URLs

Inspect `manifest.json` first and summarize only counts and coverage unless the user asks for specific content.

## Validation Pattern

After changes or before reporting completion:

```sh
npm test
node bin/manaba-readonly.js courses --json > /tmp/manaba-courses.json
```

For crawl validation, avoid exposing private text:

```sh
rm -rf /tmp/manaba-crawl-test
node bin/manaba-readonly.js crawl <course-id> --out /tmp/manaba-crawl-test --max-pages 40 > /tmp/manaba-crawl-summary.json
node -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync('/tmp/manaba-crawl-test/manifest.json','utf8'));console.log(JSON.stringify({pages:m.pages.length,attachments:m.attachments.length,skipped:m.skipped.length,truncated:m.truncated}))"
```

## Safety Expectations

The CLI should block non-GET/HEAD/OPTIONS after login and reject state-changing GET-looking URLs. If Playwright exploration is needed, add the same request guard before navigating beyond authentication.
