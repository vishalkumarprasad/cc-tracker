/*
 * Card registry — the ONLY place cards are defined.
 * To add a card: drop its image into ./images and append an entry below.
 * To remove a card: delete its entry (saved data for it is simply ignored).
 * `id` must be unique and stable; it is the key used for saved data.
 * Order here is the order shown on screen.
 */
window.CARDS = [
  {
    id: "axis-atlas",
    bank: "Axis Bank",
    name: "Atlas",
    image: "images/axis-atlas.png",
    accent: "#97144d",
  },
  {
    id: "hsbc-travelone",
    bank: "HSBC",
    name: "TravelOne",
    image: "images/hsbc-travelone.png",
    accent: "#db0011",
  },
  {
    id: "slice",
    bank: "slice",
    name: "Super",
    image: "images/slice.png",
    accent: "#ff1493",
  },
  {
    id: "icici-sapphiro",
    bank: "ICICI Bank",
    name: "Sapphiro",
    image: "images/icici-sapphiro.png",
    accent: "#1f3fbf",
  },
  {
    id: "hdfc-marriott-bonvoy",
    bank: "HDFC Bank",
    name: "Marriott Bonvoy",
    image: "images/hdfc-marriott-bonvoy.png",
    accent: "#b08d57",
  },
];
