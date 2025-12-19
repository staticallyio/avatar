<p align="center">
  <a href="https://statically.io/screenshot/">
    <img src="https://statically.io/images/branding/statically-mark.svg" alt="Statically" height="80"/>
  </a>
</p>

<h1 align="center">Avatar</h1>

<p align="center">A simple, beautiful, and high-quality avatar service on Cloudflare Workers.</p>

<p align="center">
  <a href="https://statically.io">statically.io</a>
  <br /><br />
	<a href="https://x.com/staticallyio">
    <img src="https://img.shields.io/twitter/follow/staticallyio?label=Follow&style=social" alt="X" />
  </a>
  <a href="https://www.patreon.com/fransallen">
    <img src="https://img.shields.io/badge/donate-Patreon-ff69b4" alt="Donate" />
  </a>
</p>

## How to use

`http://localhost:8787/avatar/:initials`

### Parameters

- `:initials` the initials to display (e.g., `JD` for John Doe)
- `?s=` change avatar size
- `?shape=circle` use circle shape
- `?shape=rounded` use rounded shape

## Development

Run dev server:

```bash
bun run dev
```
