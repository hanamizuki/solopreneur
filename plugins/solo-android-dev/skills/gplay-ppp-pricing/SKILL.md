---
name: gplay-ppp-pricing
description: Set region-specific pricing for subscriptions and in-app purchases using purchasing power parity (PPP). Use when adjusting prices by country or implementing localized pricing strategies on Google Play.
---

# PPP Pricing (Per-Region Pricing)

Use this skill to set different prices for different countries based on purchasing power parity or custom pricing strategies.

## Preconditions
- Ensure credentials are set (`gplay auth login --service-account` or `GPLAY_SERVICE_ACCOUNT` env var).
- Use `GPLAY_PACKAGE` or pass `--package` explicitly.
- Know your base region (usually US) and base price.

## Critical: Required flags

When updating subscriptions or one-time products that modify pricing, you **must** provide:

- **`--regions-version`**: Required by the Google Play API when updating regional pricing. Use the **latest** version. If you don't know the current version, send any value (e.g., `"2022/02"`) — the API error will tell you the latest (e.g., `latest value is ExternalRegionLaunchVersionId{versionId=2025/03}`). Then retry with the correct version.
- **`--update-mask "basePlans"`**: Required for subscription updates. Without it, the API returns: "update_mask must contain at least one path."
- For one-time products, use `--update-mask "purchaseOptions"`.

## Critical: Preserve all existing regions (fetch-then-merge)

**The Google Play API rejects updates that remove existing regional configs.** If a subscription already has 173 regions configured and you send only 30 PPP regions, the API returns: "Regional configs were removed from the base plan: BM, BO, CI..."

**Always follow the fetch-then-merge pattern:**
1. Fetch the current product to get ALL existing regional configs
2. Override only the PPP target regions with your calculated prices
3. Send the complete merged list (all original regions + PPP overrides)

This also applies to:
- **`otherRegionsConfig`** for subscriptions — if it was previously set on a base plan, it **must** be included in the update JSON.
- **`newRegionsConfig`** for one-time product purchase options — if it was previously set (with `usdPrice`, `eurPrice`, and `availability`), it **must** be included. Omitting it causes: "Cannot remove currency for new regions once it has been added: EUR."

## Critical: Currency codes come from Google Play, not from assumptions

**Do NOT hardcode currency-to-region mappings.** Currency codes vary depending on the `--regions-version` value (e.g., Bulgaria BG uses BGN in older versions but EUR in newer versions after eurozone adoption).

**Always use the currency codes from the fetched existing regional configs.** For PPP target regions where you override the price, use the currency from the multiplier table below. For all other regions, preserve the existing currency exactly as returned by Google Play.

## PPP Multiplier Table

Apply these multipliers to the base USD price. Round all results to `.99` endings (e.g., $4.73 → $4.99, ₹249.37 → ₹249.99).

### Tier 1 — Full Price (1.0x–1.1x)
| Region | Code | Multiplier | Currency |
|--------|------|-----------|----------|
| United States | US | 1.0x | USD |
| United Kingdom | GB | 1.0x | GBP |
| Germany | DE | 1.0x | EUR |
| Australia | AU | 1.0x | AUD |
| Switzerland | CH | 1.1x | CHF |
| Canada | CA | 1.0x | CAD |
| Netherlands | NL | 1.0x | EUR |
| Sweden | SE | 1.0x | SEK |
| Norway | NO | 1.05x | NOK |
| Denmark | DK | 1.0x | DKK |

### Tier 2 — Medium (0.6x–0.8x)
| Region | Code | Multiplier | Currency |
|--------|------|-----------|----------|
| France | FR | 0.8x | EUR |
| Spain | ES | 0.7x | EUR |
| Italy | IT | 0.7x | EUR |
| Japan | JP | 0.8x | JPY |
| South Korea | KR | 0.7x | KRW |
| Poland | PL | 0.6x | PLN |
| Portugal | PT | 0.7x | EUR |
| Czech Republic | CZ | 0.6x | CZK |
| Greece | GR | 0.65x | EUR |
| Chile | CL | 0.6x | CLP |
| Saudi Arabia | SA | 0.8x | SAR |
| UAE | AE | 0.8x | AED |

