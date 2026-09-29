# Workbench redesign · v2

Generated with the built-in imagegen tool on 2026-09-29. The three images are design references; project names, portraits, dates, and counts in them are illustrative. The implementation reads saved projects and account data.

## Prompt set

- **3D Projects:** Full high-fidelity desktop ClozDesign Workbench page with exactly three navigation destinations: 3D Projects, Fashion Mockups, Account. Monochrome fashion software style, project count, create action, search, sort, realistic garment previews, dates and action menus. Include no-results and rename states. No other navigation, invented capabilities, AI decoration, gradients, or marketing slogans.
- **Fashion Mockups:** Full high-fidelity desktop ClozDesign Workbench page with the same three destinations and visual style. Include mockup count, create action, search, sort, realistic on-model previews, dates and actions, plus empty and mobile states. No other navigation or invented capabilities.
- **Account:** Full high-fidelity desktop ClozDesign Workbench page with the same three destinations. Include profile fields and save action, free membership state with Upgrade to Pro, paid membership state with Cancel subscription, scheduled cancellation state, confirmation dialog that explains access continues to the period end, Sign out, and a mobile preview. No invented capabilities or backend jargon.

## Implementation differences

- The site keeps its existing global navigation and typography. Workbench now uses a compact legal footer; project imagery and account values come from real saved data.
- Account shows one membership state at a time; the design sheet places multiple states together for review.
- Cancellation is offered only for an active Dodo Payments subscription that can be managed through the existing billing provider. Other paid accounts are directed to support.
- The 3D design sheet includes an illustrative Export menu item and grid/list toggle; the actual Workbench keeps supported project actions and the grid view.
- The saved-project pages now omit the large page title. The project count, creation action, search, and sort stay above an independently scrolling card list, following the later Workbench feedback.
