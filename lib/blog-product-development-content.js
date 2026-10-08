const date = '2026-10-08';

module.exports = [
  {
    slug: 'get-feedback-on-clothing-designs',
    title: 'How to Get Useful Feedback on Your Clothing Designs',
    seoTitle: 'Get Useful Feedback on Clothing Designs',
    shortTitle: 'Clothing Design Feedback',
    category: 'Starting a Clothing Brand',
    description: 'Show your clothing designs on clear mockups, ask better feedback questions, and decide what to change before paying for a sample.',
    dek: '“Looks good” is nice to hear. It does not tell you which version to make.',
    targetKeyword: 'how to get feedback on clothing designs',
    keywords: ['clothing design feedback', 'validate clothing brand designs', 'clothing brand mockups', 'starting a clothing brand'],
    image: '/images/design-guide/get-feedback-on-clothing-designs-model-design-v2.webp?v=20261008',
    imageAlt: 'Illustration based on the ClozDesign relaxed T-shirt model comparing small and large chest prints',
    publishedAt: date, updatedAt: date, readingTime: 5,
    answer: 'Show the design on a garment, explain who it is for, and ask about one decision at a time. Compare versions with the same color, crop, and camera angle. Ask why someone prefers one and what would stop them wearing it. Use the answers to choose a revision or sample; keep design preferences separate from evidence that someone will buy.',
    takeaways: [
      'Show the whole garment as well as the graphic.',
      'Change one thing between versions so the comparison means something.',
      'Ask people who might wear the clothing, including people outside your friends.',
      'Write down the reason behind each preference.'
    ],
    sections: [
      {
        id: 'show-the-garment', title: 'Put the artwork on a shirt first',
        paragraphs: [
          'An illustration can work as a poster and feel awkward on a tee. The collar, the width of the body, and the empty space around the print all affect how someone reads it. If you only show the artwork, people have to imagine those details for themselves.',
          'Show a full front view and a back view if there is rear artwork. Add a closer crop when the lettering is too small to read. Keep the full garment in the set so the close-up does not hide the print’s scale.',
          'In ClozDesign, choose the closest garment model and upload your transparent artwork. Place it, rotate the garment, and save the views you need. If the model differs from the blank you plan to use, say so when you share the images.'
        ]
      },
      {
        id: 'one-comparison', title: 'Give each comparison a job',
        paragraphs: [
          'Suppose you cannot decide whether the back print is too large. Make two versions of the same shirt with different print sizes. Keep the garment color and view fixed. Ask which size feels better on that shirt and why.',
          'If one version is black with a small print and the other is white with a large print, a vote cannot tell you whether the person preferred the color or the size.',
          'Label the versions A and B. Save the images with those labels too. It is frustrating to get a useful comment and then realize you cannot tell which screenshot it refers to.'
        ]
      },
      {
        id: 'ask-better-questions', title: 'Ask about what you can change',
        paragraphs: [
          '“Would you wear this?” is a reasonable opener. Follow it with something the person can point to: the lettering, print size, fit, or color. Leave room for them to dislike both versions.',
          'Start with their answer before explaining your intention. If you tell them the small print is meant to look subtle, they may repeat that word back to you instead of saying what they first noticed.'
        ],
        table: {
          headers: ['Decision', 'Question to ask'],
          rows: [
            ['Print size', 'Which version would you wear, and what feels off about the other?'],
            ['Readability', 'What did you notice first? Can you read the smaller line?'],
            ['Garment choice', 'Would you prefer this on a tee or a hoodie? When would you wear it?'],
            ['Price', 'At this price, what would you need to know before buying?']
          ]
        }
      },
      {
        id: 'who-to-ask', title: 'Find people who buy this kind of clothing',
        paragraphs: [
          'Friends can spot a typo or tell you that the print looks crowded. For the buying question, look for people who already wear clothing close to what you want to make.',
          'Ask what they bought recently and what they liked about it. Someone who buys relaxed tees for everyday wear may care more about the collar and length than a person choosing artwork for a collection.',
          'Reddit can be useful for design criticism, but a community of other brand owners is a different audience from your future customers. Read the current posting rules before sharing and explain what feedback you need. A detailed answer from one relevant person can be more useful than a string of votes.'
        ]
      },
      {
        id: 'use-the-answers', title: 'Turn comments into a revision',
        paragraphs: [
          'Keep a short note for each response: version, preference, reason, and whether the person would buy at the stated price. Do not collapse every answer into an A-or-B vote.',
          'Look for repeated reasons. If several people cannot read the bottom line, try larger lettering or remove it. If someone dislikes a color that others like, you may be hearing taste rather than a problem you need to fix.',
          'Make the change and show the revised version alongside the old one. Ask whether it solved the issue. You do not need to redesign everything whenever a new comment arrives.'
        ]
      },
      {
        id: 'move-to-sample', title: 'Know when the next question needs a sample',
        paragraphs: [
          'Mockups are useful for deciding what to try. They cannot answer whether the collar feels tight, the fabric is too warm, or the print is comfortable to wear.',
          'Once you have a version worth making, order a sample and show it on a person. Bring the price into the conversation again. People may like the illustration but want to see the real fit before deciding.',
          'A signup for launch news gives you someone to contact later. It is not an order. Keep track of interest without treating every compliment as stock you should buy.'
        ]
      }
    ],
    faq: [
      { question: 'Can I get feedback before ordering samples?', answer: 'Yes. Use clearly labeled mockups to ask about artwork, colors, and placement. Bring a physical sample into the conversation when you need feedback on fit or fabric.' },
      { question: 'How many designs should I show at once?', answer: 'Show enough to answer your current question. Two versions are easier to discuss than a large sheet of unrelated designs. You can review other ideas separately.' },
      { question: 'Should I change the design to match every comment?', answer: 'No. Look at the reason behind the comment and whether it comes from someone you want to sell to. Fix a repeated readability problem before chasing every color preference.' },
      { question: 'Does good Reddit feedback mean the design will sell?', answer: 'It tells you how that audience reacted to the images. Buying also depends on the price, real garment, delivery, and whether you reach the right customers.' }
    ],
    cta: { title: 'Make two versions to compare', body: 'Place your artwork on a garment and save matching views for your next feedback session.', label: 'Open ClozDesign', href: '/tools/3d-clothing-mockup-generator' },
    redditSources: [
      { title: 'When you launched your brand, how did you validate your concept?', community: 'r/streetwearstartup', url: 'https://www.reddit.com/r/streetwearstartup/comments/1bjlz77/when_you_launched_your_brand_how_did_you_validate/' },
      { title: 'Can I have some feedback on a few of my designs (Just on illustrator)', community: 'r/streetwearstartup', url: 'https://www.reddit.com/r/streetwearstartup/comments/12gb92t/can_i_have_some_feedback_on_a_few_of_my_designs/' }
    ]
  },
  {
    slug: 'choose-t-shirt-blanks-for-clothing-brand',
    title: 'How to Choose T-Shirt Blanks for Your Clothing Brand',
    seoTitle: 'Choose T-Shirt Blanks for Your Clothing Brand',
    shortTitle: 'Choosing T-Shirt Blanks',
    category: 'Starting a Clothing Brand',
    description: 'Compare T-shirt blanks by fit, fabric weight, print area, and sample results before choosing the shirt for your first clothing release.',
    dek: 'The graphic might be yours, but the blank decides how the shirt wears.',
    targetKeyword: 'how to choose t-shirt blanks for a clothing brand',
    keywords: ['t-shirt blanks for clothing brand', 'heavyweight t-shirt blanks', 'clothing brand first product', 't-shirt mockup'],
    image: '/images/design-guide/choose-t-shirt-blanks-for-clothing-brand-model-design-v2.webp?v=20261008',
    imageAlt: 'Illustration comparing the ClozDesign regular crewneck and relaxed drop-shoulder T-shirt model shapes',
    publishedAt: date, updatedAt: date, readingTime: 5,
    answer: 'Choose a blank by the fit and feel you want customers to wear, then check whether it suits your artwork and print method. Compare measurements and fabric specifications, order samples, and try them on. Use mockups to compare the graphic on similar silhouettes, but choose the actual blank from the physical shirt and the supplier’s information.',
    takeaways: [
      'Compare body length, width, sleeve shape, and neckline, not just the size label.',
      'Fabric weight is one specification; it does not settle the fit or comfort.',
      'Ask the printer about the exact blank and planned decoration.',
      'Check available colors and sizes before building the release around a shirt.'
    ],
    sections: [
      {
        id: 'fit-first', title: 'Decide what you mean by oversized',
        paragraphs: [
          'Two shirts labeled oversized can look quite different. One may be wide and short with dropped shoulders. Another may simply have more length and room throughout.',
          'Take a shirt whose fit you like and measure it laid flat. Record the chest width, body length, shoulder width, and sleeve length using the same measurement points as the supplier’s size chart. Use those numbers to shortlist blanks.',
          'Look at the neckline too. A wide, loose collar changes the appearance of a small chest mark. Sleeve length and shape also matter when a large back graphic is the main feature.',
          'If the supplier gives only a size label and a photo, ask for measurements. It is difficult to make a useful comparison from “relaxed fit” alone.'
        ]
      },
      {
        id: 'fabric-weight', title: 'GSM is a starting point',
        paragraphs: [
          'GSM means grams per square meter: the weight of the fabric over a given area. It helps you compare fabric weight, but it does not tell you everything about a finished shirt.',
          'Think about when the customer will wear it. A substantial tee may suit the look you want and still feel too warm for their everyday use. Check the fabric composition, feel, and drape along with the weight.',
          'Try the shortlist on rather than choosing the highest number. Move around, sit down, and notice how the shirt hangs. You are choosing something people will wear, not just a specification to put in the product description.'
        ]
      },
      {
        id: 'graphic-on-fit', title: 'Try the artwork on the shape you are choosing',
        paragraphs: [
          'A graphic that fills the front of a regular tee may look smaller on a wider body. On a shorter shirt, its bottom edge may sit uncomfortably close to the hem.',
          'In ClozDesign, choose models close to the silhouettes you are considering and place the same artwork on each. Save front and back views. Compare the space around the collar, under the arms, and below the print.',
          'For a fair comparison, keep the intended print size in mind. Enlarging the graphic to fill every model can hide the difference between the shirts. Confirm the final size on the chosen blank with a paper print and the printer’s template.',
          'The model library is a way to try the visual idea. Unless you have an exact match, use the supplier’s sample to decide the actual fit.'
        ]
      },
      {
        id: 'print-check', title: 'Ask the printer about that blank',
        paragraphs: [
          'Send the printer the style reference and artwork before ordering a run of blanks. Ask whether the fabric and surface work with the planned decoration and what print area is available.',
          'For a design near a seam or on a sleeve, ask about that location specifically. A front view can make a placement look simple while the real shirt has less space to work with.',
          'Have the sample decorated on the exact blank you intend to sell. Changing the shirt later means the fit, placement, and printing conditions need another look.'
        ]
      },
      {
        id: 'sample-notes', title: 'Compare the samples after wearing and washing',
        paragraphs: [
          'Label each sample with its supplier and style reference. Take front, side, and back photos under similar conditions so you can revisit the comparison without relying on memory.',
          'Measure each shirt before washing and again afterward, following its care instructions. Check the collar, side seams, hems, and any twisting. If you have a printed sample, inspect the decoration as well.',
          'Keep notes in plain language: collar too open, sleeves right, body too long. Those observations are more useful to your next decision than calling every shirt premium.'
        ]
      },
      {
        id: 'availability', title: 'Check the colors and sizes you can order',
        paragraphs: [
          'Before settling on a blank, check that your intended colors and size range are available. Ask how replenishment works and whether a minimum applies to each color.',
          'Compare the whole order cost, including delivery and decoration. A shirt that costs a little less individually may be harder to use if the sizes you need are unavailable.',
          'Save the chosen style reference with your product files. When you update the mockups or order another sample, you will know which garment those images are meant to represent.'
        ]
      }
    ],
    faq: [
      { question: 'Is a heavier T-shirt always better?', answer: 'No. Choose the weight for the intended use, then check the actual feel, fit, and construction. A customer who likes the look may still find a particular shirt too warm or stiff.' },
      { question: 'Can I make a regular shirt oversized by sizing up?', answer: 'Try it, but compare the result carefully. Sizing up can add length as well as width. A shirt cut to be boxy may give different proportions.' },
      { question: 'Can a 3D mockup tell me which blank will fit best?', answer: 'It can help compare visual proportions and graphic placement. Try on the physical blank to judge its real fit and fabric.' },
      { question: 'Should I buy blanks before talking to a printer?', answer: 'Have the printer confirm the exact style and planned decoration first. Then sample that combination before committing to the full order.' }
    ],
    cta: { title: 'See how the graphic sits on a shirt', body: 'Choose a T-shirt model and compare the space around your print before sampling.', label: 'Try a T-shirt mockup', href: '/tools/t-shirt-mockup-generator' },
    redditSources: [
      { title: 'What GSM are you using for you heavy weight tees?', community: 'r/streetwearstartup', url: 'https://www.reddit.com/r/streetwearstartup/comments/11vlaxy/what_gsm_are_you_using_for_you_heavy_weight_tees/' }
    ]
  },
  {
    slug: 'clothing-sample-revision-notes',
    title: 'How to Write Clothing Sample Revision Notes',
    seoTitle: 'How to Write Clothing Sample Revision Notes',
    shortTitle: 'Sample Revision Notes',
    category: 'Apparel Production',
    description: 'Write clear clothing sample revision notes with photos, measurements, updated mockups, and one current set of files for your manufacturer.',
    dek: '“Move the print down a bit” gives the factory another thing to guess.',
    targetKeyword: 'clothing sample revision notes',
    keywords: ['clothing sample feedback', 'garment sample revisions', 'clothing manufacturer design brief', 'clothing mockup vs tech pack'],
    image: '/images/design-guide/clothing-sample-revision-notes-model-design-v2.webp?v=20261008',
    imageAlt: 'Illustration based on a ClozDesign crewneck model comparing lower and higher print placement',
    publishedAt: date, updatedAt: date, readingTime: 5,
    answer: 'Identify the sample version, photograph the issues, and write the requested change beside each one. For placement changes, record the current and requested measurements from the same reference point. Update the mockup and specification together, list what should stay as approved, and ask the supplier to confirm the changes before making the next sample.',
    takeaways: [
      'Name the sample you are reviewing and keep it with its files.',
      'Separate a manufacturing error from a new design request.',
      'Use photos and measurements when asking for a placement change.',
      'Send one complete, current revision set.'
    ],
    sections: [
      {
        id: 'review-current-sample', title: 'Put the sample beside the brief it came from',
        paragraphs: [
          'Before writing comments, check which version the factory made. Put the sample next to the artwork, measurements, and reference images sent for that version. Reviewing it against a newer image can make a correctly followed instruction look like an error.',
          'Try the garment on as well as laying it flat. A print may be centered on the table but look different when worn. Photograph both views when that is the issue.',
          'Number the comments and put the same numbers on your photos. The supplier should be able to find the exact collar, seam, or print edge you are talking about.'
        ]
      },
      {
        id: 'error-or-change', title: 'Was the brief missed, or has the design changed?',
        paragraphs: [
          'A print made wider than the agreed measurement is a different conversation from a print you now want smaller. Record which one happened.',
          'For an error, quote the agreed measurement and show what you received. For a new request, give the new measurement and update the design files. That distinction helps you discuss the work and any revision costs without arguing over what was originally ordered.',
          'Do not rely on “as discussed” if the instruction is buried in a message thread. Put it in the current revision sheet so it stays with the product.'
        ]
      },
      {
        id: 'write-measurements', title: 'Give the next sample a position to aim for',
        paragraphs: [
          'If a back print feels too high, measure from the same collar seam used in the brief to the top edge of the print. Write down the measured position and the position you want next.',
          'For example, a revision might read: sample measures 5 cm from back collar seam to top of artwork; change to 7 cm on the next sample; keep artwork width at 26 cm. These numbers are an example of a note, not a suggested placement for every shirt.',
          'Specify the units and measurement method. Agree on tolerances with the supplier. If the print changes size as well as position, update both dimensions so there is no need to infer one from a picture.'
        ],
        table: {
          headers: ['Issue', 'Evidence', 'Requested change'],
          rows: [
            ['Print sits too high', 'Photo and collar-to-print measurement', 'New distance from the same collar seam'],
            ['Artwork is too wide', 'Measured width and original file reference', 'New width and height, preserving proportions'],
            ['Wrong artwork version', 'File names and comparison images', 'Use the attached current artwork'],
            ['Fit needs revision', 'Try-on photos and garment measurements', 'Updated specification agreed with the technical designer']
          ]
        }
      },
      {
        id: 'updated-reference', title: 'Update the mockup to match the written change',
        paragraphs: [
          'For a graphic change, reopen the garment in ClozDesign and adjust the placement or artwork. Export the revised front and back views with the same camera and color as the previous version.',
          'Put the old and new views beside each other when it helps explain the change. Label them clearly so the supplier does not mistake the comparison for two options it can choose from.',
          'Keep measured placement in the written brief. A model preview helps explain the composition, but its collar and proportions may differ from your physical garment. For a fit change, update the technical garment information with your designer rather than treating a stock model as a pattern.'
        ]
      },
      {
        id: 'send-one-set', title: 'Send the changes together',
        paragraphs: [
          'Give the revision sheet a product name, version, and date. Use the same version in the artwork and mockup filenames. Attach the complete set instead of sending another image each time you notice something.',
          'Include details already approved, such as the garment color or front logo size. It helps to know what is settled when reviewing several changes.',
          'Ask the supplier to confirm the requested changes, flag anything it cannot do, and give the timing for the next sample. Clear notes can reduce misunderstandings; they do not remove the time needed to source materials, make the sample, and ship it.'
        ]
      },
      {
        id: 'check-next-sample', title: 'Check the next sample against the comment list',
        paragraphs: [
          'When the next sample arrives, work through the numbered comments. Mark each as corrected, still open, or needing a new decision. Check the parts you had already approved too.',
          'Keep the earlier sample until you finish the comparison. It is much easier to judge a revised print position when you can see both shirts.',
          'Once the garment is approved, keep that sample with the final brief and artwork. Tell the supplier which version is approved for production. A later email containing a new idea should not silently become the production instruction.'
        ]
      }
    ],
    faq: [
      { question: 'Can I send sample feedback in a message?', answer: 'You can discuss it in messages, but collect the agreed changes in one dated revision sheet with the relevant files. That gives both sides a current reference.' },
      { question: 'How do I describe a print that needs moving?', answer: 'Measure its current position from a named seam or centerline and give the requested position from that same point. Include a photo showing where you measured.' },
      { question: 'Will a better mockup mean fewer samples?', answer: 'It may help clarify a visual change. Fit, materials, decoration, and production errors can still require another physical sample.' },
      { question: 'Can ClozDesign change a sewing pattern?', answer: 'Use ClozDesign to revise visual mockups. Work with a technical designer or manufacturer on pattern and measurement changes.' }
    ],
    cta: { title: 'Show the placement you want next', body: 'Update the garment preview and export matching views to attach to your revision notes.', label: 'Make the revised mockup', href: '/tools/3d-clothing-mockup-generator' },
    redditSources: [
      { title: 'How do you guys deal with long production times?', community: 'r/streetwearstartup', url: 'https://www.reddit.com/r/streetwearstartup/comments/1er4wfx/how_do_you_guys_deal_with_long_production_times/' }
    ]
  }
];
