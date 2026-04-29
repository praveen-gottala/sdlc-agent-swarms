Absolutely — here’s a compact **sample PRD for a web-only e-commerce app** limited to **4 screens**.

# Product Requirements Document

## Product Name

**ShopLite**
**Platform:** Web app only
**Document Version:** 1.0
**Purpose:** Sample PRD for testing a UI design agent

---

## 1. Product Summary

ShopLite is a simple web-based e-commerce application that allows users to browse products, view product details, add items to cart, and complete a purchase in a minimal flow.

This product is intentionally constrained to **4 core screens** so it can be used to test UI design quality, consistency, and end-to-end shopping flow without adding extra complexity.

---

## 2. Objective

Design a clean, modern web storefront that supports a basic shopping journey:

1. Discover products
2. View product details
3. Add items to cart and checkout
4. Confirm order

The experience should feel fast, trustworthy, and visually polished.

---

## 3. Target Users

### Primary User

A casual online shopper who wants to quickly browse products and complete a purchase with minimal friction.

### User Needs

* easy product browsing
* clear product information
* simple add-to-cart flow
* fast checkout
* confidence before placing an order

---

## 4. MVP Scope

## In Scope

* product browsing
* product detail page
* add to cart
* cart review
* checkout form
* order confirmation

## Out of Scope

* native mobile app
* account creation
* wishlist
* reviews and ratings
* order tracking
* returns flow
* promo codes
* multi-vendor marketplace
* advanced personalization

---

## 5. Core Product Concept

A curated online store selling a focused set of products such as fashion, accessories, home goods, or electronics. For design purposes, the app should support a small catalog and a straightforward checkout process.

---

## 6. Screen Limit

The UI must be designed using only **4 web screens**:

1. **Home / Product Listing**
2. **Product Detail**
3. **Cart / Checkout**
4. **Order Confirmation**

No other core screens should be required for the MVP.

---

## 7. Screen Definitions

## 7.1 Home / Product Listing

This is the entry screen where users browse available products.

### Purpose

Help users quickly scan products and choose one to explore further.

### Key UI Elements

* header with brand name/logo
* search bar
* category or filter chips
* product grid
* product cards
* cart icon with item count

### Product Card Content

* product image
* product name
* short category label
* price
* quick add or view details CTA

### User Actions

* browse products
* search products
* filter by category
* open product detail
* add item to cart

---

## 7.2 Product Detail

This screen shows the full information for a selected product.

### Purpose

Give the user enough confidence and clarity to add the item to cart.

### Key UI Elements

* large product image/gallery
* product name
* price
* short product description
* selectable options such as size/color if needed
* quantity selector
* add to cart button
* related products section

### User Actions

* view product details
* choose variant
* adjust quantity
* add to cart
* continue shopping or move to cart

---

## 7.3 Cart / Checkout

This screen combines cart review and checkout into one simplified page.

### Purpose

Allow the user to confirm selected items and place an order without extra steps.

### Key UI Elements

* cart item list
* product thumbnail, name, price, quantity
* remove item action
* order summary
* subtotal, shipping, total
* checkout form:

  * full name
  * email
  * shipping address
  * payment section placeholder
* place order button

### User Actions

* review cart
* update quantity
* remove items
* enter shipping/payment details
* place order

---

## 7.4 Order Confirmation

This is the final success screen after checkout.

### Purpose

Reassure the user that the order was placed successfully.

### Key UI Elements

* success confirmation message
* order number
* summary of purchased items
* shipping address summary
* estimated delivery message
* continue shopping button

### User Actions

* review confirmation
* return to storefront

---

## 8. User Stories

* As a shopper, I want to browse products on a simple landing page so I can find items quickly.
* As a shopper, I want to open a product detail page so I can review product information before buying.
* As a shopper, I want to add an item to cart and adjust quantity so I can control my purchase.
* As a shopper, I want to complete checkout on one page so the buying process feels fast.
* As a shopper, I want to see an order confirmation after purchase so I know the transaction was successful.

---

## 9. Functional Requirements

### Must Have

* product listing grid
* product detail view
* add to cart
* quantity editing
* cart summary
* checkout form
* place order action
* order confirmation page

### Should Have

* basic search
* simple category filters
* related items on product detail page
* persistent cart icon in header

### Nice to Have

* saved recently viewed items
* stock indicator
* shipping estimate preview

---

## 10. UX Requirements

### Design Principles

* simple and modern
* visually clean
* easy to scan
* strong product imagery
* clear calls to action
* trust-building checkout experience

### Layout Style

* desktop-first responsive web layout
* spacious card-based design
* sticky header
* clear pricing hierarchy
* minimal distractions

### Tone

* premium but approachable
* modern retail aesthetic
* lightweight and fast

---

## 11. Content Requirements

### Example Product Categories

* Sneakers
* Backpacks
* Headphones
* Home decor

### Example Product Fields

* name
* image
* short description
* price
* category
* color
* size
* quantity available

---

## 12. Non-Functional Requirements

### Performance

* pages should load quickly
* product images should be optimized
* cart updates should feel immediate

### Accessibility

* keyboard-friendly navigation
* clear form labels
* readable font sizes
* sufficient contrast

### Responsiveness

* optimized for web browsers
* adapts cleanly to smaller desktop and tablet widths

---

## 13. Success Metrics

* product detail click-through rate
* add-to-cart rate
* checkout completion rate
* cart abandonment rate
* average time to purchase

---

## 14. Acceptance Criteria

The MVP is successful when:

1. A user can open the web app and browse products from the listing page.
2. A user can select a product and view full details.
3. A user can add one or more items to the cart.
4. A user can complete checkout from a single cart/checkout page.
5. A user sees a confirmation page with order details after placing an order.

---

## 15. Suggested UI Design Agent Prompt

Design a modern web-only e-commerce app called ShopLite with only 4 screens: Product Listing, Product Detail, Cart/Checkout, and Order Confirmation. The app should feel clean, premium, and easy to use. Use strong product cards, clear CTAs, simple search/filter controls, and a frictionless one-page checkout. Focus on desktop web layouts with responsive behavior.

