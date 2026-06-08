# Security Policy

## Reporting a Vulnerability

**Do not create a public GitHub issue for security vulnerabilities.**

Email: security@marsnme.com

We will acknowledge your report within 48 hours and provide a detailed response within 7 days.

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 0.1.x   | ✅         |

## Security Considerations

### For Self-Hosted Users
- Never commit `.env` files to version control
- Never expose Supabase service role keys in client-side code
- Use RLS (Row Level Security) policies in multi-user Supabase deployments
- The SQLite mode stores data locally — ensure proper file permissions on `~/.lingua-mcp/`

### For Contributors
- Never include credentials, API keys, or secrets in pull requests
- Report any security issues you discover during development
- All dependencies are checked for known vulnerabilities via `npm audit`

## Responsible Disclosure

We follow responsible disclosure practices:
- Security fixes are released as patch versions
- Credit is given to reporters (unless they prefer to remain anonymous)
- We coordinate disclosure timing with reporters
