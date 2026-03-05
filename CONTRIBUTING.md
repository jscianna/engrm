# Contributing to Engrm

Thank you for your interest in contributing to Engrm! This document provides guidelines and information for contributors.

## Code of Conduct

Be respectful, inclusive, and constructive. We're building memory for AI agents — let's make it a positive experience for humans too.

## How to Contribute

### Reporting Bugs

1. Check existing [issues](https://github.com/jscianna/engrm/issues) to avoid duplicates
2. Create a new issue with:
   - Clear title describing the bug
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (OS, Node version, etc.)

### Suggesting Features

1. Open an issue with the `enhancement` label
2. Describe the use case and why it's valuable
3. Include any relevant examples or mockups

### Pull Requests

1. **Fork** the repository
2. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes** following our code style
4. **Test** your changes:
   ```bash
   npm test
   npm run lint
   npm run typecheck
   ```
5. **Commit** with clear messages:
   ```bash
   git commit -m "feat: add memory export API"
   ```
6. **Push** to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```
7. **Open a Pull Request** against `main`

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/engrm.git
cd engrm

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local
# Fill in your environment variables

# Start development server
npm run dev
```

## Code Style

- **TypeScript** — Strict mode enabled
- **Prettier** — For formatting (runs on commit)
- **ESLint** — For linting
- **Conventional Commits** — Preferred format:
  - `feat:` — New feature
  - `fix:` — Bug fix
  - `docs:` — Documentation
  - `refactor:` — Code refactoring
  - `test:` — Adding tests
  - `chore:` — Maintenance

## Project Structure

```
engrm/
├── src/
│   ├── app/           # Next.js app router pages
│   │   └── api/       # API routes
│   ├── components/    # React components
│   ├── lib/           # Core libraries
│   │   ├── db/        # Database (Turso)
│   │   ├── embeddings.ts
│   │   ├── encryption.ts
│   │   └── ...
│   └── types/         # TypeScript types
├── docs/              # Documentation
├── scripts/           # Utility scripts
└── public/            # Static assets
```

## Areas We Need Help

### High Priority
- 🔌 **SDK Libraries** — Python, Go, Rust clients
- 🧪 **Test Coverage** — Unit and integration tests
- 📝 **Documentation** — API docs, tutorials, examples

### Medium Priority
- 🌍 **Internationalization** — Multi-language support
- ♿ **Accessibility** — A11y improvements
- 🎨 **UI/UX** — Dashboard improvements

### Always Welcome
- 🐛 Bug fixes
- ⚡ Performance improvements
- 🔒 Security enhancements

## Questions?

- Open a [Discussion](https://github.com/jscianna/engrm/discussions)
- Twitter: [@scianna](https://x.com/scianna)

## License

By contributing, you agree that your contributions will be licensed under the Apache 2.0 License.
