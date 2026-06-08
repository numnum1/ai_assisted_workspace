export interface NaviTool {
  name: string;
  category: string;
  beschreibung: string;
}

export const NAVI_TOOLS: NaviTool[] = [
  // seo
  { name: "RankHelfer", category: "seo", beschreibung: "SEO-Vorschläge und Keyword-Optimierung für Produktseiten und Website-Inhalte." },

  // social_media
  { name: "PostPilot", category: "social_media", beschreibung: "Generiert Social-Media-Posts aus Produktfotos oder kurzen Stichworten." },
  { name: "StoryMaker", category: "social_media", beschreibung: "Erstellt kurze Reels-Skripte oder Story-Ideen passend zur Saison oder einer laufenden Aktion." },
  { name: "InstaCaption", category: "social_media", beschreibung: "Generiert Instagram-Bildunterschriften und passende Hashtag-Sets aus einem Foto oder Stichworten." },

  // local_listings
  { name: "SichtbarLokal", category: "local_listings", beschreibung: "Pflegt Google-Business-Einträge, Öffnungszeiten und Fotos automatisch aktuell." },
  { name: "EintragsProfi", category: "local_listings", beschreibung: "Erkennt veraltete oder fehlende Angaben in lokalen Verzeichnissen wie Google Maps oder Yelp und schlägt Korrekturen vor." },

  // chatbot
  { name: "FAQ-Bot Alpha", category: "chatbot", beschreibung: "Beantwortet Standardfragen auf der Website rund um die Uhr – z.B. zu Öffnungszeiten, Rückgaben oder Produktverfügbarkeit." },
  { name: "LadenAssistent", category: "chatbot", beschreibung: "Chatbot für die eigene Website, der Besucher durch das Sortiment führt und bei einfachen Kaufentscheidungen hilft." },

  // knowledge_base
  { name: "WissensHub", category: "knowledge_base", beschreibung: "Strukturiert internes Produktwissen und macht es für Chatbots abrufbar." },

  // email_automation
  { name: "MailPilot", category: "email_automation", beschreibung: "Antwortet automatisch auf eingehende E-Mails mit gleichartigen Anfragen – z.B. Bestellbestätigungen, Lieferstatus oder Terminbestätigungen." },

  // messaging
  { name: "ChatConnect", category: "messaging", beschreibung: "Antwortet automatisch auf eingehende WhatsApp- oder Instagram-Nachrichten mit vordefinierten Vorlagen – für Anfragen, die Kunden selbst schicken." },

  // accounting
  { name: "BuchhalterKI", category: "accounting", beschreibung: "Kategorisiert Ausgaben und bereitet den Steuerberater-Export automatisch vor." },

  // document_processing
  { name: "BelegScanner", category: "document_processing", beschreibung: "Scannt Papierbelege und Rechnungen und überträgt sie digital ins System." },
  { name: "RechnungsReader", category: "document_processing", beschreibung: "Liest eingehende PDF-Rechnungen automatisch aus und trägt Beträge, Datum und Lieferant direkt ins Buchführungssystem ein." },

  // inventory_management
  { name: "LagerCheck", category: "inventory_management", beschreibung: "Meldet Engpässe und schlägt Nachbestellmengen basierend auf der Verkaufshistorie vor." },
  { name: "TrendRadar", category: "inventory_management", beschreibung: "Erkennt Bestseller und Ladenhüter aus den Kassendaten und gibt Hinweise, was abgebaut oder nachbestellt werden sollte." },

  // ordering
  { name: "BestellBot", category: "ordering", beschreibung: "Erstellt Bestellvorschläge und sendet sie direkt an Lieferanten." },

  // product_content
  { name: "ProduktText", category: "product_content", beschreibung: "Schreibt verkaufsfördernde Produktbeschreibungen aus kurzen Stichworten oder Fotos – direkt für den Online-Shop oder Flyer einsetzbar." },
  { name: "KatalogKI", category: "product_content", beschreibung: "Erstellt strukturierte Produktkataloge oder Preislisten aus unsortierten Artikellisten – als druckfertiges PDF oder Web-Version." },

  // image_editing
  { name: "FotoFreisteller", category: "image_editing", beschreibung: "Entfernt Hintergründe aus Produktfotos vollautomatisch und liefert freigestellte Bilder für den Shop oder Social Media." },
  { name: "BildVerbesserer", category: "image_editing", beschreibung: "Verbessert Helligkeit, Schärfe und Farben von Produktfotos ohne Fachkenntnisse – direkt auf dem Smartphone nutzbar." },

  // reviews
  { name: "BewertungsAntwort", category: "reviews", beschreibung: "Schlägt passende, individuelle Antworten auf Google- oder Yelp-Bewertungen vor – für positive wie negative Rückmeldungen." },
  { name: "SternWächter", category: "reviews", beschreibung: "Überwacht neue Bewertungen auf allen Plattformen, benachrichtigt sofort und schlägt direkt eine Antwortvorlage vor." },

  // newsletter
  { name: "NewsletterKI", category: "newsletter", beschreibung: "Erstellt monatliche Newsletter aus den neuesten Produkten oder Angeboten – fertig zum Versenden an die bestehende Kundenliste." },
  { name: "AktionsMailer", category: "newsletter", beschreibung: "Generiert E-Mail-Kampagnen für saisonale Aktionen oder Rabatte – inkl. Betreffzeile, Text und Call-to-Action." },

  // loyalty
  { name: "KundenKarte", category: "loyalty", beschreibung: "Digitale Stempelkarte: belohnt Stammkunden automatisch nach einer bestimmten Anzahl Käufe und erinnert sie per E-Mail oder SMS." },
  { name: "WiederKommerBot", category: "loyalty", beschreibung: "Erkennt Kunden, die länger nicht da waren, und schlägt automatisch eine Rückgewinnungsaktion oder ein persönliches Angebot vor." },

  // analytics
  { name: "UmsatzSpiegel", category: "analytics", beschreibung: "Fasst Kassendaten und Verkaufsstatistiken automatisch zu einem wöchentlichen Überblick zusammen – ohne Tabellenkalkulation." },

  // appointment_booking
  { name: "TerminBot", category: "appointment_booking", beschreibung: "Nimmt Terminanfragen per Website oder WhatsApp entgegen und trägt sie automatisch in den Kalender ein – ohne manuelle Absprache." },

  // translation
  { name: "TextÜbersetzer", category: "translation", beschreibung: "Übersetzt Produktbeschreibungen, Aushänge oder Menüs automatisch in Englisch, Türkisch oder weitere Sprachen für internationale Kunden." },

  // voice
  { name: "AnrufAssistent", category: "voice", beschreibung: "Nimmt Anrufe außerhalb der Öffnungszeiten entgegen, beantwortet Standardfragen automatisch und leitet dringende Anfragen weiter." },
];
