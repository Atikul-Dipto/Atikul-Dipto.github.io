# DorAI browser extension

On a Daraz or Cartup product page, DorAI shows a small panel with:
- the same product on the other store, and how its price compares;
- a cheaper offer of it from a seller worth trusting, on either store;
- its other sizes;
- the lowest price DorAI has seen for it.

If there's nothing cheaper, the panel stays a small "Best price we found" pill.

It works in Chrome, Edge and Firefox, from one Manifest V3 folder.

## What it sends, and where

The product page's address and title, and nothing else, go to DorAI's compare service at `https://atikul-islam-portfolio.pages.dev/api/pp/compare` ([`../worker/compare.ts`](../worker/compare.ts)). The request comes from the extension's background script, never from the store's page.

The service logs the product address to see how answers go. It keeps nothing about the person browsing: no account, no cookies, no history of their pages.

Each product's answer is cached for 6 hours. Many shoppers on one page therefore don't turn into a stream of requests to Daraz or Cartup.

## Try it

- **Chrome or Edge:** open `chrome://extensions` (or `edge://extensions`), turn on **Developer mode**, click **Load unpacked**, and choose this `extension` folder.
- **Firefox:** open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on**, and choose `manifest.json`. It's removed when Firefox closes.

Then open any Daraz or Cartup product page.

## Publishing (free stores first)

| Store | Cost | Notes |
|---|---|---|
| Microsoft Edge Add-ons | Free | Partner Center account. |
| Firefox Add-ons (AMO) | Free | `browser_specific_settings.gecko` is already set. Check the `data_collection_permissions` categories against Mozilla's list when submitting. |
| Chrome Web Store | $5 once | Not used yet; the owner decides. |

Zip the folder's contents, with `manifest.json` at the top of the zip:

```powershell
Compress-Archive -Path extension\* -DestinationPath dorai-extension.zip -Force
```

The icons are the DorAI logo (`public/logo.png`), resized. Replace them from the original logo file when it is available; they were cut from a screenshot at 240px.

## Testing note

Branded Chrome (137 and later) ignores `--load-extension`, so automated checks use Chrome for Testing. With Selenium, set `options.browser_version = 'beta'`.
