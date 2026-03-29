# BiteBuddy — Group Food Ordering App

**Product Requirements Document — Sample App**

| Field   | Value                    |
| ------- | ------------------------ |
| Author  | AgentForge Team          |
| Date    | March 27, 2026           |
| Status  | Sample / Reference       |
| Version | 1.0                      |
| Purpose | Component catalog showcase (non-dashboard) |

---

## 1. Overview

BiteBuddy is a group food ordering app for friends, roommates, and office teams.
One person starts a group order from a restaurant, shares a link, and everyone
adds their items. The app splits the bill, tracks who paid, and saves favorite
orders. No dashboards — just a fast, linear ordering flow.

**Target platforms:** desktop (1440px), responsive to tablet (768px).

---

## 2. Design Tokens

```yaml
colors:
  cta-primary: "#F97316"        # Orange-500
  cta-primary-hover: "#EA580C"  # Orange-600
  text-primary: "#18181B"       # Zinc-900
  text-secondary: "#71717A"     # Zinc-500
  text-on-cta: "#FFFFFF"
  surface-primary: "#FFFFFF"
  surface-secondary: "#F4F4F5"  # Zinc-100
  surface-elevated: "#FAFAFA"   # Zinc-50
  surface-input: "#FFFFFF"
  border-default: "#E4E4E7"     # Zinc-200
  success: "#16A34A"
  warning: "#EAB308"
  error: "#DC2626"

typography:
  heading-1: { size: 26, weight: 700, line-height: 1.2 }
  heading-2: { size: 20, weight: 600, line-height: 1.3 }
  heading-3: { size: 16, weight: 600, line-height: 1.4 }
  body: { size: 15, weight: 400, line-height: 1.5 }
  label: { size: 13, weight: 500, line-height: 1.4 }
  caption: { size: 11, weight: 400, line-height: 1.3 }

spacing:
  xs: 4
  sm: 8
  md: 16
  lg: 24
  xl: 32

shadows:
  sm: "0 1px 3px rgba(0,0,0,0.06)"
  md: "0 4px 12px rgba(0,0,0,0.08)"
```

---

## 3. Pages & Screens

### 3.1 Restaurant Browse

A scrollable list of nearby restaurants with search and category filters.

**Layout:** Search bar pinned top, horizontal filter row, vertical restaurant list.

#### Components used:

| Component           | Usage                                                        |
| ------------------- | ------------------------------------------------------------ |
| `input-text`        | Search bar — label: "Search", placeholder: "Pizza, sushi, tacos..." |
| `chip`              | Horizontal category filter row — "All", "Pizza", "Asian", "Mexican", "Burgers", "Healthy", "Dessert" |
| `card`              | Restaurant card — contains name, cuisine type, delivery time, rating |
| `badge`             | "Free Delivery" promo badge on eligible restaurants          |
| `badge`             | "Popular" badge on trending restaurants                      |
| `display-readonly`  | Delivery estimate — "25–35 min" and minimum order — "$15.00" |
| `skeleton`          | 4 restaurant card placeholders while fetching results        |
| `loading-spinner`   | Pull-to-refresh indicator at top                             |
| `link`              | "View full menu" — inline link on each restaurant card       |
| `alert`             | Location banner — "Showing restaurants near Downtown. Change location?" |

#### Behavior:
- On first load, show `skeleton` cards for 4 restaurants.
- Typing in `input-text` debounces 300ms then filters list.
- `chip` filters are single-select; tapping one deselects the previous.
- `alert` at top allows changing delivery address.
- Tapping a `card` navigates to Menu (3.2).

---

### 3.2 Restaurant Menu

Full menu for a selected restaurant with item categories and add-to-cart flow.

**Layout:** Restaurant header, segmented category nav, scrollable item list, sticky cart bar at bottom.

#### Components used:

