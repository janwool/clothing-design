# 3D Pants Generator — full-page design

Route: `/tools/3d-pants-generator`.

Design reference: `design-mockups/3d-pants-generator-v2.png`, generated with the built-in image tool. Prompt: `docs/3d-pants-generator-v2-prompt.md`.

## Implementation

Dedicated template, scoped styles and controller replace the generic tool landing. Six sections: preview studio, model selection, workflow, use cases, FAQ, final editor entry. Each section occupies at least one available viewport on desktop. Mobile sections grow to fit content. The existing navigation and footer are retained.

3D starts automatically with a real product cover while loading. Retry appears only on failure. Color and camera choices made during loading are applied when ready. Selecting another model updates the preview, selection state, and all editor links. Artwork and account-specific exports remain in the existing editor.

## Intentional differences from the reference

- Per user request, sections have substantially more space and each occupies a screen.
- Models and garment images come from the active catalog, so their shapes differ from the illustrative mockup.
- Copy describes actual editor capabilities. No claims about garment geometry generation, hardware editing, or production readiness.
- Existing site navigation, promotion and footer are preserved.

## Validation

Browser checks: automatic loading, model switching with synchronized editor links, side view, olive color, desktop section heights, and mobile layout without horizontal overflow. Related landing and SEO tests: 12 passed.
