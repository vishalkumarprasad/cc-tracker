/*
 * Card registry — the ONLY place cards are defined.
 * To add a card: drop its image into ./images and append an entry below.
 * To remove a card: delete its entry (saved data for it is simply ignored).
 * `id` must be unique and stable; it is the key used for saved data.
 * Order here is the order shown on screen.
 * `holder` places the cardholder text on the card image: x/y are the text's top-left corner as a % of the card
 * (use `right` instead of `x` to anchor it from the right edge), `color` is the print colour.
 * Omit `holder` to show no text on that card.
 */
window.CARD_HOLDER = "V K P";

window.CARDS = [
  {
    id: "axis-atlas",
    bank: "Axis Bank",
    name: "Atlas",
    image: "images/axis-atlas.png",
    accent: "#97144d",
    holder: { x: "8%", y: "78%", color: "#e9e9ec" },
  },
  {
    id: "hsbc-travelone",
    bank: "HSBC",
    name: "TravelOne",
    image: "images/hsbc-travelone.png",
    accent: "#db0011",
    holder: { x: "10%", y: "84%", color: "#d9d9de" },
  },
  {
    id: "slice",
    bank: "slice",
    name: "Super",
    image: "images/slice.png",
    accent: "#ff1493",
    holder: { x: "13%", y: "84%", color: "#ffffff" },
  },
  {
    id: "icici-sapphiro",
    bank: "ICICI Bank",
    name: "Sapphiro",
    image: "images/icici-sapphiro.png",
    accent: "#1f3fbf",
    holder: { right: "7%", y: "80%", color: "#f2f4ff" },
  },
  {
    id: "hdfc-marriott-bonvoy",
    bank: "HDFC Bank",
    name: "Marriott Bonvoy",
    image: "images/hdfc-marriott-bonvoy.png",
    accent: "#b08d57",
    holder: { x: "6%", y: "76%", color: "#c9a96a" },
  },
];