| Component           | Usage                                                        |
| ------------------- | ------------------------------------------------------------ |
| `segmented-control` | Menu category switcher — options: ["Mains", "Sides", "Drinks", "Desserts"] |
| `card`              | Menu item card — name, description, price, optional image    |
| `badge`             | "Spicy" tag, "Vegetarian" tag, "Best Seller" tag on items   |
| `chip`              | Dietary filter chips — "Vegetarian", "Vegan", "Gluten-Free" |
| `button-primary`    | "Add to Order" on each menu item card                        |
| `button-ghost`      | "Customize" — opens item customization sheet                 |
| `stepper`           | Quantity selector on item card — label: "Qty", value: 1, min: 1, max: 10 |
| `tooltip`           | Allergen info icon next to items — content: "Contains: peanuts, soy, gluten" |
| `avatar`            | Small chef avatar next to "Chef's Pick" items                |
| `stat`              | Sticky cart bar showing item count and total — "3 items · $27.50" |
| `skeleton`          | Menu item placeholders while category loads                  |
| `switch`            | "Show only available items" — filters out sold-out items     |

#### Behavior:
- `segmented-control` switches between menu categories, loading new items.
- `stepper` adjusts quantity; "Add to Order" adds item with current quantity.
- `chip` dietary filters are multi-select (toggle on/off).
- `stat` at bottom acts as cart summary; tapping navigates to Cart (3.3).
- `switch` toggle filters out greyed-out unavailable items.
- `tooltip` on allergen icon expands on tap with ingredient list.

---

### 3.3 Cart & Customization

Review all items in the order, customize individual items, apply promo codes.

**Layout:** Scrollable item list, promo code input, order summary, sticky checkout button.

#### Components used:

| Component           | Usage                                                        |
| ------------------- | ------------------------------------------------------------ |
| `card`              | Each cart item — name, customizations, quantity, line total   |
| `stepper`           | Quantity adjuster per item — min: 0 (removes item), max: 10 |
| `checkbox`          | Customization options — "Extra cheese (+$1.50)", "No onions", "Add bacon (+$2.00)", "Gluten-free bun (+$1.00)" |
| `select`            | Size selector — label: "Size", options: "Regular", "Large", "Family" |
| `select`            | Spice level — label: "Spice Level", options: "Mild", "Medium", "Hot", "Extra Hot" |
| `input-text`        | Special instructions — label: "Special Requests", placeholder: "e.g., no pickles, extra napkins" |
| `input-text`        | Promo code field — label: "Promo Code", placeholder: "Enter code..." |
| `button-secondary`  | "Apply" — next to promo code input                          |
| `button-ghost`      | "Remove" — per-item remove action                           |
| `display-readonly`  | Order summary lines — "Subtotal", "Delivery Fee", "Tax", "Discount" |
| `display-readonly`  | Total — bold, larger — "$34.75"                              |
| `badge`             | "20% OFF" badge next to discount line when promo applied     |
| `alert`             | Success — "Promo LUNCH20 applied! You saved $6.95"          |
| `alert`             | Error — "Invalid promo code. Please check and try again."   |
| `button-primary`    | "Checkout · $34.75" — full-width sticky at bottom           |
| `tooltip`           | Info next to "Delivery Fee" — content: "Free delivery on orders over $25" |
| `link`              | "Continue browsing" — returns to restaurant menu             |

#### Behavior:
- Setting `stepper` to 0 triggers a confirmation, then removes the item.
- `checkbox` customizations update the line total in real-time.
- `select` for size recalculates item price immediately.
- Applying a valid promo shows success `alert`; invalid shows error `alert`.
- `display-readonly` summary updates live as items change.
- Empty cart shows an illustration with `link` "Browse restaurants".

---

### 3.4 Group Order & Split

Start a group order, see who's added what, and split the bill.

**Layout:** Group members list, per-person breakdown, split controls.

#### Components used:

