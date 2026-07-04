// Country database used by both the content script and the popup.
//
// Per country:
//   name     - display name
//   flag     - emoji shown in the popup
//   langs    - BCP-47 lang codes X stamps on tweet text (div[data-testid="tweetText"][lang])
//   places   - location strings (country names incl. native script, major
//              cities, regions); unused in this build, kept in sync with the
//              full GitHub version
//   keywords - words/phrases in the tweet text that imply the country (fallback)
//   handles  - well-known tech-news accounts from that country (lowercase, no @)
//
// Note: shared languages (en, es, ar...) are weak signals on their own; the
// content script only uses a language when it maps to exactly one country here.

const COUNTRY_DB = {
  US: {
    name: "United States", flag: "\u{1F1FA}\u{1F1F8}", langs: ["en"],
    places: ["usa", "us", "united states", "america", "san francisco", "new york", "nyc", "seattle", "austin", "boston", "chicago", "los angeles", "silicon valley", "bay area", "california", "texas", "florida", "colorado", "atlanta", "denver", "portland", "miami", "san jose", "palo alto", "mountain view", "brooklyn"],
    keywords: ["united states", "u.s.", "usa", "america", "american", "silicon valley", "san francisco", "new york", "seattle", "austin", "boston"],
    handles: ["techcrunch", "verge", "wired", "arstechnica", "engadget", "techmeme"]
  },
  IN: {
    name: "India", flag: "\u{1F1EE}\u{1F1F3}", langs: ["hi", "ta", "te", "bn", "mr", "kn", "ml", "gu", "pa"],
    places: ["india", "bharat", "भारत", "bengaluru", "bangalore", "mumbai", "new delhi", "delhi", "hyderabad", "chennai", "kolkata", "pune", "noida", "gurgaon", "gurugram", "ahmedabad", "jaipur", "kochi", "indore"],
    keywords: ["india", "indian", "bengaluru", "bangalore", "mumbai", "delhi", "hyderabad", "chennai", "pune", "noida", "gurugram", "upi", "isro"],
    handles: ["inc42", "entrackr", "yourstory", "the_ken_web"]
  },
  JP: {
    name: "Japan", flag: "\u{1F1EF}\u{1F1F5}", langs: ["ja"],
    places: ["japan", "日本", "tokyo", "東京", "osaka", "大阪", "kyoto", "京都", "nagoya", "fukuoka", "yokohama"],
    keywords: ["japan", "japanese", "tokyo", "osaka", "kyoto", "nintendo", "rakuten"],
    handles: ["itmedia_news", "wired_jp", "nikkei"]
  },
  CN: {
    name: "China", flag: "\u{1F1E8}\u{1F1F3}", langs: ["zh"],
    places: ["china", "中国", "beijing", "北京", "shanghai", "上海", "shenzhen", "深圳", "guangzhou", "hangzhou", "chengdu"],
    keywords: ["china", "chinese", "beijing", "shanghai", "shenzhen", "hangzhou", "alibaba", "tencent", "bytedance", "huawei", "xiaomi"],
    handles: ["technodechina", "sixthtone"]
  },
  KR: {
    name: "South Korea", flag: "\u{1F1F0}\u{1F1F7}", langs: ["ko"],
    places: ["korea", "대한민국", "한국", "seoul", "서울", "busan"],
    keywords: ["korea", "korean", "seoul", "samsung", "kakao", "naver", "sk hynix"],
    handles: ["thekoreaherald"]
  },
  GB: {
    name: "United Kingdom", flag: "\u{1F1EC}\u{1F1E7}", langs: ["en"],
    places: ["uk", "united kingdom", "england", "scotland", "wales", "britain", "london", "manchester", "cambridge", "oxford", "edinburgh", "birmingham", "bristol"],
    keywords: ["united kingdom", "britain", "british", "london", "cambridge", "manchester", "deepmind"],
    handles: ["theregister", "bbctech", "guardiantech"]
  },
  DE: {
    name: "Germany", flag: "\u{1F1E9}\u{1F1EA}", langs: ["de"],
    places: ["germany", "deutschland", "berlin", "munich", "münchen", "hamburg", "frankfurt", "cologne", "köln", "stuttgart"],
    keywords: ["germany", "german", "berlin", "munich", "hamburg", "deutschland"],
    handles: ["heiseonline", "t3n", "golem"]
  },
  FR: {
    name: "France", flag: "\u{1F1EB}\u{1F1F7}", langs: ["fr"],
    places: ["france", "paris", "lyon", "marseille", "toulouse", "bordeaux"],
    keywords: ["france", "french", "paris", "station f"],
    handles: ["01net", "frandroid"]
  },
  IL: {
    name: "Israel", flag: "\u{1F1EE}\u{1F1F1}", langs: ["he", "iw"],
    places: ["israel", "ישראל", "tel aviv", "jerusalem", "haifa"],
    keywords: ["israel", "israeli", "tel aviv", "jerusalem"],
    handles: ["calcalistech"]
  },
  SG: {
    name: "Singapore", flag: "\u{1F1F8}\u{1F1EC}", langs: [],
    places: ["singapore"],
    keywords: ["singapore", "grab", "sea group"],
    handles: ["techinasia", "straits_times"]
  },
  BR: {
    name: "Brazil", flag: "\u{1F1E7}\u{1F1F7}", langs: ["pt"],
    places: ["brazil", "brasil", "são paulo", "sao paulo", "rio de janeiro", "belo horizonte", "curitiba", "brasília", "brasilia"],
    keywords: ["brazil", "brasil", "são paulo", "sao paulo", "rio de janeiro", "nubank"],
    handles: ["tecmundo", "olhardigital"]
  },
  CA: {
    name: "Canada", flag: "\u{1F1E8}\u{1F1E6}", langs: [],
    places: ["canada", "toronto", "vancouver", "montreal", "montréal", "ottawa", "waterloo", "calgary", "edmonton"],
    keywords: ["canada", "canadian", "toronto", "vancouver", "montreal", "waterloo", "shopify"],
    handles: ["betakit"]
  },
  AU: {
    name: "Australia", flag: "\u{1F1E6}\u{1F1FA}", langs: [],
    places: ["australia", "sydney", "melbourne", "brisbane", "perth", "canberra", "adelaide"],
    keywords: ["australia", "australian", "sydney", "melbourne", "canberra", "atlassian"],
    handles: ["itnews_au"]
  },
  NL: {
    name: "Netherlands", flag: "\u{1F1F3}\u{1F1F1}", langs: ["nl"],
    places: ["netherlands", "holland", "amsterdam", "rotterdam", "eindhoven", "utrecht", "the hague"],
    keywords: ["netherlands", "dutch", "amsterdam", "eindhoven", "asml"],
    handles: ["tweakers"]
  },
  RU: {
    name: "Russia", flag: "\u{1F1F7}\u{1F1FA}", langs: ["ru"],
    places: ["russia", "россия", "moscow", "москва", "saint petersburg", "st petersburg"],
    keywords: ["russia", "russian", "moscow", "yandex"],
    handles: ["habr_com"]
  },
  ES: {
    name: "Spain", flag: "\u{1F1EA}\u{1F1F8}", langs: ["es"],
    places: ["spain", "españa", "madrid", "barcelona", "valencia", "sevilla", "seville"],
    keywords: ["spain", "madrid", "barcelona", "españa"],
    handles: ["xataka"]
  },
  MX: {
    name: "Mexico", flag: "\u{1F1F2}\u{1F1FD}", langs: ["es"],
    places: ["mexico", "méxico", "cdmx", "mexico city", "guadalajara", "monterrey"],
    keywords: ["mexico", "méxico", "cdmx", "guadalajara"],
    handles: ["xatakamx"]
  },
  ID: {
    name: "Indonesia", flag: "\u{1F1EE}\u{1F1E9}", langs: ["in", "id"],
    places: ["indonesia", "jakarta", "bandung", "surabaya", "bali"],
    keywords: ["indonesia", "jakarta", "gojek", "tokopedia"],
    handles: ["dailysocial"]
  },
  AE: {
    name: "UAE", flag: "\u{1F1E6}\u{1F1EA}", langs: [],
    places: ["uae", "united arab emirates", "dubai", "abu dhabi", "sharjah"],
    keywords: ["uae", "dubai", "abu dhabi", "emirati"],
    handles: ["wamda"]
  },
  NG: {
    name: "Nigeria", flag: "\u{1F1F3}\u{1F1EC}", langs: [],
    places: ["nigeria", "lagos", "abuja", "ibadan"],
    keywords: ["nigeria", "nigerian", "lagos", "abuja", "paystack", "flutterwave"],
    handles: ["techcabal"]
  }
};
