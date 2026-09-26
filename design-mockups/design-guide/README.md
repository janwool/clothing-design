# Design guide redesign

This directory contains one full-page image-generation mockup for the index and each of the 32 article URLs. `manifest.json` maps every URL to its selected mockup and published image. Earlier `v1` files are retained where a later full-page revision was needed.

## Design direction

The mockups refine the site's existing editorial system: warm grey `#f1f0ea`, paper `#fbfaf5`, charcoal `#171717` rules, restrained citron `#e2ff3b`, Georgia headings, and compact monospaced metadata. Article bodies show the complete reading flow through related guides and footer.

## Image generation prompts

All mockups were generated with the built-in `image_gen` tool. The index prompt specified a full-page commercial apparel guide library with the 32 real guides, featured T-shirt story, topical garment photography, and editorial method. Article prompts used this shared structure with the article's exact title and category:

> Create a full-page portrait ClozDesign design guide mockup from navigation to footer. Match the existing warm grey and paper palette, thin charcoal rules, restrained citron accents, Georgia editorial headings, and compact monospaced labels. Place the exact article title and summary beside a clean, topic-specific apparel studio photograph. Include the table of contents, direct answer, takeaways, practical sections, steps, table, relevant tool CTA, FAQ, related guides, and footer. Avoid invented statistics, testimonials, unrelated imagery, gradients, and text over the photograph.

The published WebP images are crops of the image-generated photography areas, except the model-selection guide, whose dedicated generated photograph is saved as `how-to-choose-a-3d-clothing-model-asset-v1.png`. Cropping did not draw or synthesize any part of an image.

## Implementation differences

- The generated mockups contain illustrative body text and, in some cases, example navigation labels. The site uses the existing real article content, navigation, dates, resource links, and FAQ data.
- The article share panel remains available at the end of each article so it does not interrupt the reading flow.
- The index category controls are functional and use the actual article categories.