| Component           | Usage                                                        |
| ------------------- | ------------------------------------------------------------ |
| `card`              | Per-member order card — avatar, name, their items, their subtotal |
| `avatar`            | Member avatars with initials — "PG", "AK", "MJ", "SR"      |
| `badge`             | "Host" badge on the person who started the order             |
| `badge`             | "Joined" / "Pending" status badge per member                 |
| `input-currency`    | Tip amount — label: "Tip", placeholder: "0.00"              |
| `segmented-control` | Tip percentage quick-select — options: ["15%", "18%", "20%", "Custom"] |
| `segmented-control` | Split method — options: ["Equal", "By Item", "Custom"]      |
| `input-currency`    | Custom split amount per person (shown when "Custom" selected) |
| `display-readonly`  | Per-person total — "Your share: $12.35"                      |
| `stat`              | Order total stat — "Group Total · $49.40"                    |
| `checkbox`          | "I've paid my share" — per-member payment confirmation       |
| `switch`            | "Send payment reminders" — toggle for the host               |
| `chip`              | Payment status chips per member — "Paid", "Pending", "Declined" |
| `button-primary`    | "Place Group Order" — confirms and submits to restaurant     |
| `button-secondary`  | "Share Invite Link" — copies link or opens share sheet       |
| `button-ghost`      | "Leave Group" — exits the group order                        |
| `link`              | "Pay via Venmo" / "Pay via Zelle" — deep links to payment apps |
| `tooltip`           | Info next to split method — content: "'By Item' charges each person only for what they ordered, plus an equal share of tax and delivery" |
| `alert`             | "Waiting for 2 members to confirm their orders"              |
| `loading-spinner`   | Shown while calculating split amounts                        |
| `skeleton`          | Placeholder for member cards while group data loads          |

#### Behavior:
- `segmented-control` for tip: selecting a percentage auto-fills `input-currency`; selecting "Custom" clears it for manual entry.
- `segmented-control` for split: "Equal" divides total evenly; "By Item" calculates per-person based on their items; "Custom" shows `input-currency` per person.
- `checkbox` "I've paid" is only enabled for the current user's row.
- `chip` payment status updates in real-time via websocket.
- Host sees `switch` for reminders; non-hosts don't see it.
- `loading-spinner` appears briefly when switching split methods.

---

### 3.5 Order Tracking

Live order status after placement with delivery tracking.

**Layout:** Linear progress tracker, order details, contact actions.

#### Components used:

| Component           | Usage                                                        |
| ------------------- | ------------------------------------------------------------ |
| `card`              | Order status card — current step highlighted                 |
| `badge`             | Status step badges — "Confirmed", "Preparing", "On the Way", "Delivered" |
| `display-readonly`  | Estimated delivery — "Arriving by 7:45 PM"                   |
| `display-readonly`  | Order number — "#BT-4829"                                    |
| `avatar`            | Delivery driver avatar with name                             |
| `stat`              | Live ETA countdown — "12 min away"                           |
| `button-primary`    | "Reorder This" — after delivery, quick reorder               |
| `button-secondary`  | "Rate Order" — post-delivery rating prompt                   |
| `button-ghost`      | "Need Help?" — opens support chat                            |
| `link`              | "Call Driver" — tel: link to driver's number                 |
| `link`              | "View Receipt" — opens receipt detail                        |
| `alert`             | "Your order has been picked up! Driver is on the way."       |
| `loading-spinner`   | Pulsing indicator next to active status step                 |
| `tooltip`           | Info next to ETA — content: "Estimated time may vary based on traffic and restaurant preparation" |
| `switch`            | "Live notifications" — toggle for real-time push updates     |
| `skeleton`          | Driver info placeholder while matching driver                |
| `chip`              | Order tags — "Group Order", "Contactless Delivery"           |
| `checkbox`          | Post-delivery — "Food was correct", "Delivery was on time", "Packaging was good" |

#### Behavior:
- `badge` status steps light up progressively as order advances.
- `stat` ETA updates every 30 seconds via polling.
- After delivery, `button-primary` changes to "Reorder This".
- `checkbox` feedback items appear only after "Delivered" status.
- `skeleton` for driver info resolves once driver is assigned.
- `alert` updates with each status change.

---

## 4. Component Catalog Reference

All 21 V2 built-in components used in this app:

