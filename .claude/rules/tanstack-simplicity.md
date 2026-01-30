---
paths: apps/web/**/*.tsx, apps/web/**/*.ts
---

# TanStack Simplicity Rules

This rule applies to ALL frontend code. Before modifying files in apps/web/:

1. **Check if TanStack handles it** - Most things work out of the box
2. **Minimize additions** - Add the least code possible
3. **Avoid wrappers** - Don't wrap working primitives
4. **Research first** - When unsure, check TanStack docs via Context7

## Quick Decision Guide

| Scenario | Do This | NOT This |
|----------|---------|----------|
| Data fetching | `useSuspenseQuery` + `AsyncBoundary` | Custom loading states |
| Route protection | `beforeLoad` in route | Custom guard HOC |
| Navigation | `<Link to="...">` | Custom navigation wrapper |
| Error handling | `AsyncBoundary` with fallback | Multiple try/catch layers |
| Cache updates | Let React Query handle it | Manual invalidation logic |

## Red Flags to Watch For

If you're about to write any of these, stop and research first:

- A new file in `modules/shared/lib/` that wraps TanStack
- A custom hook that just calls another hook with defaults
- Error handling for cases TanStack already handles
- A "helper" that adds a thin layer over framework code
- Configuration that could be a framework default
