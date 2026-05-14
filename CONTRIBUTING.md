# Contributing

Thanks for your interest in improving the WhisperGraph MCP server.

## Development setup

```bash
npm install
npm run dev        # run from source over stdio
npm test           # unit + integration tests (no API key needed)
npm run lint
npm run typecheck
npm run build
```

The test suite runs entirely offline against a fake backend, so you can develop
and test without a WhisperGraph API key.

## Pull requests

- Branch from `main` and open a PR against `main`.
- Keep PRs focused; one logical change per PR.
- Run `npm run lint`, `npm run typecheck`, and `npm test` before pushing — CI
  runs all three.
- Add or update tests for any behavior change.
- Use [Conventional Commits](https://www.conventionalcommits.org/) for commit
  messages (`feat:`, `fix:`, `docs:`, `chore:`, …). This keeps the changelog
  readable.

## Releases

Releases are version-driven: the version in `package.json` is the source of
truth. To cut a release, bump `package.json`, add a `CHANGELOG.md` entry, and
merge to `main` — the release workflow publishes to npm, GitHub Container
Registry, and the MCP registry when it sees a new version.

## Developer Certificate of Origin

By contributing, you certify that your contribution complies with the
[Developer Certificate of Origin](https://developercertificate.org/). Sign off
your commits with `git commit -s`.

## Code of Conduct

This project follows the [Contributor Covenant](./CODE_OF_CONDUCT.md). By
participating, you agree to uphold it.
