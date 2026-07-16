export interface NaviTool {
  name: string;
  category: string;
  beschreibung: string;
  /**
   * URL-safe slug for the tool's detail page on ki-navi.net.
   * Optional: when missing (e.g. user-provided override files), it is derived
   * from the name via {@link naviToolSlug}.
   */
  slug?: string;
}

/** Base URL for ki-navi.net tool/category pages (no trailing slash). */
export const NAVI_TOOL_BASE_URL = "https://www.ki-navi.net";

/**
 * Returns the tool's slug, deriving a kebab-case fallback from the name when no
 * explicit slug is set (German umlauts transliterated: ä→ae, ö→oe, ü→ue, ß→ss).
 */
export function naviToolSlug(tool: NaviTool): string {
  if (tool.slug && tool.slug.trim()) return tool.slug.trim();
  return tool.name
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Full link to a tool's detail page, e.g. https://www.ki-navi.net/post-pilot */
export function naviToolUrl(tool: NaviTool): string {
  return `${NAVI_TOOL_BASE_URL}/${naviToolSlug(tool)}`;
}

/** Full link to a category search page, e.g. https://www.ki-navi.net/category?search=social_media */
export function naviCategoryUrl(category: string): string {
  return `${NAVI_TOOL_BASE_URL}/category?search=${encodeURIComponent(category)}`;
}

/** Hardcoded seed / reset-to-default tool catalog. Runtime callers should load the effective (possibly user-edited) list instead — see `electron/services/naviKnowledgeBase.ts`. */
export const DEFAULT_NAVI_TOOLS: NaviTool[] = [
  // seo
  { name: "RankHelfer", category: "seo", slug: "rank-helfer", beschreibung: "SEO-Vorschläge und Keyword-Optimierung für Produktseiten und Website-Inhalte." },

  // social_media
  { name: "PostPilot", category: "social_media", slug: "post-pilot", beschreibung: "Generiert Social-Media-Posts aus Produktfotos oder kurzen Stichworten." },
  { name: "StoryMaker", category: "social_media", slug: "story-maker", beschreibung: "Erstellt kurze Reels-Skripte oder Story-Ideen passend zur Saison oder einer laufenden Aktion." },
  { name: "InstaCaption", category: "social_media", slug: "insta-caption", beschreibung: "Generiert Instagram-Bildunterschriften und passende Hashtag-Sets aus einem Foto oder Stichworten." },

  // local_listings
  { name: "SichtbarLokal", category: "local_listings", slug: "sichtbar-lokal", beschreibung: "Pflegt Google-Business-Einträge, Öffnungszeiten und Fotos automatisch aktuell." },
  { name: "EintragsProfi", category: "local_listings", slug: "eintrags-profi", beschreibung: "Erkennt veraltete oder fehlende Angaben in lokalen Verzeichnissen wie Google Maps oder Yelp und schlägt Korrekturen vor." },

  // chatbot
  { name: "FAQ-Bot Alpha", category: "chatbot", slug: "faq-bot-alpha", beschreibung: "Beantwortet Standardfragen auf der Website rund um die Uhr – z.B. zu Öffnungszeiten, Rückgaben oder Produktverfügbarkeit." },
  { name: "LadenAssistent", category: "chatbot", slug: "laden-assistent", beschreibung: "Chatbot für die eigene Website, der Besucher durch das Sortiment führt und bei einfachen Kaufentscheidungen hilft." },

  // knowledge_base
  { name: "WissensHub", category: "knowledge_base", slug: "wissens-hub", beschreibung: "Strukturiert internes Produktwissen und macht es für Chatbots abrufbar." },

  // email_automation
  { name: "MailPilot", category: "email_automation", slug: "mail-pilot", beschreibung: "Antwortet automatisch auf eingehende E-Mails mit gleichartigen Anfragen – z.B. Bestellbestätigungen, Lieferstatus oder Terminbestätigungen." },

  // messaging
  { name: "ChatConnect", category: "messaging", slug: "chat-connect", beschreibung: "Antwortet automatisch auf eingehende WhatsApp- oder Instagram-Nachrichten mit vordefinierten Vorlagen – für Anfragen, die Kunden selbst schicken." },

  // accounting
  { name: "BuchhalterKI", category: "accounting", slug: "buchhalter-ki", beschreibung: "Kategorisiert Ausgaben und bereitet den Steuerberater-Export automatisch vor." },

  // document_processing
  { name: "BelegScanner", category: "document_processing", slug: "beleg-scanner", beschreibung: "Scannt Papierbelege und Rechnungen und überträgt sie digital ins System." },
  { name: "RechnungsReader", category: "document_processing", slug: "rechnungs-reader", beschreibung: "Liest eingehende PDF-Rechnungen automatisch aus und trägt Beträge, Datum und Lieferant direkt ins Buchführungssystem ein." },

  // inventory_management
  { name: "LagerCheck", category: "inventory_management", slug: "lager-check", beschreibung: "Meldet Engpässe und schlägt Nachbestellmengen basierend auf der Verkaufshistorie vor." },
  { name: "TrendRadar", category: "inventory_management", slug: "trend-radar", beschreibung: "Erkennt Bestseller und Ladenhüter aus den Kassendaten und gibt Hinweise, was abgebaut oder nachbestellt werden sollte." },

  // ordering
  { name: "BestellBot", category: "ordering", slug: "bestell-bot", beschreibung: "Erstellt Bestellvorschläge und sendet sie direkt an Lieferanten." },

  // product_content
  { name: "ProduktText", category: "product_content", slug: "produkt-text", beschreibung: "Schreibt verkaufsfördernde Produktbeschreibungen aus kurzen Stichworten oder Fotos – direkt für den Online-Shop oder Flyer einsetzbar." },
  { name: "KatalogKI", category: "product_content", slug: "katalog-ki", beschreibung: "Erstellt strukturierte Produktkataloge oder Preislisten aus unsortierten Artikellisten – als druckfertiges PDF oder Web-Version." },

  // image_editing
  { name: "FotoFreisteller", category: "image_editing", slug: "foto-freisteller", beschreibung: "Entfernt Hintergründe aus Produktfotos vollautomatisch und liefert freigestellte Bilder für den Shop oder Social Media." },
  { name: "BildVerbesserer", category: "image_editing", slug: "bild-verbesserer", beschreibung: "Verbessert Helligkeit, Schärfe und Farben von Produktfotos ohne Fachkenntnisse – direkt auf dem Smartphone nutzbar." },

  // reviews
  { name: "BewertungsAntwort", category: "reviews", slug: "bewertungs-antwort", beschreibung: "Schlägt passende, individuelle Antworten auf Google- oder Yelp-Bewertungen vor – für positive wie negative Rückmeldungen." },
  { name: "SternWächter", category: "reviews", slug: "stern-waechter", beschreibung: "Überwacht neue Bewertungen auf allen Plattformen, benachrichtigt sofort und schlägt direkt eine Antwortvorlage vor." },

  // newsletter
  { name: "NewsletterKI", category: "newsletter", slug: "newsletter-ki", beschreibung: "Erstellt monatliche Newsletter aus den neuesten Produkten oder Angeboten – fertig zum Versenden an die bestehende Kundenliste." },
  { name: "AktionsMailer", category: "newsletter", slug: "aktions-mailer", beschreibung: "Generiert E-Mail-Kampagnen für saisonale Aktionen oder Rabatte – inkl. Betreffzeile, Text und Call-to-Action." },

  // loyalty
  { name: "KundenKarte", category: "loyalty", slug: "kunden-karte", beschreibung: "Digitale Stempelkarte: belohnt Stammkunden automatisch nach einer bestimmten Anzahl Käufe und erinnert sie per E-Mail oder SMS." },
  { name: "WiederKommerBot", category: "loyalty", slug: "wieder-kommer-bot", beschreibung: "Erkennt Kunden, die länger nicht da waren, und schlägt automatisch eine Rückgewinnungsaktion oder ein persönliches Angebot vor." },

  // analytics
  { name: "UmsatzSpiegel", category: "analytics", slug: "umsatz-spiegel", beschreibung: "Fasst Kassendaten und Verkaufsstatistiken automatisch zu einem wöchentlichen Überblick zusammen – ohne Tabellenkalkulation." },

  // appointment_booking
  { name: "TerminBot", category: "appointment_booking", slug: "termin-bot", beschreibung: "Nimmt Terminanfragen per Website oder WhatsApp entgegen und trägt sie automatisch in den Kalender ein – ohne manuelle Absprache." },

  // translation
  { name: "TextÜbersetzer", category: "translation", slug: "text-uebersetzer", beschreibung: "Übersetzt Produktbeschreibungen, Aushänge oder Menüs automatisch in Englisch, Türkisch oder weitere Sprachen für internationale Kunden." },

  // voice
  { name: "AnrufAssistent", category: "voice", slug: "anruf-assistent", beschreibung: "Nimmt Anrufe außerhalb der Öffnungszeiten entgegen, beantwortet Standardfragen automatisch und leitet dringende Anfragen weiter." },
];
