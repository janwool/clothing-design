# Subscription upgrade analytics

The upgrade dialog reports through `window.trackEvent` (GA4 / dataLayer). The dialog opts out of generic click tracking to avoid duplicate events.

| Event | Trigger |
| --- | --- |
| `upgrade_modal_view` | Dialog becomes visible; repeated open calls while visible are ignored |
| `upgrade_modal_close` | Dialog closes; includes `close_reason` and `duration_ms` |
| `upgrade_plan_loaded` | Account plan finishes loading |
| `upgrade_plan_load_error` | Account plan cannot load |
| `upgrade_billing_change` | Monthly/yearly choice changes; includes previous interval |
| `upgrade_plan_select` | An available plan checkout button is activated |
| `upgrade_compare_plans_click` | Compare all plans link |
| `upgrade_contact_click` | Contact upgrade link |
| `upgrade_checkout_begin` | Checkout attempt starts |
| `upgrade_checkout_login_required` | Checkout API returns 401; login opens in the payment tab |
| `upgrade_checkout_redirect` | Payment tab is directed to the checkout URL |
| `upgrade_checkout_error` | Popup blocked, timeout, or request fails |

Common parameters: `item_category=subscription`, `checkout_source=upgrade_modal`, `trigger_resource`, `current_plan`, `billing_interval`. The plan can be `unknown` on initial display before the account request finishes.

Checkout events also include `plan_id`, `currency=USD`, `value` (full billing-period price), and `checkout_provider=dodo_payments`. The selected plan, interval, and trigger are captured when checkout starts so later dialog changes do not change the checkout attribution. Error events use controlled reason codes rather than raw server messages.

Funnel: `upgrade_modal_view` → `upgrade_plan_select` → `upgrade_checkout_begin` → `upgrade_checkout_redirect`. Compare by trigger resource and billing interval.

These events cover the dialog and checkout handoff, not confirmed revenue. `upgrade_checkout_redirect` does not mean a successful payment. Verified payment notifications are currently processed and deduplicated in the backend's `billing_webhook_events`; they are not sent to GA4 as `purchase` events. Login continuation on the pricing page uses the existing `pricing_*` checkout events. No real payment or live analytics delivery was exercised by the automated tests.
