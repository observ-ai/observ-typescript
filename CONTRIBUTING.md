# Contributing to observ-typescript

Thanks for your interest in contributing to the Observ TypeScript SDK! This guide will help you understand our development process and how to contribute effectively.

## Automated Release Process

This repository uses **semantic-release** to automatically publish new versions when pull requests are merged to the main branch. This means:

- ✅ **No manual version bumps** - versions are determined automatically
- ✅ **Automatic changelog generation** - based on your commit messages  
- ✅ **Automatic npm publishing** - happens when PR is merged to main
- ✅ **GitHub releases** - created automatically with release notes

## Commit Message Format

We use **Conventional Commits** to determine version bumps and generate changelogs. Your commit messages must follow this format:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Commit Types

| Type | Description | Version Bump |
|------|-------------|--------------|
| `feat` | New feature | **Minor** (1.2.0 → 1.3.0) |
| `fix` | Bug fix | **Patch** (1.2.0 → 1.2.1) |
| `feat!` or `fix!` | Breaking change | **Major** (1.2.0 → 2.0.0) |
| `docs` | Documentation changes | None |
| `style` | Code style changes | None |
| `refactor` | Code refactoring | None |
| `test` | Test changes | None |
| `chore` | Maintenance tasks | None |

### Examples

```bash
# This will trigger a patch release (1.2.0 → 1.2.1)
git commit -m "fix: resolve JWT token parsing issue"

# This will trigger a minor release (1.2.0 → 1.3.0)
git commit -m "feat: add support for Mistral AI provider"

# This will trigger a major release (1.2.0 → 2.0.0)
git commit -m "feat!: remove deprecated withOptions method"

# This will NOT trigger a release
git commit -m "docs: update README with new examples"
```

## Development Workflow

### 1. Setting Up Development Environment

```bash
# Clone the repository
git clone https://github.com/observ-ai/observ-typescript.git
cd observ-typescript

# Install dependencies
bun install

# Build the project
bun run build

# Run tests
bun test
```

### 2. Making Changes

1. **Create a feature branch** from `main`
2. **Make your changes** following the code style
3. **Write or update tests** for your changes
4. **Ensure all checks pass**:
   ```bash
   bun run build      # Build succeeds
   bun test          # All tests pass
   bun run type-check # No type errors
   ```

### 3. Creating a Pull Request

1. **Write a clear PR title** using conventional commit format
2. **Describe your changes** in the PR description
3. **Link any related issues**
4. **Ensure CI passes** - all automated checks must pass

### 4. Release Process

When your PR is merged to `main`:

1. **Semantic-release runs automatically**
2. **Version is determined** from commit messages since last release
3. **Package is built and published to npm**
4. **GitHub release is created** with generated changelog
5. **CHANGELOG.md is updated** and committed

## Code Standards

### TypeScript Guidelines

- Use **strict TypeScript** - all code must be properly typed
- Follow **existing code patterns** and conventions
- Use **meaningful variable and function names**
- Add **JSDoc comments** for public APIs

### Testing

- Write **unit tests** for new features using Bun's test runner
- Ensure **good test coverage** of core functionality
- Mock external dependencies in tests
- Test both success and error scenarios

### Provider Integration

When adding new AI provider support:

1. **Create wrapper class** in `src/providers/`
2. **Implement chainable methods** (`withMetadata`, `withSessionId`)
3. **Add provider method** to main `Observ` class
4. **Export types** in `src/types.ts`
5. **Add to peer dependencies** in package.json
6. **Write tests** for the new provider

## Getting Help

- **Issues**: Report bugs or request features via [GitHub Issues](https://github.com/observ-ai/observ-typescript/issues)
- **Discussions**: Ask questions in [GitHub Discussions](https://github.com/observ-ai/observ-typescript/discussions)
- **Documentation**: Check our [main documentation](https://docs.observ.dev)

## Release Notes

All releases are automatically documented in:
- **GitHub Releases**: https://github.com/observ-ai/observ-typescript/releases  
- **CHANGELOG.md**: Generated automatically from commit messages
- **npm**: https://www.npmjs.com/package/observ-sdk

Thank you for contributing to Observ! 🚀