### Tier 3 — Low (0.3x–0.5x)
| Region | Code | Multiplier | Currency |
|--------|------|-----------|----------|
| India | IN | 0.3x | INR |
| Brazil | BR | 0.5x | BRL |
| Mexico | MX | 0.45x | MXN |
| Indonesia | ID | 0.3x | IDR |
| Turkey | TR | 0.35x | TRY |
| Vietnam | VN | 0.3x | VND |
| Philippines | PH | 0.35x | PHP |
| Egypt | EG | 0.3x | EGP |
| Colombia | CO | 0.4x | COP |
| Argentina | AR | 0.3x | ARS |
| Nigeria | NG | 0.3x | NGN |
| Pakistan | PK | 0.25x | PKR |
| Thailand | TH | 0.4x | THB |
| Malaysia | MY | 0.45x | MYR |
| South Africa | ZA | 0.4x | ZAR |
| Ukraine | UA | 0.3x | UAH |

## Workflow: Set PPP-Based IAP Pricing (legacy `inappproducts` API)

Use this workflow for legacy managed products created via `gplay iap`. These use the `priceMicros`/`currency` format.

### 1. List in-app products
```bash
gplay iap list --package "PACKAGE"
```

### 2. Get current product details
```bash
gplay iap get --package "PACKAGE" --sku "SKU"
```
Note the current `defaultPrice` as your base price, and **save all existing `prices` entries**.

### 3. Build PPP-adjusted prices JSON (fetch-then-merge)

**You must include ALL existing region prices, not just PPP targets.** Fetch the current product, then override PPP regions.

```json
{
  "sku": "premium_upgrade",
  "defaultPrice": {
    "priceMicros": "9990000",
    "currency": "USD"
  },
  "prices": {
    "US": { "priceMicros": "9990000", "currency": "USD" },
    "IN": { "priceMicros": "2499900", "currency": "INR" },
    "BR": { "priceMicros": "24990000", "currency": "BRL" },
    "GB": { "priceMicros": "9990000", "currency": "GBP" },
    "DE": { "priceMicros": "9990000", "currency": "EUR" }
  }
}
```

### 4. Update the product
```bash
gplay iap update \
  --package "PACKAGE" \
  --sku "SKU" \
  --json @ppp-prices.json
```

### 5. Verify prices
```bash
gplay iap get --package "PACKAGE" --sku "SKU"
```

## Workflow: Create New One-Time Product with PPP Pricing

Use this workflow when creating a **brand new** one-time product with PPP pricing from scratch.

### 1. Reference an existing product for regional config structure
If you have an existing OTP, fetch it to use as a template for the regional config format:
```bash
gplay onetimeproducts get --package "PACKAGE" --product-id "EXISTING_PRODUCT_ID"
```
Note the `regionsVersion` and the structure of `regionalPricingAndAvailabilityConfigs`.

### 2. Build the product JSON with PPP pricing

Build the full product JSON including listings, purchase options, and all regional pricing configs. Price format uses `units`/`nanos`/`currencyCode` (see format reference below).

```json
{
  "productId": "premium_lifetime_50off",
  "listings": [
    { "languageCode": "en-US", "title": "Premium (50% off)", "description": "Lifetime access at 50% off" }
  ],
  "purchaseOptions": [
    {
      "buyOption": { "legacyCompatible": true },
      "newRegionsConfig": {
        "availability": "AVAILABLE",
        "usdPrice": { "currencyCode": "USD", "units": "14", "nanos": 990000000 },
        "eurPrice": { "currencyCode": "EUR", "units": "13", "nanos": 990000000 }
      },
      "regionalPricingAndAvailabilityConfigs": [
        { "regionCode": "US", "availability": "AVAILABLE", "price": { "currencyCode": "USD", "units": "14", "nanos": 990000000 } },
        { "regionCode": "IN", "availability": "AVAILABLE", "price": { "currencyCode": "INR", "units": "373", "nanos": 990000000 } },
        { "regionCode": "BR", "availability": "AVAILABLE", "price": { "currencyCode": "BRL", "units": "37", "nanos": 990000000 } }
      ]
    }
  ]
}
```

### 3. Create the product

**`--regions-version` is required even for creation** — the `create` command uses PATCH with `allowMissing=true` internally:
```bash
gplay onetimeproducts create \
  --package "PACKAGE" \
  --product-id "premium_lifetime_50off" \
  --json @new-otp.json \
  --regions-version "2025/03"
```

The product is created in **DRAFT** state.

### 4. Activate the purchase option

