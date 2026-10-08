// Candidate words for CLIP zero-shot naming (plan: "identify unclear objects").
// Deliberately broader than the detector's 91 fixed COCO classes — the whole
// point is to have a chance at naming things the detector has no label for
// (lamps, plants, mirrors, etc.), while still including the COCO classes so
// CLIP can agree with the detector when that's actually correct.
export const COMMON_OBJECTS: string[] = [
  // furniture
  "chair", "table", "desk", "sofa", "couch", "bed", "bookshelf", "cabinet",
  "drawer", "wardrobe", "nightstand", "bench", "stool", "ottoman", "shelf",
  "rocking chair", "recliner",
  // lighting & decor
  "lamp", "table lamp", "floor lamp", "ceiling light", "chandelier", "candle",
  "candlestick", "mirror", "picture frame", "painting", "poster", "vase",
  "plant", "flower pot", "clock", "wall clock", "rug", "carpet", "curtain",
  "pillow", "cushion", "blanket", "throw blanket",
  // kitchen & dining
  "plate", "bowl", "cup", "mug", "glass", "wine glass", "bottle", "jar",
  "fork", "knife", "spoon", "pot", "pan", "cutting board", "kettle",
  "coffee maker", "toaster", "blender", "microwave", "oven", "stove",
  "refrigerator", "sink", "dish", "tray", "napkin",
  // electronics
  "television", "monitor", "laptop", "computer", "keyboard", "mouse",
  "remote control", "phone", "smartphone", "tablet", "camera", "speaker",
  "headphones", "charger", "cable", "router", "game controller",
  // bags, clothing, personal items
  "backpack", "bag", "handbag", "suitcase", "wallet", "umbrella", "hat",
  "cap", "glasses", "sunglasses", "watch", "shoe", "boot", "sandal",
  "jacket", "coat", "scarf", "glove", "tie", "belt",
  // bathroom
  "toilet", "bathtub", "shower", "towel", "toothbrush", "soap", "shampoo",
  "hair dryer", "razor",
  // tools & hardware
  "hammer", "screwdriver", "wrench", "drill", "saw", "ladder", "toolbox",
  "nail", "screw", "paintbrush", "bucket", "broom", "mop", "vacuum cleaner",
  "flashlight", "battery", "extension cord",
  // office & school
  "book", "notebook", "pen", "pencil", "eraser", "scissors", "stapler",
  "folder", "envelope", "calculator", "ruler", "tape", "calendar",
  "whiteboard", "printer",
  // outdoor & vehicles
  "car", "truck", "motorcycle", "bicycle", "scooter", "skateboard", "boat",
  "bus", "train", "airplane", "wheel", "tire", "helmet", "ladder outdoors",
  "fence", "gate", "mailbox", "trash can", "garden hose", "watering can",
  "shovel", "rake", "lawnmower", "tent", "barbecue grill",
  // sports & toys
  "ball", "basketball", "soccer ball", "tennis racket", "baseball bat",
  "baseball glove", "skis", "snowboard", "surfboard", "kite", "frisbee",
  "guitar", "piano", "drum", "violin", "trumpet", "toy", "doll",
  "teddy bear", "board game", "puzzle", "balloon", "trophy",
  // food
  "fruit", "apple", "banana", "orange", "sandwich", "pizza", "cake",
  "bread", "vegetable", "egg", "cheese",
  // animals (in case a detected "box" is actually an animal missed/mislabeled)
  "cat", "dog", "bird", "fish", "rabbit", "horse",
  // people / misc
  "person", "statue", "sculpture", "sign", "box", "basket", "container",
  "bin", "cardboard box", "gift box", "shopping cart", "ladder",
];
