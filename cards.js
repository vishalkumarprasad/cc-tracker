/*
 * Card registry — the ONLY place cards are defined.
 * To add a card: drop its image into ./images and append an entry below.
 * To remove a card: delete its entry (saved data for it is simply ignored).
 * `id` must be unique and stable; it is the key used for saved data.
 * `bank` and `name` are shown as-is everywhere; together they form the full title (e.g. "Axis Atlas").
 * Order here is the order shown on screen.
 * `holder` places the cardholder text on the card image: x/y are the text's top-left corner as a % of the card
 * (use `right` instead of `x` to anchor it from the right edge), `color` is the print colour.
 * Omit `holder` to show no text on that card.
 *
 * Card details (leave null to show "—"):
 *   limit         total credit limit in ₹
 *   annualFee     annual fee in ₹ before tax; 0 = lifetime free (LTF)
 *   feeTax        tax on the annual fee in %, e.g. 18 for GST
 *   feeMonth      renewal month 1 (Jan) – 12 (Dec); rolls to next year once that month passes; null for LTF
 *   statementDay  day of the month the statement is generated (1–31)
 */
window.CARD_HOLDER = "V K P";

window.CARDS = [
  {
    id: "axis-atlas",
    bank: "Axis",
    name: "Atlas",
    image: "images/axis-atlas.png",
    accent: "#97144d",
    holder: { x: "8%", y: "78%", color: "#e9e9ec" },
    limit: 671000,
    annualFee: 5000,
    feeTax: 18,
    feeMonth: 2,
    statementDay: 15,
  },
  {
    id: "hsbc-travelone",
    bank: "HSBC",
    name: "TravelOne",
    image: "images/hsbc-travelone.png",
    accent: "#a7adb7",
    holder: { x: "10%", y: "84%", color: "#d9d9de" },
    limit: 1080000,
    annualFee: 5000,
    feeTax: 18,
    feeMonth: 10,
    statementDay: 26,
  },
  {
    id: "slice",
    bank: "Slice",
    name: "Super",
    image: "images/slice.png",
    accent: "#ff1493",
    holder: { x: "13%", y: "84%", color: "#ffffff" },
    limit: 221000,
    annualFee: 0,
    feeTax: 0,
    feeMonth: null,
    statementDay: 14,
  },
  {
    id: "icici-sapphiro",
    bank: "ICICI",
    name: "Sapphiro",
    image: "images/icici-sapphiro.png",
    accent: "#1f3fbf",
    holder: { right: "7%", y: "80%", color: "#f2f4ff" },
    limit: 500000,
    annualFee: 0,
    feeTax: 0,
    feeMonth: null,
    statementDay: 14,
  },
  {
    id: "hdfc-marriott-bonvoy",
    bank: "HDFC",
    name: "Marriott Bonvoy",
    image: "images/hdfc-marriott-bonvoy.png",
    accent: "#b08d57",
    holder: { x: "6%", y: "76%", color: "#c9a96a" },
    limit: 300000,
    annualFee: 3500,
    feeTax: 18,
    feeMonth: 2,
    statementDay: 14,
  },
];