New products start in DRAFT. Use `purchase-options batch-update-states` to activate:
```bash
gplay purchase-options batch-update-states \
  --package "PACKAGE" \
  --product-id "premium_lifetime_50off" \
  --json '{"requests":[{"activatePurchaseOptionRequest":{"packageName":"PACKAGE","productId":"premium_lifetime_50off","purchaseOptionId":"default"}}]}'
```

### 5. Verify the product
```bash
gplay onetimeproducts get --package "PACKAGE" --product-id "premium_lifetime_50off"
```
Confirm the state is `ACTIVE` and all regional prices are correct.

## Workflow: Update Existing One-Time Product PPP Pricing (new monetization API)

Use this workflow for **existing** one-time products created via `gplay onetimeproducts`. These use the `units`/`nanos`/`currencyCode` format and have `purchaseOptions` with `regionalPricingAndAvailabilityConfigs`.

### 1. List one-time products
```bash
gplay onetimeproducts list --package "PACKAGE"
```

### 2. Get current product and save all regional configs
```bash
gplay onetimeproducts get --package "PACKAGE" --product-id "PRODUCT_ID"
```

Save the full JSON. Note:
- `purchaseOptions[].regionalPricingAndAvailabilityConfigs` array — you need ALL entries
- `purchaseOptions[].newRegionsConfig` — **must be included if previously set** (contains `usdPrice`, `eurPrice`, `availability`)

### 3. Build PPP-adjusted JSON (fetch-then-merge)

Start with the **complete** list of existing `regionalPricingAndAvailabilityConfigs`, then override PPP target regions with calculated prices. Keep all other regions unchanged.

Price format uses `units` (whole part as string) and `nanos` (fractional part as integer, 0–999999999):
- $5.99 → `"units": "5", "nanos": 990000000`
- ₹149.99 → `"units": "149", "nanos": 990000000`
- ¥719 → `"units": "719", "nanos": 0`

```json
{
  "productId": "premium_lifetime",
  "purchaseOptions": [
    {
      "purchaseOptionId": "EXISTING_OPTION_ID",
      "buyOption": { "legacyCompatible": true },
      "newRegionsConfig": {
        "availability": "AVAILABLE",
        "usdPrice": { "currencyCode": "USD", "units": "29", "nanos": 990000000 },
        "eurPrice": { "currencyCode": "EUR", "units": "27", "nanos": 990000000 }
      },
      "regionalPricingAndAvailabilityConfigs": [
        { "regionCode": "US", "availability": "AVAILABLE", "price": { "currencyCode": "USD", "units": "29", "nanos": 990000000 } },
        { "regionCode": "IN", "availability": "AVAILABLE", "price": { "currencyCode": "INR", "units": "746", "nanos": 990000000 } },
        { "regionCode": "BR", "availability": "AVAILABLE", "price": { "currencyCode": "BRL", "units": "74", "nanos": 990000000 } },
        { "regionCode": "AE", "availability": "AVAILABLE", "price": { "currencyCode": "AED", "units": "109", "nanos": 990000000 } }
      ]
    }
  ]
}
```

**IMPORTANT:**
- The `regionalPricingAndAvailabilityConfigs` array must contain ALL regions from the existing product. Only override prices for PPP target regions.
- The `newRegionsConfig` must be included if the existing product had it set. Omitting it causes: "Cannot remove currency for new regions once it has been added."

### 4. Patch the product
```bash
gplay onetimeproducts patch \
  --package "PACKAGE" \
  --product-id "PRODUCT_ID" \
  --json @ppp-otp.json \
  --regions-version "2025/03" \
  --update-mask "purchaseOptions"
```

### 5. Verify prices
```bash
gplay onetimeproducts get --package "PACKAGE" --product-id "PRODUCT_ID"
```

## Workflow: Set PPP-Based Subscription Pricing

### 1. List subscriptions
```bash
gplay subscriptions list --package "PACKAGE"
```

### 2. Get current subscription and save all regional configs
```bash
gplay subscriptions get --package "PACKAGE" --product-id "PRODUCT_ID"
```

Save the full JSON. For each base plan, note:
- `otherRegionsConfig` (USD and EUR base prices) — **must be included if previously set**
- `regionalConfigs` array — **must contain ALL existing regions**
- `autoRenewingBasePlanType` or `prepaidBasePlanType`

### 3. Build PPP-adjusted subscription JSON (fetch-then-merge)

Start with the **complete** existing `regionalConfigs` for each base plan, then override PPP target regions. Keep all other regions unchanged.

Subscription prices use `units`/`nanos`/`currencyCode` format:

