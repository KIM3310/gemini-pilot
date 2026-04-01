# Contributing to Gemini Pilot

Contributions are welcome! Here's how to get started.

## Setup

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/<your-username>/gemini-pilot.git
   cd gemini-pilot
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Create a feature branch:
   ```bash
   git checkout -b feat/my-feature
   ```

## Development

```bash
npm run build       # Compile TypeScript
npm test            # Run all tests
npm run test:watch  # Watch mode
npm run lint        # Lint with Biome
npm run format      # Auto-format with Biome
```

## Pull Request Process

1. Make sure all tests pass and the build succeeds.
2. Follow the existing code style (2-space indent, TypeScript strict mode).
3. Write tests for new functionality.
4. Open a pull request against `main` and fill in the PR template.

## Code of Conduct

Be respectful. Keep discussions constructive and inclusive.
