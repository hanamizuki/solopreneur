---
name: gplay-iap-setup
description: In-app products, subscriptions, base plans, and offers setup for Google Play monetization. Use when configuring in-app purchases or subscription products.
---

# In-App Purchase Setup for Google Play

Use this skill when you need to set up monetization for your Android app.

## Two APIs: Legacy vs New Monetization

Google Play has two APIs for one-time products:

| | Legacy (`gplay iap`) | New Monetization (`gplay onetimeproducts`) |
|---|---|---|
| API | `inappproducts` | `monetization.onetimeproducts` |
| Price format | `priceMicros`/`currency` | `units`/`nanos`/`currencyCode` |
| Structure | Flat `prices` map | `purchaseOptions` with `regionalPricingAndAvailabilityConfigs` |
| States | `active`/`inactive` | `DRAFT` → `ACTIVE` (requires explicit activation) |
| Regional pricing | `--auto-convert-prices` flag | `--regions-version` required |

**Prefer the new monetization API** (`gplay onetimeproducts`) for new products. It supports purchase options, better regional pricing control, and is the actively developed API.

**Use the legacy API** (`gplay iap`) only for managing existing legacy products.

**Never mix the two APIs for the same product.** A product created via `gplay iap create` cannot be managed via `gplay onetimeproducts` and vice versa.

## Critical: Product IDs Are Permanent

**Google Play permanently reserves product IDs after deletion.** If you create `premium_unlock` and later delete it, the ID `premium_unlock` can never be reused — not even with a different API. Choose product IDs carefully.

This means:
- Do NOT create a "test" product with a good ID and then delete it
- Do NOT create via the legacy API and then try to recreate via the new API
- If you burn an ID, you must choose a new one (e.g., `premium_unlock_v2`)

## One-Time Products (New Monetization API)

### List products
```bash
gplay onetimeproducts list --package com.example.app
```

### Create product

**`--regions-version` is required** — the `create` command uses PATCH with `allowMissing=true` internally:
```bash
gplay onetimeproducts create \
  --package com.example.app \
  --product-id premium_unlock \
  --json @product.json \
  --regions-version "2025/03"
```

### product.json (new monetization format)
```json
{
  "productId": "premium_unlock",
  "listings": [
    { "languageCode": "en-US", "title": "Premium Unlock", "description": "Unlock all premium features" },
    { "languageCode": "es-ES", "title": "Desbloqueo Premium", "description": "Desbloquea todas las funciones premium" }
  ],
  "purchaseOptions": [
    {
      "buyOption": { "legacyCompatible": true },
      "newRegionsConfig": {
        "availability": "AVAILABLE",
        "usdPrice": { "currencyCode": "USD", "units": "9", "nanos": 990000000 },
        "eurPrice": { "currencyCode": "EUR", "units": "9", "nanos": 990000000 }
      },
      "regionalPricingAndAvailabilityConfigs": [
        { "regionCode": "US", "availability": "AVAILABLE", "price": { "currencyCode": "USD", "units": "9", "nanos": 990000000 } },
        { "regionCode": "GB", "availability": "AVAILABLE", "price": { "currencyCode": "GBP", "units": "7", "nanos": 990000000 } },
        { "regionCode": "IN", "availability": "AVAILABLE", "price": { "currencyCode": "INR", "units": "249", "nanos": 990000000 } }
      ]
    }
  ]
}
```

### Activate the purchase option

New products start in **DRAFT** state. You must activate before users can purchase:
```bash
gplay purchase-options batch-update-states \
  --package com.example.app \
  --product-id premium_unlock \
  --json '{"requests":[{"activatePurchaseOptionRequest":{"packageName":"com.example.app","productId":"premium_unlock","purchaseOptionId":"default"}}]}'
```

### Update product
```bash
gplay onetimeproducts patch \
  --package com.example.app \
  --product-id premium_unlock \
  --json @product-updated.json \
  --regions-version "2025/03" \
  --update-mask "purchaseOptions"
```

### Get product
```bash
gplay onetimeproducts get --package com.example.app --product-id premium_unlock
```

### Delete product
```bash
gplay onetimeproducts delete \
  --package com.example.app \
  --product-id premium_unlock \
  --confirm
```

### Batch operations
```bash
# Get multiple products
gplay onetimeproducts batch-get \
  --package com.example.app \
  --product-ids "premium_unlock,coins_100"

# Update multiple products (regionsVersion goes inside JSON)
gplay onetimeproducts batch-update \
  --package com.example.app \
  --json @products-batch.json
```