```json
{
  "productId": "premium_monthly",
  "basePlans": [
    {
      "basePlanId": "monthly",
      "otherRegionsConfig": {
        "newSubscriberAvailability": true,
        "usdPrice": { "currencyCode": "USD", "units": "5", "nanos": 990000000 },
        "eurPrice": { "currencyCode": "EUR", "units": "5", "nanos": 70000000 }
      },
      "regionalConfigs": [
        { "regionCode": "US", "newSubscriberAvailability": true, "price": { "currencyCode": "USD", "units": "5", "nanos": 990000000 } },
        { "regionCode": "IN", "newSubscriberAvailability": true, "price": { "currencyCode": "INR", "units": "149", "nanos": 990000000 } },
        { "regionCode": "BR", "newSubscriberAvailability": true, "price": { "currencyCode": "BRL", "units": "14", "nanos": 990000000 } },
        { "regionCode": "AE", "newSubscriberAvailability": true, "price": { "currencyCode": "AED", "units": "22", "nanos": 990000000 } }
      ],
      "autoRenewingBasePlanType": { "billingPeriodDuration": "P1M" }
    }
  ]
}
```

**IMPORTANT:** The `regionalConfigs` array must contain ALL regions from the existing base plan. If the subscription already has 173 regions, all 173 must be present. Only override prices for PPP target regions.

### 4. Update the subscription
```bash
gplay subscriptions update \
  --package "PACKAGE" \
  --product-id "PRODUCT_ID" \
  --json @ppp-subscription.json \
  --regions-version "2025/03" \
  --update-mask "basePlans"
```

**All three flags are required:**
- `--json`: The subscription JSON with merged regional configs
- `--regions-version`: Use the latest version (see "Discovering the regions version" below)
- `--update-mask "basePlans"`: Tells the API which fields to update

### 5. Verify prices
```bash
gplay subscriptions get --package "PACKAGE" --product-id "PRODUCT_ID"
```
Review all `regionalConfigs` across all base plans to confirm PPP target regions have updated prices and all other regions are preserved.

## Discovering the regions version

The `--regions-version` flag is required when updating pricing. To find the latest version:

1. Try your update with any version (e.g., `"2022/02"`)
2. If the version is outdated, the API error will tell you the latest:
   ```
   Invalid regions version 2024/01, latest value is ExternalRegionLaunchVersionId{versionId=2025/03}
   ```
3. Retry with the version from the error message

**Currency codes can change between versions** (e.g., countries joining the eurozone). Always use the currency codes from the **fetched existing data**, not hardcoded mappings.

## Workflow: Migrate Existing Subscriber Prices

When updating PPP prices on subscriptions with active subscribers, new prices only apply to new subscribers. To migrate existing subscribers:

### 1. Update prices (steps above)

### 2. Migrate existing subscribers to new prices
```bash
gplay baseplans migrate-prices \
  --package "PACKAGE" \
  --product-id "PRODUCT_ID" \
  --base-plan "BASE_PLAN_ID" \
  --json @migration.json
```

### 3. Repeat for each base plan
Apply migration to every base plan that had its prices changed:
```bash
# Monthly plan
gplay baseplans migrate-prices \
  --package "PACKAGE" \
  --product-id "PRODUCT_ID" \
  --base-plan monthly \
  --json @migration.json

# Yearly plan
gplay baseplans migrate-prices \
  --package "PACKAGE" \
  --product-id "PRODUCT_ID" \
  --base-plan yearly \
  --json @migration.json
```

### 4. Verify migration
```bash
gplay subscriptions get --package "PACKAGE" --product-id "PRODUCT_ID"
```

## Updating Existing PPP Prices

To change a region's price:
1. Fetch the current product/subscription to get ALL existing regional configs.
2. Recompute the PPP-adjusted price with the new base price or new multiplier.
3. Merge the new PPP prices into the complete regional configs list.
4. Update with the merged JSON (must include ALL regions, not just the changed ones).
5. For subscriptions with active subscribers, run `migrate-prices` for each affected base plan.
6. Verify with a fetch + summary review.

## Batch PPP for Multiple Products

### Multiple legacy IAPs
```bash
gplay iap batch-update \
  --package "PACKAGE" \
  --json @ppp-all-iaps.json
```

### Multiple one-time products

For batch updates, `regionsVersion` and `updateMask` go **inside each request** in the JSON (not as CLI flags):

