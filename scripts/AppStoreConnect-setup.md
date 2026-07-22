# App Store Connect setup sheet — follow top to bottom (dad's account does all of it)

## A. Before anything sells: agreements (dad, ~20 min, one time)
App Store Connect (appstoreconnect.apple.com) > Business:
1. Accept the **Paid Apps agreement**
2. **Banking**: add the payout bank account
3. **Tax**: complete the W-9 (US)
Until A is done, in-app purchases cannot go live.

## B. Create the app record
My Apps > "+" > New App:
- Platform: iOS (macOS later)
- Name: **Quizard — SSAT Prep**
- Subtitle: **Master the math, ace the test**
- Primary language: English (US) · Bundle ID: **com.samtech.quizard** · SKU: quizard-001
- Category: Education. Age rating questionnaire: answer everything "None"; DO NOT enroll in the Kids category.

## C. Subscriptions (Monetization > Subscriptions)
Create ONE subscription group: **Quizard Premium**, with three 3-MONTH auto-renewable plans:
| Reference name | Product ID | Duration | Price | Family Sharing |
|---|---|---|---|---|
| Solo Season | com.samtech.quizard.solo.season | 3 months | $74.99 | OFF |
| Unlimited Season | com.samtech.quizard.unlimited.season | 3 months | $99.99 | OFF |
| Family Season | com.samtech.quizard.family.season | 3 months | $349.99 | **ON** |
(Family Sharing requires auto-renewable — that's why these are subscriptions, not one-time passes.)

## D. Things Claude builds once A–C exist
- Privacy policy page (required URL for the listing) — hosted on the quizard site
- iOS WKWebView shell + TestFlight build (needs Xcode installed on this Mac)
- StoreKit checkout in the app replacing the beta instant-unlock, with server-side receipt checks
