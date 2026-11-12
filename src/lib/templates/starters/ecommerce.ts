// Starters: E-commerce.
import { pad } from "@/lib/templates/document";
import {
  FIRST_NAME,
  brandFooter,
  brandHeader,
  button,
  divider,
  emailDoc,
  heading,
  image,
  section,
  siteUrl,
  subheading,
  text,
  tint,
  type StarterDefinition,
} from "./helpers";

export const abandonedCart: StarterDefinition = {
  id: "abandoned-cart",
  name: "Abandoned cart",
  category: "E-commerce",
  description: "A friendly nudge showing the item left behind, its price and a one-click way back to checkout.",
  subject: "You left something in your cart 🛒",
  preheader: "Good news: we saved it for you. Complete your order in one click.",
  build: (theme) => {
    const soft = tint(theme.primaryColor, 0.93);
    return emailDoc(theme, [
      brandHeader(theme),
      section([[
        heading("Forgot something?", { align: "center", fontSize: 32, padding: pad(16, 24, 4, 24) }),
        text(`<p>Hi ${FIRST_NAME}, the items in your cart are waiting for you. We've saved them, but stock is limited.</p>`, {
          align: "center", padding: pad(0, 40, 16, 40),
        }),
      ]]),
      section(
        [
          { verticalAlign: "middle", blocks: [image("Product picture", { borderRadius: 8, padding: pad(16, 12, 16, 24) })] },
          {
            verticalAlign: "middle",
            blocks: [
              subheading("Product name", { fontSize: 19, padding: pad(16, 24, 0, 12) }),
              text("<p>Colour: Forest · Size: M · Qty: 1</p>", { fontSize: 14, color: "#71717a", padding: pad(2, 24, 0, 12) }),
              heading("$49.00", { level: 3, fontSize: 22, color: theme.primaryColor, padding: pad(8, 24, 16, 12) }),
            ],
          },
        ],
        { widths: [33.34, 66.66], backgroundColor: soft, padding: pad(0) },
      ),
      section([[
        button("Return to my cart", siteUrl(theme), theme, { fullWidth: true, fontSize: 17, padding: pad(24, 24, 8, 24) }),
        text("<p>Free returns · Secure checkout · Questions? Just reply</p>", { align: "center", fontSize: 13, color: "#71717a", padding: pad(0, 24, 24, 24) }),
      ]]),
      section([[divider({ padding: pad(0, 24) }), subheading("You might also like", { align: "center", fontSize: 17, padding: pad(16, 24, 4, 24) })]]),
      section([
        [image("Suggested product 1", { borderRadius: 6, padding: pad(8) }), text("<p>Product name<br><strong>$29.00</strong></p>", { align: "center", fontSize: 14, padding: pad(0, 8, 8, 8) })],
        [image("Suggested product 2", { borderRadius: 6, padding: pad(8) }), text("<p>Product name<br><strong>$35.00</strong></p>", { align: "center", fontSize: 14, padding: pad(0, 8, 8, 8) })],
        [image("Suggested product 3", { borderRadius: 6, padding: pad(8) }), text("<p>Product name<br><strong>$19.00</strong></p>", { align: "center", fontSize: 14, padding: pad(0, 8, 8, 8) })],
      ], { padding: pad(0, 16, 24, 16) }),
      brandFooter(theme),
    ]);
  },
};

