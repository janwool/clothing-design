# ClothingDesign growth operations

## Operating target

Build qualified global traffic from apparel designers, print-on-demand sellers, streetwear founders, ecommerce teams, and fashion students. Traffic only counts as useful when it reaches a tool, opens a garment model, starts the editor, uploads artwork, or exports a preview.

## Channel roles

- Pinterest: evergreen discovery for garment mockups, print placement diagrams, colorways, and design checklists.
- Instagram and TikTok: short demonstrations, before/after visuals, model rotation, print-placement fixes, and quick creator workflows.
- YouTube Shorts: searchable 20–40 second tutorials reused from the strongest vertical videos.
- Reddit: problem-solving participation in relevant apparel, POD, streetwear, 3D, and ecommerce discussions. Helpful comments lead; promotion remains occasional and rule-compliant.
- LinkedIn and X: product updates, technical build notes, ecommerce workflows, and partnership outreach.
- Email/RSS: retain visitors and distribute new guides without depending on an algorithm.

## Measurement rules

All manually published links use lowercase UTM values:

- `utm_source`: pinterest, instagram, tiktok, youtube, reddit, linkedin, or x
- `utm_medium`: organic-social, community, creator-partnership, or email
- `utm_campaign`: monthly theme such as `august-tshirt`
- `utm_content`: asset identifier such as `pin-01`, `reel-02`, or `reddit-answer-03`

Generate a link with:

```sh
npm run campaign:url -- --url /tools/t-shirt-mockup-generator --source pinterest --campaign august-tshirt --content pin-01
```

Primary weekly metrics: attributed sessions, engaged sessions, editor starts, artwork uploads, exports, registrations, referring posts, saves, shares, comments, and assisted conversions. Followers and raw impressions are secondary.

## First four-week publishing cycle

### Week 1 — T-shirt mockup workflow

- Pinterest: classic vs oversized T-shirt model comparison; front-print placement checklist; black vs white colorway pin.
- TikTok/Instagram: 15-second screen recording — “Stop guessing whether your chest print is too large.”
- YouTube Short: choose a T-shirt model, change color, upload artwork, rotate, export.
- Reddit: answer print-placement and mockup questions with measurements and workflow advice; link only where community rules and context allow it.
- LinkedIn/X: launch note explaining why a rotatable garment is more useful than a flat PSD for early product decisions.

Campaign: `august-tshirt`; destination: `/tools/t-shirt-mockup-generator`.

### Week 2 — Hoodie and streetwear drop

- Pinterest: hoodie front/back/sleeve placement board; streetwear drop checklist; dark garment contrast examples.
- TikTok/Instagram: “Three hoodie mockup mistakes before your first sample.”
- YouTube Short: preview chest, back, and sleeve artwork on a 3D hoodie.
- Reddit: participate in streetwear startup feedback threads with specific notes on scale, contrast, and product-page views.
- Creator outreach: contact 10 small streetwear or POD educators with a personalized offer to demonstrate the free tool; no mass messages.

Campaign: `august-hoodie`; destination: `/tools/hoodie-mockup-generator`.

### Week 3 — Ecommerce and POD images

- Pinterest: transparent PNG workflow; white-background vs lifestyle-image comparison; four-image listing checklist.
- TikTok/Instagram: turn one artwork into four garment colorways.
- YouTube Short: export a transparent garment preview for a store draft.
- Reddit: answer questions about Shopify/Etsy mockups and consistent catalog framing.
- Partnership outreach: approach POD newsletters, ecommerce educators, and apparel resource directories with one relevant resource rather than a generic backlink request.

Campaign: `august-pod`; destination: `/tools/print-on-demand-mockup-generator`.

### Week 4 — Free 3D model library

- Pinterest: category boards for dresses, jackets, pants, hats, and bags.
- TikTok/Instagram: fast montage of 10 garment models with the hook “Which one should become the next mockup?”
- YouTube Short: choose the right 3D clothing model in 30 seconds.
- Reddit: publish a transparent build note or useful free-resource roundup only in communities that explicitly allow it.
- LinkedIn/X: share library statistics, the browser workflow, and a call for designers to request the next garment category.

Campaign: `august-model-library`; destination: `/mockups`.

## Weekly operating rhythm

- Monday: review attribution, search demand, social saves, comments, and failed funnels; choose the weekly hook.
- Tuesday: produce one core screen recording and three still-image derivatives.
- Wednesday–Thursday: publish, reply to every substantive comment, and participate in relevant community discussions.
- Friday: compare creative hooks and destinations; retain winners and stop formats that attract low-quality sessions.
- Monthly: refresh the top two guides, create one partnership asset, and publish a concise performance report with next actions.

## Guardrails

- No purchased traffic, fake followers, automated comments, mass DMs, or copied community posts.
- Do not claim commercial-use rights, no watermark, privacy guarantees, or unlimited exports until product and legal policy confirm them.
- Never publish the same caption and link repeatedly across Reddit communities.
- Social content should show the real product workflow; avoid generic AI fashion imagery that the tool cannot reproduce.