## Legacy In-App Products (IAP)

Use only for managing existing legacy products.

### List products
```bash
gplay iap list --package com.example.app
```

### Create product
```bash
gplay iap create \
  --package com.example.app \
  --sku premium_upgrade \
  --json @product.json
```

### product.json (legacy format)
```json
{
  "sku": "premium_upgrade",
  "status": "active",
  "purchaseType": "managedUser",
  "defaultPrice": {
    "priceMicros": "990000",
    "currency": "USD"
  },
  "prices": {
    "US": { "priceMicros": "990000", "currency": "USD" },
    "GB": { "priceMicros": "799000", "currency": "GBP" }
  },
  "listings": {
    "en-US": { "title": "Premium Upgrade", "description": "Unlock all premium features" },
    "es-ES": { "title": "Actualización Premium", "description": "Desbloquea todas las funciones premium" }
  }
}
```

### Update / Batch / Delete
```bash
# Update
gplay iap update --package com.example.app --sku premium_upgrade --json @product-updated.json

# Batch update
gplay iap batch-update --package com.example.app --json @products.json

# Batch get
gplay iap batch-get --package com.example.app --skus "premium,coins_100,coins_500"

# Delete (permanent — ID cannot be reused)
gplay iap delete --package com.example.app --sku premium_upgrade --confirm
```

## Subscriptions

### List subscriptions
```bash
gplay subscriptions list --package com.example.app
```

### Create subscription
```bash
gplay subscriptions create \
  --package com.example.app \
  --json @subscription.json
```

### subscription.json
Subscriptions use the `units`/`nanos`/`currencyCode` price format:
```json
{
  "productId": "premium_monthly",
  "basePlans": [
    {
      "basePlanId": "monthly",
      "state": "ACTIVE",
      "regionalConfigs": [
        {
          "regionCode": "US",
          "newSubscriberAvailability": true,
          "price": { "currencyCode": "USD", "units": "4", "nanos": 990000000 }
        }
      ],
      "autoRenewingBasePlanType": {
        "billingPeriodDuration": "P1M"
      }
    },
    {
      "basePlanId": "yearly",
      "state": "ACTIVE",
      "regionalConfigs": [
        {
          "regionCode": "US",
          "newSubscriberAvailability": true,
          "price": { "currencyCode": "USD", "units": "49", "nanos": 990000000 }
        }
      ],
      "autoRenewingBasePlanType": {
        "billingPeriodDuration": "P1Y"
      }
    }
  ],
  "listings": [
    { "languageCode": "en-US", "title": "Premium Subscription", "description": "Get all premium features" }
  ]
}
```

## Base Plans

Base plans define the billing period and price for subscriptions.

### Activate base plan
```bash
gplay baseplans activate \
  --package com.example.app \
  --product-id premium_monthly \
  --base-plan monthly
```

### Deactivate base plan
```bash
gplay baseplans deactivate \
  --package com.example.app \
  --product-id premium_monthly \
  --base-plan monthly
```

### Migrate prices
```bash
gplay baseplans migrate-prices \
  --package com.example.app \
  --product-id premium_monthly \
  --base-plan monthly \
  --json @migration.json
```

## Subscription Offers

Offers provide discounts, free trials, or introductory pricing.

### List offers
```bash
gplay offers list \
  --package com.example.app \
  --product-id premium_monthly \
  --base-plan monthly
```

### Create offer
```bash
gplay offers create \
  --package com.example.app \
  --product-id premium_monthly \
  --base-plan monthly \
  --json @offer.json
```

### offer.json (Free trial)
```json
{
  "offerId": "trial_7day",
  "state": "ACTIVE",
  "phases": [
    {
      "duration": "P7D",
      "pricingType": "FREE_TRIAL"
    }
  ],
  "regionalConfigs": [
    {
      "regionCode": "US"
    }
  ]
}
```

### offer.json (Introductory price)
```json
{
  "offerId": "intro_50_off",
  "state": "ACTIVE",
  "phases": [
    {
      "duration": "P1M",
      "pricingType": "SINGLE_PAYMENT",
      "price": {
        "priceMicros": "2490000",
        "currency": "USD"
      }
    }
  ]
}
```

