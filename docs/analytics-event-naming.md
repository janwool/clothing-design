# Analytics event naming

Every tracked function uses its own GA4 event name. Do not reuse generic names such as
`ui_interaction`, `navigation_click`, `select_item`, or `tool_interaction` and rely on a
parameter to explain what happened.

## Rule

Use lowercase snake case in this order:

`<surface>_<feature-or-target>_<action>`

Examples:

- `pricing_billing_monthly_click`
- `pricing_pro_signup_start`
- `pricing_pro_checkout_begin`
- `pricing_business_contact_click`
- `designer_current_view_render_download`
- `model_detail_fabric_motion_enable`

The analytics runtime sanitizes names to GA4-compatible characters. GA4's 40-character
limit is enforced by retaining a readable prefix and appending a deterministic hash, so
two long functional names do not collapse into the same event.

## Ownership

Controls with dedicated component analytics must use `data-analytics-managed="true"`.
The global click listener ignores these controls, preventing a dedicated event from also
being recorded as a generic navigation or button click.

Parameters may carry context such as price, plan, item, or previous state, but parameters
must not be the only way to identify which user function occurred.

## White Mockup detail funnel

- `white_mockup_detail_page_view`
- `white_mockup_detail_breadcrumb_home_click`
- `white_mockup_detail_breadcrumb_library_click`
- `white_mockup_editor_ready`
- `white_mockup_empty_stage_upload_click`
- `white_mockup_artwork_picker_open`
- `white_mockup_artwork_picker_select`
- `white_mockup_artwork_drop_select`
- `white_mockup_artwork_move_complete`
- `white_mockup_artwork_scale_complete`
- `white_mockup_artwork_rotate_complete`
- `white_mockup_artwork_reset_click`
- `white_mockup_bg_<color>_select`
- `white_mockup_color_<color>_select`
- `white_mockup_project_create_begin`
- `white_mockup_project_create_success`
- `white_mockup_project_update_begin`
- `white_mockup_project_update_success`
- `white_mockup_png_download_begin`
- `white_mockup_png_download_success`
- `white_mockup_detail_faq_open`
- `white_mockup_detail_faq_close`
- `white_mockup_detail_related_view_all_click`
- `white_mockup_detail_related_select`

Failure and authentication branches use equally direct `_error`, `_signin_required`, or
`_session_expired` names. Long names are shortened by the runtime according to the rule
above before they are sent to GA4.