export const orderThankYou: StarterDefinition = {
  id: "order-thank-you",
  name: "Order thank-you",
  category: "E-commerce",
  description: "A tidy order summary with item lines, a total and what happens next. Great after a purchase.",
  subject: "Thank you for your order! 💚",
  preheader: "Your order is confirmed. Here's your summary.",
  build: (theme) => {
    const line = (item: string, price: string, strong = false) =>
      section(
        [
          [text(strong ? `<p><strong>${item}</strong></p>` : `<p>${item}</p>`, { fontSize: 15, padding: pad(6, 8, 6, 32) })],
          [text(strong ? `<p><strong>${price}</strong></p>` : `<p>${price}</p>`, { align: "right", fontSize: 15, padding: pad(6, 32, 6, 8) })],
        ],
        { widths: [66.66, 33.34], padding: pad(0), stackOnMobile: false },
      );
    const soft = tint(theme.primaryColor, 0.92);
    return emailDoc(theme, [
      brandHeader(theme),
      section(
        [[
          heading("✓", { align: "center", fontSize: 40, color: theme.primaryColor, padding: pad(32, 24, 0, 24) }),
          heading(`Thanks for your order, ${FIRST_NAME}!`, { align: "center", fontSize: 28, padding: pad(4, 24) }),
          text("<p>We're getting it ready. You'll get another email with tracking details as soon as it ships.</p>", {
            align: "center", padding: pad(0, 40, 32, 40),
          }),
        ]],
        { backgroundColor: soft, padding: pad(0) },
      ),
      section([[subheading("Order summary", { fontSize: 18, padding: pad(28, 32, 4, 32) }), text("<p>Order #10001 · Placed today</p>", { fontSize: 13, color: "#71717a", padding: pad(0, 32, 8, 32) })]]),
      line("Product one × 1", "$49.00"),
      line("Product two × 2", "$30.00"),
      line("Shipping", "Free"),
      section([[divider({ padding: pad(4, 32) })]], { padding: pad(0) }),
      line("Total", "$79.00", true),
      section(
        [
          [subheading("Shipping to", { fontSize: 15, padding: pad(20, 16, 0, 32) }), text("<p>Customer Name<br>Street address<br>City, Postcode</p>", { fontSize: 14, color: "#52525b", padding: pad(4, 16, 16, 32) })],
          [subheading("Need help?", { fontSize: 15, padding: pad(20, 32, 0, 16) }), text("<p>Reply to this email or visit our help centre. We usually answer within a few hours.</p>", { fontSize: 14, color: "#52525b", padding: pad(4, 32, 16, 16) })],
        ],
        { padding: pad(12, 0) },
      ),
      section([[button("View my order", siteUrl(theme), theme, { padding: pad(8, 24, 32, 24) })]]),
      brandFooter(theme),
    ]);
  },
};

export const newArrivals: StarterDefinition = {
  id: "new-arrivals",
  name: "New arrivals",
  category: "E-commerce",
  description: "A product showcase: one hero product, then a three-across grid with prices and Shop buttons.",
  subject: "Just landed: our newest arrivals",
  preheader: "Be the first to see what's new this season.",
  build: (theme) => {
    const product = (name: string, price: string) => [
      image(name, { borderRadius: 8, padding: pad(8) }),
      subheading(name, { align: "center", fontSize: 16, padding: pad(4, 8, 0, 8) }),
      text(`<p>${price}</p>`, { align: "center", fontSize: 15, color: theme.primaryColor, padding: pad(0, 8) }),
      button("Shop", siteUrl(theme), theme, { fontSize: 14, borderRadius: 4, padding: pad(4, 8, 16, 8) }),
    ];
    return emailDoc(theme, [
      brandHeader(theme),
      section([[
        text("<p><strong>NEW SEASON</strong></p>", { align: "center", fontSize: 13, color: theme.primaryColor, padding: pad(8, 24, 0, 24) }),
        heading("Fresh picks, just for you", { align: "center", fontSize: 34, padding: pad(4, 24, 16, 24) }),
        image("Hero product", { borderRadius: 10, padding: pad(0, 24, 8, 24) }),
        button("Shop new arrivals", siteUrl(theme), theme, { padding: pad(16, 24, 24, 24) }),
      ]]),
      section([product("Product one", "$39.00"), product("Product two", "$45.00"), product("Product three", "$59.00")], {
        backgroundColor: tint(theme.backgroundColor, 0.5),
        padding: pad(16, 16),
      }),
      section([[
        text(`<p>Not quite your style, ${FIRST_NAME}? <a href="${siteUrl(theme)}">Browse the full collection</a>.</p>`, {
          align: "center", fontSize: 15, padding: pad(24, 24),
        }),
      ]]),
      brandFooter(theme),
    ]);
  },
};