```bash
gplay onetimeproducts batch-update \
  --package "PACKAGE" \
  --json @ppp-all-otps.json
```

Batch JSON format:
```json
{
  "requests": [
    {
      "oneTimeProduct": { "productId": "product_1", "purchaseOptions": [...] },
      "regionsVersion": { "version": "2025/03" },
      "updateMask": "purchaseOptions"
    },
    {
      "oneTimeProduct": { "productId": "product_2", "purchaseOptions": [...] },
      "regionsVersion": { "version": "2025/03" },
      "updateMask": "purchaseOptions"
    }
  ]
}
```

### Multiple subscriptions
Update each subscription individually:
```bash
gplay subscriptions update --package "PACKAGE" --product-id "sub_1" --json @ppp-sub1.json --regions-version "2025/03" --update-mask "basePlans"
gplay subscriptions update --package "PACKAGE" --product-id "sub_2" --json @ppp-sub2.json --regions-version "2025/03" --update-mask "basePlans"
```

## Common PPP Strategies

### BigMac Index Approach
Adjust prices based on relative purchasing power:
- USA: $9.99 (baseline)
- India: $2.99 (~70% discount)
- Brazil: $4.99 (~50% discount)
- UK: $9.99 (similar)
- Switzerland: $10.99 (premium)

### Tiered Regional Pricing
Group countries into pricing tiers:
- **Tier 1 (Full)**: USA, UK, Germany, Australia, Switzerland, Canada
- **Tier 2 (Medium)**: France, Spain, Italy, Japan, South Korea, Saudi Arabia
- **Tier 3 (Low)**: India, Brazil, Mexico, Indonesia, Turkey, Vietnam, Egypt

### Revenue Optimization
- Start with Tier 3 discounts to capture volume in price-sensitive markets.
- Monitor conversion rates per region after applying PPP.
- Adjust multipliers based on actual revenue data.

## Common Pitfalls

1. **Sending only PPP regions** — The API rejects updates that remove existing regions. Always fetch-then-merge.
2. **Missing `--regions-version`** — Required for any pricing update. The API error will tell you the latest version if you guess wrong.
3. **Missing `--update-mask`** — Use `"basePlans"` for subscriptions, `"purchaseOptions"` for one-time products.
4. **Missing `otherRegionsConfig`** — If a subscription base plan previously had `otherRegionsConfig` set, it must be included in the update.
5. **Missing `newRegionsConfig`** — If a one-time product purchase option previously had `newRegionsConfig` set, it must be included. Omitting it causes: "Cannot remove currency for new regions once it has been added."
6. **Wrong currency codes** — Don't assume currencies. Fetch from Google Play, as they change between regions versions.
7. **Mixing API formats** — Legacy IAPs use `priceMicros`/`currency`. New subscriptions and one-time products use `units`/`nanos`/`currencyCode`. Don't mix them.
8. **`--dry-run` is a global flag** — Place it **before** the subcommand: `gplay --dry-run subscriptions update ...`, NOT `gplay subscriptions update --dry-run ...`. The latter fails with "flag provided but not defined."
9. **Batch-update JSON format** — For `onetimeproducts batch-update` and `subscriptions batch-update`, `regionsVersion` and `updateMask` go **inside each request object** in the JSON, not as CLI flags.
10. **Product IDs are permanent** — Google Play permanently reserves product IDs after deletion. If you create a product via `gplay iap create` then delete it, the ID cannot be reused — not even with `gplay onetimeproducts create`. Always choose product IDs carefully. Do **not** create a product via the legacy API and then try to recreate it via the new API.
11. **New OTP products start in DRAFT** — After `gplay onetimeproducts create`, the purchase option is in DRAFT state. You must activate it with `gplay purchase-options batch-update-states` before it's available to users.
12. **`--regions-version` is required for create too** — `onetimeproducts create` uses PATCH with `allowMissing=true` internally, so `--regions-version` is required even when creating new products, not just when updating.
13. **Discover commands with `gplay --help`** — Purchase option activation is under `gplay purchase-options`, not under `gplay onetimeproducts`. Always run `gplay --help` to see all top-level command groups.

## Notes
- Price changes for subscriptions apply immediately to new subscribers.
- Existing subscribers require explicit price migration via `migrate-prices`.
- Use `gplay pricing convert` for currency conversion reference, but apply PPP multipliers on top.
- Always verify prices after updates by fetching the product and reviewing the summary.
- The PPP multiplier table provides starting points — adjust based on your market data and revenue goals.
