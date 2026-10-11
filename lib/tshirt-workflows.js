// One destination per distinct task; spelling variants belong to the main hub.
const PRICING_NOTE = 'Free to explore. Finished design exports require Pro or above.';
const IMAGE_ROOT = '/images/mockups/generated/';
const mainStudio = {
  heading: 'T-shirt mockup\ngenerator.',
  label: 'T-shirt mockup generator',
  lede: 'Add your logo or graphic to a 3D T-shirt. Customize colors and artwork placement.',
  color: '#f5f3ed',
  workflowTitle: 'How to create a T-shirt mockup',
  workflowImage: 'tshirt-workflow-studio.webp',
  workflowAlt: 'Example of a blank T-shirt, artwork placement and an angled product preview',
  steps: [
    { title: 'Choose a blank', body: 'Match the sleeve length, collar and fit to the garment you intend to print.' },
    { title: 'Add your artwork', body: 'Open the matching editor, upload your graphic and adjust its size and placement.' },
    { title: 'Review, then export', body: 'Compare front and back views. Finished design exports require Pro or above.' }
  ],
  faq: [
    { question: 'Is the T-shirt mockup generator free?', answer: 'You can explore garment previews and colors for free. Saving a design requires an account; the free plan includes three projects. Finished design exports and watermark removal require Pro or above.' },
    { question: 'What artwork files can I use?', answer: 'The artwork editor accepts PNG, JPG, WebP and SVG. A PNG with a transparent background lets the garment show around your design instead of a rectangular image background.' },
    { question: 'Can I create front and back T-shirt mockups?', answer: 'Yes. Rotate the preview or use the front, back and side controls. Open the matching editor to place separate graphics on the garment panels.' },
    { question: 'Do I need Photoshop or a PSD template?', answer: 'No. Explore the 3D blank and use the browser editor to place artwork. The output is a product visual; confirm print dimensions and production details with your printer.' }
  ]
};

