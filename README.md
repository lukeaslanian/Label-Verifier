# Bulk COLA Application & Label Verifier

Checks that an alcohol label matches its TTB COLA application (Form 5100.31): brand name, class/type, alcohol content, net contents, and the government warning. The app works for one application at a time or several hundred at once!

**Live:** _URL coming once it's deployed_

## Using it

1. Drop in your COLA applications, one file per application: a scanned paper filing, a registry PDF, or a registry page saved from the browser. Single files, a folder, or a bunch of folders all work. The COLA form already has the labels on it, so the application is usually all you need. If it's a saved page, just include its `_files` folder, since that's where the label images are.
2. **Or hit "Use sample files" to load 20 real filings that I downloaded from TTB's public registry. I'd recommend doing this first to get a feel for how powerful the app is!**
3. Click Verify. Every application shows up right away with a spinner and fills in as soon as it's done, so users know what's going on.
4. Each result is a Field / Application / Label / Status table. Problems open on their own with the difference highlighted. For ABV and net contents that's the whole value (with unit conversions); for a brand it's the letters that differ, and for the warning it's the missing or wrong words, shown next to the required text. These are shown with a visual diff-type layout to make it much easier to see what's off. I think the app even found a spelling error that was likely missed by the reviewer in one of the sample files! 
5. Download the results as a spreadsheet to save them all, or click Start over to do another verification run.

Each field gets Match, Check, or Mismatch, and each application gets Pass, Needs review, or Fail.

## What happens behind the scenes

For each application, the backend does four things:

1. **Reads the form.** Saved pages and text PDFs are parsed straight from the text, with no model call, so it's instant, free, and exact. Scans go to a vision model.
2. **Reads the label.** A vision model transcribes it and reports the brand, the class/type, and whether the warning header looks bold.
3. **Compares in code.** The models only read. Plain code does the matching, so a verdict never comes down to a model's judgment call. Brand matching ignores case and punctuation. ABV accepts proof and decimal commas. Net contents converts units. The warning has to match the required text word for word.
4. **Asks the next model if needed.** If a model errors, times out, or refuses, or a field isn't settled, the next model reads the label too. Models also know the standard warning by heart, so they tend to "read" it correctly even when the label misprints it (two of four read "SHOULD" on a real label that says "SHOUL"). So when they disagree on the wording, each one spells just that word letter by letter, and the majority wins.

## Architecture

```
Browser (Next.js page)
  |  one request per application, 6 at a time
  v
/api/verify
  |-- imagePrep            PDF / HTML / image (incl. HEIC) -> model-ready input
  |-- extractApplication   form fields: text parse, or vision for scans
  |-- vision/providers     Gemini Flash-Lite -> GPT-6 Luna -> GPT-6 Sol -> Claude Sonnet (ordered by test accuracy & speed)
  |-- verifyWithApplication + warningCheck + warningSpellCheck
  v
Results, and optionally Postgres history
```

Each application is its own request, so results come in as they finish, and even a 200 to 300 application batch never hits a server time limit.

I tested each model on its own against 19 of the samples, and ordered them by the results:

| Model | Fields right | Median time |
|---|---|---|
| Gemini 3.5 Flash-Lite | 98% | 1.9s |
| GPT-6 Luna | 96% | 3.7s |
| GPT-6 Sol | 96% | 5.1s |
| Claude Sonnet 5 | 91% | 7.1s |

Gemini was the most accurate, fastest, and cheapest, so it always goes first and there's no model picker. The others are just backups, but do come in handy when errors arise or when models refuse to respond for any reason. A clean label takes one call, about 2 seconds, which keeps it under the 5-second target. Most applications finished in about 2 seconds in my testing, though full-page scans and ones that need a second opinion take longer.

## How I got here

