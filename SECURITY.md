# Security

## What desprawl does with your code

It reads. `desprawl` runs `git` against the repo you point it at and reads files git tracks. It writes nothing to your repo.

Two things leave your machine, both only on a served run:

- **package names and versions** go to [osv.dev](https://osv.dev) to look up advisories
- **commit email addresses** go to the GitHub API to resolve avatars, and only for a repo GitHub already publishes the commits of

Neither happens on a saved `--static` page, which reaches nothing. `--anon` drops every commit address before anything is written or sent.

The local server binds `127.0.0.1` and requires a token that is printed once with the url. Any page on your machine can reach localhost, so that token is the barrier, not the port.

## Reporting something

Open a [security advisory](https://github.com/finnmglas/desprawl/security/advisories/new), or email <desprawl@finnmglas.com>. Please do not open a public issue for anything exploitable.

Say what you found, how to reproduce it and what it lets someone do. You will get a first answer within a week.

## Supported versions

The latest release. This is a small project, so fixes land there rather than being backported.