### Activate/Deactivate offer
```bash
# Activate
gplay offers activate \
  --package com.example.app \
  --product-id premium_monthly \
  --base-plan monthly \
  --offer-id trial_7day

# Deactivate
gplay offers deactivate \
  --package com.example.app \
  --product-id premium_monthly \
  --base-plan monthly \
  --offer-id trial_7day
```

## OTP Purchase Option Offers

Manage offers on one-time product purchase options:
```bash
# List offers
gplay otp-offers list --package com.example.app --product-id premium_unlock --purchase-option-id default

# Activate offer
gplay otp-offers activate --package com.example.app --product-id premium_unlock --purchase-option-id default --offer-id promo_50off

# Deactivate offer
gplay otp-offers deactivate --package com.example.app --product-id premium_unlock --purchase-option-id default --offer-id promo_50off
```

## Regional Pricing

### Convert prices
```bash
gplay pricing convert \
  --package com.example.app \
  --json @price-request.json
```

### price-request.json
```json
{
  "basePriceMicros": "4990000",
  "baseCurrency": "USD",
  "targetCurrencies": ["GBP", "EUR", "JPY"]
}
```

## Common Monetization Patterns

### Pattern 1: New One-Time Product (recommended)
```bash
# 1. Create product
gplay onetimeproducts create \
  --package com.example.app \
  --product-id premium_unlock \
  --json @premium.json \
  --regions-version "2025/03"

# 2. Activate purchase option
gplay purchase-options batch-update-states \
  --package com.example.app \
  --product-id premium_unlock \
  --json '{"requests":[{"activatePurchaseOptionRequest":{"packageName":"com.example.app","productId":"premium_unlock","purchaseOptionId":"default"}}]}'

# 3. Verify
gplay onetimeproducts get --package com.example.app --product-id premium_unlock
```

### Pattern 2: Subscription with Free Trial
```bash
# 1. Create subscription
gplay subscriptions create \
  --package com.example.app \
  --json @sub.json

# 2. Create free trial offer
gplay offers create \
  --package com.example.app \
  --product-id premium \
  --base-plan monthly \
  --json @trial.json
```

### Pattern 3: Multi-Tier Subscription
```json
{
  "productId": "premium",
  "basePlans": [
    {
      "basePlanId": "basic_monthly",
      "regionalConfigs": [{ "regionCode": "US", "newSubscriberAvailability": true, "price": { "currencyCode": "USD", "units": "2", "nanos": 990000000 } }],
      "autoRenewingBasePlanType": { "billingPeriodDuration": "P1M" }
    },
    {
      "basePlanId": "premium_monthly",
      "regionalConfigs": [{ "regionCode": "US", "newSubscriberAvailability": true, "price": { "currencyCode": "USD", "units": "4", "nanos": 990000000 } }],
      "autoRenewingBasePlanType": { "billingPeriodDuration": "P1M" }
    },
    {
      "basePlanId": "premium_yearly",
      "regionalConfigs": [{ "regionCode": "US", "newSubscriberAvailability": true, "price": { "currencyCode": "USD", "units": "49", "nanos": 990000000 } }],
      "autoRenewingBasePlanType": { "billingPeriodDuration": "P1Y" }
    }
  ]
}
```

## Testing

### Use test purchases
In your app code, use test product IDs:
- `android.test.purchased`
- `android.test.canceled`
- `android.test.refunded`
- `android.test.item_unavailable`

### License testing
Add test accounts in Play Console:
Settings → License Testing → Add license testers

## Best Practices

1. **Use clear product IDs** - e.g., `premium_monthly`, not `prod_001`. IDs are permanent and cannot be reused after deletion.
2. **Prefer the new monetization API** - Use `gplay onetimeproducts` for new products, not `gplay iap`.
3. **Localize descriptions** - Provide listings for all supported languages.
4. **Set up regional pricing** - Use PPP pricing (see `gplay-ppp-pricing` skill) instead of same price everywhere.
5. **Activate after creation** - New OTP products start in DRAFT. Use `gplay purchase-options batch-update-states` to activate.
6. **Discover commands** - Run `gplay --help` to see all command groups. Purchase option management is under `gplay purchase-options`, not under `gplay onetimeproducts`.
7. **Test thoroughly** - Use test accounts and test product IDs.
8. **Monitor conversions** - Track which products/offers perform best.
9. **Update prices carefully** - Price changes affect existing subscribers.

## Billing Periods

- `P1W` - 1 week
- `P1M` - 1 month
- `P3M` - 3 months
- `P6M` - 6 months
- `P1Y` - 1 year