| #  | Component           | Pages Used In                                       |
| -- | ------------------- | --------------------------------------------------- |
| 1  | `input-text`        | Restaurant Browse, Cart, Group Order                |
| 2  | `input-currency`    | Group Order (tip, custom split)                     |
| 3  | `button-primary`    | Menu, Cart, Group Order, Order Tracking             |
| 4  | `button-secondary`  | Cart, Group Order, Order Tracking                   |
| 5  | `button-ghost`      | Menu, Cart, Group Order, Order Tracking             |
| 6  | `segmented-control` | Menu, Group Order (tip + split method)              |
| 7  | `stepper`           | Menu, Cart                                          |
| 8  | `display-readonly`  | Restaurant Browse, Cart, Group Order, Order Tracking|
| 9  | `card`              | Restaurant Browse, Menu, Cart, Group Order, Order Tracking |
| 10 | `badge`             | Restaurant Browse, Menu, Cart, Group Order, Order Tracking |
| 11 | `stat`              | Menu (cart bar), Group Order, Order Tracking         |
| 12 | `avatar`            | Menu, Group Order, Order Tracking                   |
| 13 | `tooltip`           | Menu, Cart, Group Order, Order Tracking             |
| 14 | `checkbox`          | Cart, Group Order, Order Tracking                   |
| 15 | `select`            | Cart (size, spice)                                  |
| 16 | `chip`              | Restaurant Browse, Menu, Group Order, Order Tracking|
| 17 | `alert`             | Restaurant Browse, Cart, Group Order, Order Tracking|
| 18 | `skeleton`          | Restaurant Browse, Menu, Group Order, Order Tracking|
| 19 | `loading-spinner`   | Restaurant Browse, Menu, Group Order, Order Tracking|
| 20 | `link`              | Restaurant Browse, Cart, Group Order, Order Tracking|
| 21 | `switch`            | Menu, Group Order, Order Tracking                   |

---

## 5. Navigation

```
Flow (linear, not tabbed):
Restaurant Browse → Menu → Cart → Group Order → Order Tracking

Back navigation at each step.
Bottom sheet for item customization (from Menu or Cart).
Share sheet for group invite link (from Group Order).
```

---

## 6. Data Models

### Restaurant
```yaml
id: string (uuid)
name: string
cuisine_type: string
image_url: string
rating: number (1.0–5.0)
delivery_time_min: number (minutes)
delivery_time_max: number (minutes)
delivery_fee: number (currency)
min_order: number (currency)
is_free_delivery: boolean
is_popular: boolean
categories: string[]
```

### MenuItem
```yaml
id: string (uuid)
restaurant_id: string
name: string
description: string
price: number (currency)
category: "mains" | "sides" | "drinks" | "desserts"
image_url: string (nullable)
is_available: boolean
is_spicy: boolean
is_vegetarian: boolean
is_vegan: boolean
is_gluten_free: boolean
is_best_seller: boolean
is_chefs_pick: boolean
allergens: string[]
sizes: Size[] (nullable)
```

### Size
```yaml
label: "regular" | "large" | "family"
price_modifier: number (currency)
```

### CartItem
```yaml
id: string (uuid)
menu_item_id: string
quantity: number (1–10)
size: string
spice_level: "mild" | "medium" | "hot" | "extra_hot"
customizations: string[]
special_instructions: string
line_total: number (currency)
```

### GroupOrder
```yaml
id: string (uuid)
restaurant_id: string
host_id: string
invite_code: string
status: "collecting" | "placed" | "confirmed" | "preparing" | "delivering" | "delivered"
split_method: "equal" | "by_item" | "custom"
tip_amount: number (currency)
promo_code: string (nullable)
discount_amount: number (currency)
members: GroupMember[]
created_at: datetime
```

### GroupMember
```yaml
id: string (uuid)
user_id: string
display_name: string
avatar_initials: string (2 chars)
is_host: boolean
items: CartItem[]
subtotal: number (currency)
share_amount: number (currency)
payment_status: "pending" | "paid" | "declined"
has_confirmed: boolean
```

### Order
```yaml
id: string (uuid)
order_number: string (e.g., "BT-4829")
group_order_id: string
status: "confirmed" | "preparing" | "on_the_way" | "delivered"
estimated_delivery: datetime
driver_name: string (nullable)
driver_avatar_initials: string (nullable)
eta_minutes: number
subtotal: number
delivery_fee: number
tax: number
tip: number
discount: number
total: number
```

---

## 7. Non-Functional Requirements

- **Performance:** Menu loads within 200ms. Cart calculations are instant (client-side).
- **Accessibility:** WCAG 2.1 AA. Min touch target 44px. Screen reader labels on all icons.
- **Responsive:** Mobile-first at 375px, tablet at 768px. No desktop layout needed.
- **Real-time:** Group order member status and order tracking update via WebSocket.
- **Offline:** Cart persisted locally. Group order requires connectivity.
