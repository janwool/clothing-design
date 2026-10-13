# Pants tool redesign / 2026-10-13

Route preserved: `/tools/3d-pants-generator`.

## Keyword ownership

| Role | Query | Placement |
| --- | --- | --- |
| Primary | 3D pants mockup generator | Title, H1, introductory copy, application schema |
| Secondary | pants mockup maker; pants mockup generator online | Eyebrow, workflow heading, descriptive metadata |
| Supporting | cargo pants mockup; jogger mockup; trousers mockup online | Available model names, selection context, keyword configuration |
| Supporting | pants design online | Workflow and artwork FAQ |

`/mockups/pants` owns browsing and comparison of pants mockups. This tool owns the create/customize intent; model detail pages own individual garment names. Do not create competing landing URLs for synonyms.

Existing project evidence: `docs/seo-geo-keyword-map-2026-10-07.md` records 214 impressions, zero clicks and position 9.22 for `3d pants`. These are historical observations, not current measurements. No search-volume or ranking promises are made.

Search intent review: https://www.virtualthreads.io/info/3d-joggers-mockup and https://www.mockuplabs.ai/mockups/apparel/pants use mockup-oriented positioning. https://hangrr.com/design/pants/ serves made-to-order tailoring; https://nastix-patterns.com/patterns/basic-pants serves sewing-pattern creation. The tool should distinguish its existing-model artwork workflow from these intents.

Exclude Roblox pants templates, sewing-pattern generation, text-to-garment geometry and tailoring orders. Avoid free export claims. The application schema explains free previews and account-dependent export rather than attaching a zero-price offer to the whole workflow.

## Design and implementation

Built-in imagegen reference: `design-mockups/3d-pants-mockup-generator-v3.png`. Prompt: adjacent `.prompt.txt` file. Four sections: preview workbench, real catalog model selection, illustrated workflow, FAQ/related destinations. Desktop sections use at least the available viewport height; mobile content grows naturally.

Differences from mockup: shared production header/footer are preserved; live catalog models replace illustrative garments; existing three-stage workflow artwork is reused. Export access follows the existing editor and account plan. No new geometry or artwork editor is introduced on this landing page.

## Copy refinement / 2026-10-14

User preference: omit paid-export explanations from this tool landing and keep commercial copy concise. Removed the workflow boundary paragraph, redundant helper copy and the export-plan FAQ; shortened hero and step copy. Metadata and schema remain factual without claiming free exports. Export permissions continue to be enforced by the existing editor.
