# Personal Site Colby

A single-page personal site for offensive-security work: short bio, writeups, and
projects, with a small blog system. No build step, no dependencies, plain HTML/CSS.

## Structure

- `index.html`: the landing page (bio, writeups, projects, links). This is the page you share.
- `blog.html`: full list of writeups.
- `blog/`: individual posts. Copy `post-template.html` to start a new one.
- `styles.css`: all styling.
- `script.js`: sets the footer year and smooth-scrolls anchor links.
- `assets/bg.png`: background texture.

## Editing

Everything you'd change has an `EDIT` or `HOW TO ADD` comment next to it in the HTML.

**Add a writeup or project:** copy one `<li class="entry">` block in `index.html`
(and, for writeups, in `blog.html`), then change the date, title, href, and summary.

**Add a Videos link later:** uncomment the commented `<a>` line in the footer of `index.html`.

## Deploy (GitHub Pages)

1. Create a repo named `yourusername.github.io`.
2. Add these files, commit, push.
3. Settings → Pages → Deploy from branch → `main` / root.
4. Live at `https://yourusername.github.io` within a minute.

Put a `resume.pdf` in the repo root if you want to link it.