- **Cloud models over local OCR.** I looked at a local OCR + LLM hybrid, local vision models (IBM Granite), and even a self-hosted GPU box. Tesseract couldn't read real bottle photos, and the local options were too slow or too much to host, so I went with Next.js on Vercel calling cloud vision models.
- **American models only.** Every model it uses is from a US company (Google, OpenAI, Anthropic), which is the right move for a US government tool.
- **Gemini first after testing.** Claude read the best at first but took around 15 seconds, and Haiku was faster but missed whole warnings. So I ran Gemini, two OpenAI models, and Claude head to head on the real samples. Gemini Flash-Lite won on accuracy and speed, so it goes first and the rest are backups.
- **Checking against the application.** I started with label-only checks. After rereading the brief, I saw the main task is matching the label to the application, so I added form reading and dropped the separate label-only tab.
- **Real samples only.** I tried made-up labels early on, then switched to real filings from TTB's registry so the tests reflect what agents actually see and because the made-up labels weren't very useful (they were too clear and easy to scan, so they weren't helpful in finding edge cases, whereas real labels often lead to finding edge cases that required improved prompting or different system design).
- **No cropping.** Splitting scans into form and label pieces kept losing things (it missed a 14.5% ABV), so the model reads the whole file and is told the label is inside it.
- **Code decides, not the model.** Models were inconsistent on the actual comparisons, so they only read and plain code does the matching. (In other words, the AI models are key to being able to read imperfectly photographed or arranged labels so quickly and accurately, but it turns out they weren't reliable at verifying that text.)
- **Fewer false alarms.** Early runs flagged too much, so only true mismatches fail. A value missing on one side passes with a note, and so does a warning that doesn't look clearly bold.
- **The spell check.** A real label that says "SHOUL" passed because most models autocorrected it. That's why disputed words now get spelled letter by letter. A "SUR-GEON" line break got flagged the other way (failing when it was just allowable line-break hyphenation), so line breaks and hyphens don't count.
- **Easy for people who aren't techy.** According to the assignment (and my own federal government experience), a lot of the end users won't be very tech literate, so I kept it to one drop area and one button, with big readable type, plain words instead of codes, and every verdict shown with an icon and a word, not just a color.
- **Progress right away.** An earlier 19-application test sat at 0 with no sign of life for a while, so I redid it so that each application is its own request and shows a spinner the moment you click Verify.
- **One file per application.** I tried separate drop areas, then matching loose labels to applications by brand, ABV, and so on. Since the COLA form already carries its labels, one drop area with one file per application is simpler and more reliable. If a user drops in a saved webpage folder, the app looks at the images linked in the HTML and uses those, so no separate locating is needed. At one point I tried an initial call to the models to sort out applications and their labels when they're uploaded separately, but that was causing scope creep and it seems clear that supporting COLAs as they are actually submitted, with the labels included or at least linked in the application, was a much clearer scope.

## Running it locally

After cloning the repo and cd'ing into it, run:
```bash
npm install
cp .env.example .env.local   # add at least one API key
npm run dev                   # http://localhost:3000
```

Keys: `GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`. Any one works, and each extra one adds a backup. `DATABASE_URL` (Postgres) is optional and turns on saved history.

## Tools

Next.js 16, React 19, TypeScript, and Tailwind CSS 4, deployed on Vercel. The vision models are called over their vendors' APIs. pdf-parse reads PDF text, sharp and heic-convert handle images, ExcelJS writes the export spreadsheet, and Neon Postgres stores the optional history.

## Assumptions

- Users (agents) upload the COLA application itself, since the labels are part of it (inside the file, or linked from a saved page).
- Only true mismatches fail. If a value is on one side but not the other, it passes with a note, since newer forms skip net contents and ABV when they're already on the label, and ABV is optional on most beer. "Needs review" means the models couldn't settle it, so a person should look. (I understand these rules from the online FAQs and manual, but of course my assumptions are only as accurate as they can be from my limited research window and what I could surmise from the instructions.)
- Class/type only has to be on the label. There are many valid designations, so the wording isn't graded against the form, but the form's product type (wine, beer, spirits) is shown next to it.
- Bold is required (based on 27 CFR 16.22 and Jenny's note in the GitHub assignment instructions), but models didn't agree on what looks bold in my testing, so a warning that isn't clearly bold passes with a note to check the bolding.
- Bottler name and address and country of origin aren't checked.
- It's a standalone prototype with no COLA integration and no login. Uploads aren't stored. With `DATABASE_URL` set, the results (values found and verdicts) are saved.

## Limitations

- It needs outbound access to the model APIs. On a locked-down secure network, those domains would need to be allowed/whitelisted, or the calls moved to an approved endpoint. I know this limitation was flagged in the assignment, but lightweight open-source (but still American-made) models could be considered on local hardware in the future as these models continue to become more efficient. Switching the backend models to whatever is approved for use (based on FedRAMP, agency guidelines, etc.) is easy, since all the model calls live in one file (`vision/providers.ts`).
- The app doesn't check type size, placement, contrast, or whether the warning is set apart from other text, but that could be incorporated in the future. In the future, the vision model prompts might also need to be hardened against hidden or transparent text that a savvy applicant could include to confuse an AI-based check, though the models likely already handle some of this.
- This isn't too much of a limitation, as angled or glary photos usually read fine, but if a label can't be read, its fields show up as missing, and the app could be improved in the future to try further enhancement methods for these besides trying other models (which it currently does).
- There's no local OCR. Tesseract couldn't read things like real angled bottle photos, so we stuck to AI vision models, but we could consider local OCR in the future as it improves, if it ever made sense from a time or API cost perspective.
- The app has been tested on more than 20 filings (the model comparison above used 19 of them), which is enough to rank the models but not enough for a full enterprise-level validation.

## Code layout

```
src/
  app/
    page.tsx                  the page
    globals.css               colors, type, buttons, tables
    api/verify/route.ts       checks one application against its labels
    api/history/route.ts      saved results (if DATABASE_URL is set)
  components/
    Verifier.tsx              the flow: drop, verify, results
    useFileIntake.ts          takes dropped files and groups them into applications
    Results.tsx               verdicts and the field-by-field tables
    WarningDiff.tsx           required warning vs. the label's, differences highlighted
    DropArea.tsx, FileList.tsx, Verdicts.tsx, Spinner.tsx, ThemeToggle.tsx
  lib/
    verifyWithApplication.ts  the field checks and how model opinions combine
    pairing.ts                which files are applications, and a saved page's label images
    extractApplication.ts     reads an application's fields
    warningCheck.ts           government warning rules
    warningSpellCheck.ts      letter-by-letter check when models disagree on the wording
    wordDiff.ts               word and letter comparisons that highlight what's different
    parse.ts                  ABV, volume, and category parsing
    fuzzyMatch.ts             name matching
    imagePrep.ts              HEIC/PDF/HTML handling, resizing
    vision/
      providers.ts            the models, their order, and timeouts
      labelPrompt.ts          the label prompt every model gets
      index.ts                models as label readers
      withTimeout.ts          stops a stuck model call
    sampleFiles.ts, exportXlsx.ts, db.ts, types.ts, verdict.ts
public/samples/               20 real COLA filings from TTB's public registry
```