const workflows = [
  {
    slug: 'women-t-shirt-mockup', title: "Women's T-Shirt Mockup Generator", label: "Women's T-shirts",
    primaryKeyword: 'women t-shirt mockup',
    keywords: ["women's t-shirt mockup", 'womens shirt mockup', 'fitted t-shirt mockup', 'cropped t-shirt mockup', 'female t-shirt mockup'],
    subtitle: "Women's T-shirt mockups for fitted, cropped and ruffle-trim designs.",
    heading: "Women's T-shirt\nmockups.", color: '#f5f3ed', summary: 'Fitted shapes and cropped styles.',
    audience: 'women', workflowImage: 'tshirt-pod-listing.webp',
    workflowAlt: 'Example T-shirt artwork placement',
    faq: [
      { question: "What styles can I use for women's T-shirt mockups?", answer: 'Choose from the available fitted, cropped and detailed T-shirt shapes. Select a card to customize that garment in the editor.' },
      { question: 'Does this preview show how a T-shirt fits a person?', answer: 'The 3D preview shows the garment silhouette and artwork placement. It does not provide body measurements, sizing recommendations or a virtual try-on.' }
    ]
  },
  {
    slug: 'men-t-shirt-mockup', title: "Men's T-Shirt Mockup Generator", label: "Men's T-shirts",
    primaryKeyword: 'men t-shirt mockup',
    keywords: ["men's t-shirt mockup", 'mens shirt mockup', 'regular fit t-shirt mockup', 'male t-shirt mockup', 'relaxed fit tee mockup'],
    subtitle: "Men's T-shirt mockups for regular, relaxed and long-sleeve designs.",
    heading: "Men's T-shirt\nmockups.", color: '#f5f3ed', summary: 'Regular cuts and relaxed fits.',
    audience: 'men', workflowImage: 'tshirt-front-back-approval.webp',
    workflowAlt: 'Example front and back garment artwork',
    faq: [
      { question: "What styles can I use for men's T-shirt mockups?", answer: 'Explore regular short-sleeve, relaxed and long-sleeve garment shapes. Each card opens the editor for the selected model.' },
      { question: 'Can I customize a front logo and a back graphic?', answer: 'Yes. Place separate artwork on the front and back panels in the garment editor, then rotate the 3D model to review both sides.' }
    ]
  },
  {
    slug: 'white-t-shirt-mockup', title: 'White T-Shirt Mockup Generator', label: 'White T-shirt',
    primaryKeyword: 'white t-shirt mockup',
    keywords: ['white shirt mockup', 'blank white t-shirt mockup', 'white tee logo mockup', 'white t-shirt mockup online'],
    subtitle: 'White cotton T-shirt mockups for logos and graphics.',
    heading: 'White T-shirt\nmockups.', color: '#f5f3ed',
    summary: 'Check artwork on a light blank.',
    workflowImage: 'tshirt-pod-listing.webp',
    workflowAlt: 'Illustrative white T-shirt product image with a blue chest graphic',
    faq: [
      { question: 'How do I make a white shirt mockup?', answer: 'Start with the white preview on this page, choose the garment fit, then open its editor. Set the final color, upload artwork and adjust the print position.' },
      { question: 'Why does my white graphic disappear?', answer: 'White artwork has little contrast against a white garment. Try a darker design variant or a black T-shirt preview. This visual check does not simulate your printer’s inks.' }
    ]
  },
  {
    slug: 'black-t-shirt-mockup', title: 'Black T-Shirt Mockup Generator', label: 'Black T-shirt',
    primaryKeyword: 'black t-shirt mockup',
    keywords: ['black shirt mockup', 'black tee mockup', 'black t-shirt logo mockup', 'dark t-shirt mockup online'],
    subtitle: 'Black cotton T-shirt mockups with a matte finish.',
    heading: 'Black T-shirt\nmockups.', color: '#171717', summary: 'Review contrast on dark fabric.',
    workflowImage: '/images/tshirt-studio/black-covers-v2/crewneck-straight-cut-short-sleeve-t-shirt-3d-model-b42a1ab90447.webp',
    workflowAlt: 'Black cotton crewneck T-shirt product cover',
    faq: [
      { question: 'Does the black mockup simulate printing ink?', answer: 'No. It shows a garment color and an artwork preview. Confirm ink coverage, underbase and the final appearance with a printed sample from your printer.' },
      { question: 'Can I compare a black and white T-shirt?', answer: 'Yes. Use the color controls to compare the same garment. This page opens the selected garment in black; you can change its color in the editor.' }
    ]
  },
  {
    slug: 't-shirt-logo-mockup', title: 'T-Shirt Logo Mockup Generator', label: 'Logo placement',
    primaryKeyword: 't-shirt logo mockup',
    keywords: ['shirt logo mockup', 'left chest logo mockup', 'branded t-shirt mockup', 'small logo tee mockup'],
    subtitle: 'Customize chest logo size and placement on a 3D T-shirt.',
    heading: 'T-shirt logo\nmockups.', color: '#f5f3ed', summary: 'Compare chest marks and spacing.',
    workflowImage: 'tshirt-pod-listing.webp',
    workflowAlt: 'Illustrative T-shirt with a small blue chest mark',
    faq: [
      { question: 'Can I preview a left-chest logo?', answer: 'Yes. Open the artwork editor and place your logo on the wearer’s left chest. In a front view, that area appears on the right side of the image.' },
      { question: 'Does a logo mockup specify embroidery dimensions?', answer: 'No. A visual mockup is a placement reference. Give your production partner separate dimensions, artwork files and embroidery or printing instructions.' }
    ]
  },
  {
    slug: 'graphic-t-shirt-mockup', title: 'Graphic T-Shirt Mockup Generator', label: 'Graphic tees',
    primaryKeyword: 'graphic t-shirt mockup',
    keywords: ['graphic tee mockup', 't-shirt print mockup', 'back graphic shirt mockup', 'streetwear graphic tee preview'],
    subtitle: 'Customize front and back T-shirt graphics in 3D.',
    heading: 'Graphic tees.\nSee the whole design.', color: '#f5f3ed', summary: 'Review large prints and two-sided artwork.',
    workflowImage: 'tshirt-front-back-approval.webp',
    workflowAlt: 'Illustrative front and back apparel views for a two-sided artwork review',
    faq: [
      { question: 'Can I use different front and back graphics?', answer: 'Yes. Use the garment editor to place separate artwork on the front and back panels, then review them from the corresponding angles.' },
      { question: 'Is this an all-over-print production template?', answer: 'No. This page helps review the visual composition. Ask your supplier for its production template, bleed and print-area requirements.' }
    ]
  },
  {
    slug: 'transparent-t-shirt-mockup', title: 'Transparent Background T-Shirt Mockup', label: 'Transparent background',
    primaryKeyword: 'transparent t-shirt mockup',
    keywords: ['t-shirt mockup PNG', 'shirt mockup transparent background', 'transparent tee mockup', 'T-shirt product cutout'],
    subtitle: 'Create a T-shirt PNG with a transparent background.',
    heading: 'Transparent T-shirt\nmockups.', color: '#f5f3ed', summary: 'Prepare product images for flexible layouts.',
    workflowImage: 'tshirt-workflow-studio.webp',
    workflowAlt: 'Illustrative T-shirt garment and artwork previews on a neutral studio background',
    faq: [
      { question: 'Is the grey preview background in the exported image?', answer: 'The grey stage is used to view the garment here. Use transparent PNG export in the editor when you need a product image without a fixed background.' },
      { question: 'Is a transparent T-shirt mockup export free?', answer: 'Finished design exports, including transparent PNG exports, require Pro or above. You can explore the garment preview and colors for free.' }
    ]
  }
].map(workflow => ({
  ...workflow,
  workflowImage: workflow.workflowImage.startsWith('/') ? workflow.workflowImage : IMAGE_ROOT + workflow.workflowImage,
  faq: [...workflow.faq, mainStudio.faq[0], mainStudio.faq[1]],
  intent: workflow.subtitle
}));

mainStudio.workflowImage = IMAGE_ROOT + mainStudio.workflowImage;
const bySlug = Object.fromEntries(workflows.map(workflow => [workflow.slug, workflow]));
const workflowPaths = workflows.map(workflow => `/tools/${workflow.slug}`);

function selectAudienceStarters(models, audience) {
  const preferences = audience === 'women'
    ? [/v[- ]neck.*fitted.*short[- ]sleeve/i, /fitted.*crop/i, /ruffle/i, /three[- ]quarter.*crop/i]
    : [/crewneck.*straight.*short[- ]sleeve/i, /relaxed.*drop[- ]shoulder/i, /straight.*long[- ]sleeve/i, /polo/i];
  const selected = [];
  for (const preference of preferences) {
    const match = models.find(model => !selected.includes(model) && preference.test(model.title));
    if (match) selected.push(match);
  }
  return [...selected, ...models.filter(model => !selected.includes(model))].slice(0, 4);
}

module.exports = { mainStudio, workflows, bySlug, workflowPaths, PRICING_NOTE, selectAudienceStarters };
