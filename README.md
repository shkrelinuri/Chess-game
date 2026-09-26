# Endgame Chess

Play locally against Stockfish 19 or match a random online opponent. Online games support all requested time controls, server-authoritative clocks and move validation, live SAN updates, resignation, and draw offers/acceptance. The computer mode supports three engine strengths, either color, promotion choice, move review, and undoing a turn. Game play is open to guests; Firebase sign-in is optional. The app now exports a static web build and can be packaged for iOS and Android with Capacitor.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. `npm run dev` starts Next.js, the Socket.IO game server on port 3001, and the authenticated API on port 3002. The install hook copies Stockfish's lite single-thread WASM engine and its license into `public/engine`; the engine runs in a browser Web Worker.

## Optional accounts

1. Copy `.env.local.example` to `.env.local` and add Firebase Web App values plus a Firebase Admin service-account JSON value.
2. In Firebase Authentication, enable Email/Password, Google, and Facebook. Add the native Firebase configuration files (`google-services.json` and `GoogleService-Info.plist`) before building mobile apps.
3. Add `localhost` to Firebase's authorized domains. For mobile, register the generated Android package and iOS bundle identifiers and configure native OAuth callback details.
4. Configure RevenueCat products for iOS monthly/annual, Play Store monthly/annual, and Web monthly/annual. Map every product to the single entitlement identifier `premium`; configure a current offering with `$rc_monthly` and `$rc_annual` packages. Fill in the three public SDK keys and the RevenueCat secret API key.
5. Set up PostgreSQL, run `npm run db:migrate`, and register `/api/revenuecat/webhook` in RevenueCat. Set the matching authorization value and optionally the HMAC signing secret.
6. For production web/native builds, set `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_SOCKET_URL` to public HTTPS/WSS-capable backend endpoints before building the static export.

Until providers and keys are configured, account/billing screens explain what is missing. Guest computer and online play do not depend on login. Do not commit `.env.local` or Firebase service-account credentials.

## iOS and Android

```bash
npm run cap:add:ios
npm run cap:add:android
npm run build
npm run cap:sync
npm run cap:open:ios
npm run cap:open:android
```

Capacitor uses `out/` as its bundled web directory. Native purchases use RevenueCat's StoreKit/Google Play SDK; web purchases use RevenueCat Web Billing. Both identify customers with the same Firebase UID and check only the RevenueCat `premium` entitlement. Store product IDs never grant access in application code.

Windows can generate and sync the iOS project, but building/signing it requires macOS and Xcode. Android builds require Android Studio/JDK. Store sandbox products and platform credentials are required to exercise real purchase/restore flows.

## Subscription usage boundaries

`useIsPremium()` is the only frontend entitlement hook. It reads the shared `premium` RevenueCat entitlement; the Node API independently looks up that same entitlement before it reserves any daily allowance. Free caps live together in `src/lib/subscriptions/limits.ts`. Counts are stored in PostgreSQL against the verified Firebase UID and the account's saved IANA timezone, so reinstalling does not reset them. The migration is `server/migrations/001_subscription_usage.sql`.

The API reserves a usage unit before returning permission; a blocked request returns a contextual 429 and the client opens `/paywall`. Subscription analytics are stored in `subscription_analytics`. RevenueCat lifecycle webhooks are idempotently stored and invalidate the short-lived entitlement cache. RevenueCat's SDK customer info drives purchase/restore UI immediately; foreground refresh and webhook sync cover changes made on another device.

The daily cap configuration is `analysis: 3`, `puzzle: 10`, `puzzleRush: 1`. Account creation is required to persist these limits. Guests keep unlimited computer/online play but must create an account before using account-backed limited tools or purchasing across devices.

## Premium

The Premium page offers monthly and annual selections with pricing marked TBD and proposed features labelled as planned. Checkout is disabled: there is no payment processor, price, or charge flow configured, and users cannot be charged.

## Game-state boundary

For computer games, browser chess.js owns legal moves, SAN, check, and results. For online games, the client may render the board, highlight/select moves, preflight them for responsiveness, and interpolate clock text from the last server snapshot. The Socket.IO server revalidates every move using chess.js and owns turn order, clock elapsed time/increments, timeout, resignation, draw agreement, and game result. The session manager in `server/game-session.ts` knows neither Socket.IO nor chess.js; it delegates board operations through a small rules adapter. Stockfish stays isolated from the UI thread.

## Verification

```bash
npm run test:server
npm run lint
npm run build
npm run db:migrate
npm run cap:sync
```

The online flow was exercised with two browser clients: they matched on Blitz 3|2, shared both moves, switched turn ownership, and accepted a draw on both screens. The subscription layer includes account-backed limits, entitlement gating, web/native purchase adapters, restore, settings management, contextual paywall analytics, and RevenueCat webhooks. RevenueCat/Firebase/PostgreSQL credentials, store catalog setup, and real store sandbox transactions are external setup requirements. The underlying full game analysis, puzzles, ratings, profiles, private links, spectating, chat, and live ads still need their feature implementations/ad provider.