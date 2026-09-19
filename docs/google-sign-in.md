# Google sign-in

The model detail login modal, login page, and registration page already offer
"Continue with Google" when both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
are configured. Without them, the button is hidden and `/auth/google` redirects
to the login page with `google_error=not_configured`.

Configure a Google OAuth web application for ClozDesign with this redirect URI:

```
https://www.cloz-design.com/auth/google/callback
```

Add the OAuth client credentials to the production Cloudflare Worker
`clothing-design` as secrets named `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
Optionally set `GOOGLE_REDIRECT_URI` to the URL above to pin the callback origin.
Do not commit credential values to the repository. For local development, copy
the corresponding entries from `.env.example` into `.env` and use an authorized
local callback URI.

After configuring the Worker, verify:

1. The signed-out model login modal displays "Continue with Google".
2. `/auth/google?next=%2Faccount` redirects to Google rather than
   `google_error=not_configured`.
3. Completing Google sign-in returns to the requested page.
4. Starting from the model login modal restores the editor when the user returns
   within the existing five-minute resume window.

The authorization request uses `openid profile email`. The callback validates
the OAuth state and requires a verified email, then signs into the existing
account with that email or creates a new account. No additional Google API scopes
are needed for this login flow.
