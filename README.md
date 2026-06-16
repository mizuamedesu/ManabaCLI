# ManabaCLI

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
