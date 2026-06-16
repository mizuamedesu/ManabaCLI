# ManabaCLI

[![技術者倫理 遵守済み](https://img.shields.io/badge/%E6%8A%80%E8%A1%93%E8%80%85%E5%80%AB%E7%90%86-%E9%81%B5%E5%AE%88%E6%B8%88%E3%81%BF-0a0a0a?style=for-the-badge&labelColor=ffffff)](https://技術者倫理.com)

Read-only command line client for manaba. It uses Playwright to sign in with
the credentials in `.key`, then blocks non-read requests before reading pages or
downloading files.

## `.key`

```text
ID=your-id
PASS=your-password

https://manaba.tsukuba.ac.jp/
```

`.key` is ignored by git.

## Usage

```sh
npm install
npx playwright install chromium
npm link

manaba-readonly courses
manaba-readonly read home
manaba-readonly read 12345
manaba-readonly links 12345
manaba-readonly downloads 12345
manaba-readonly download 'https://manaba.tsukuba.ac.jp/doc/...' --out downloads
manaba-readonly crawl 12345 --out manaba-export
```

Targets can be `home`, a numeric course id, `course_12345`, a site-relative
path, or an absolute URL.

## Read-only guard

After authentication, the browser context rejects:

- `POST`, `PUT`, `PATCH`, `DELETE`, and other non-read methods
- GET URLs that look state-changing, such as logout, favorite toggles,
  self-registration, or add/edit/delete/submit actions

The CLI does not click submit buttons after login. Downloads are fetched through
an authenticated GET request using Playwright's browser context cookies.

## Full Course Crawl

`crawl` recursively follows safe same-course GET links discovered in the rendered
DOM. It saves:

- `manifest.json`: page list, attachment list, skipped URLs, and truncation flag
- `pages/*.html`: rendered DOM from Playwright
- `pages/*.txt`: full visible text for each page
- `pages/*.json`: title, URL, headings, links, forms, and attachment candidates
- `attachments/*`: downloaded same-origin attachment/document URLs

Useful options:

```sh
manaba-readonly crawl 12345 --out manaba-export --max-pages 500
manaba-readonly crawl 12345 --no-download
manaba-readonly crawl home --scope site --max-pages 100
```

## Agent Skills

Install the Codex and Claude Code operation skills, plus CLI dependencies, in
one command:

```sh
scripts/install-skills.sh
```

To install only the skills:

```sh
scripts/install-skills.sh --skills-only
```
