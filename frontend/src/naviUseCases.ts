export interface NaviUseCase {
  name: string;
  /** One sentence: what kind of problem this use case addresses. Used for matching. */
  description: string;
  categories: string[];
}

/**
 * Hardcoded seed / reset-to-default use cases. Runtime callers should load the effective (possibly
 * user-edited) list instead — see `electron/services/naviKnowledgeBase.ts`.
 *
 * Design: each use case is one concrete, action-oriented merchant goal (not a broad theme) so the
 * LLM can map a merchant's problem/idea onto exactly one of them, and each maps to a tight group of
 * tool `categories`. Together these cover every tool category in `DEFAULT_NAVI_TOOLS`, so no tool is
 * unreachable. Keep them mutually distinct — the `description` is what the model matches against.
 */
export const DEFAULT_NAVI_USE_CASES: NaviUseCase[] = [
  // ── Reichweite & Sichtbarkeit ──
  {
    name: "Social-Media-Präsenz aufbauen",
    description:
      "Regelmäßig auf Instagram, Facebook & Co. posten, um sichtbar und präsent zu bleiben. Es geht um organische Präsenz, nicht um bezahlte Werbung.",
    categories: ["social_media"],
  },
  {
    name: "Social-Media-Werbung für Produkte erstellen",
    description:
      "Konkrete Werbeinhalte für einzelne Produkte oder Aktionen erstellen – Bild, Text und Post – um gezielt Produkte zu bewerben.",
    categories: ["social_media", "image_editing", "product_content"],
  },
  {
    name: "Lokal bei Google & Maps gefunden werden",
    description:
      "Google-Business-Eintrag, Öffnungszeiten und lokale Verzeichnisse (Google Maps, Yelp) aktuell und sichtbar halten, damit Kunden in der Nähe den Laden finden.",
    categories: ["local_listings"],
  },
  {
    name: "Website in der Google-Suche nach oben bringen",
    description:
      "Website und Produktseiten per SEO in der organischen Google-Suche besser platzieren, damit man online überhaupt gefunden wird.",
    categories: ["seo"],
  },

  // ── Produktdarstellung ──
  {
    name: "Produktfotos aufwerten",
    description:
      "Produktbilder freistellen, aufhellen oder für Shop und Social Media verbessern – ohne Fachkenntnisse.",
    categories: ["image_editing"],
  },
  {
    name: "Produkttexte & Kataloge erstellen",
    description:
      "Verkaufsfördernde Produktbeschreibungen, Preislisten oder Kataloge aus kurzen Stichworten schreiben – für Online-Shop, Flyer oder Print.",
    categories: ["product_content"],
  },

  // ── Kundenbindung & Marketing an Bestandskunden ──
  {
    name: "Newsletter & E-Mail-Aktionen versenden",
    description:
      "Bestandskunden aktiv per Newsletter oder Aktions-Kampagne per E-Mail erreichen – ausgehende Kommunikation an eine bestehende Kundenliste.",
    categories: ["newsletter"],
  },
  {
    name: "Stammkunden binden & zurückgewinnen",
    description:
      "Treueprogramm/digitale Stempelkarte aufbauen oder inaktive Kunden mit gezielten Angeboten zurückholen.",
    categories: ["loyalty"],
  },
  {
    name: "Online-Bewertungen beantworten & überwachen",
    description:
      "Auf Google-, Yelp- oder andere Bewertungen professionell antworten und neue Bewertungen im Blick behalten.",
    categories: ["reviews"],
  },

  // ── Eingehende Kundenkommunikation automatisieren ──
  {
    name: "Kundenfragen auf der Website automatisch beantworten",
    description:
      "Chatbot/FAQ auf der eigenen Website, der wiederkehrende Standardfragen (Öffnungszeiten, Produkte, Rückgabe) rund um die Uhr beantwortet.",
    categories: ["chatbot", "knowledge_base"],
  },
  {
    name: "WhatsApp- & Instagram-Nachrichten automatisch beantworten",
    description:
      "Eingehende Messenger-Anfragen von Kunden (WhatsApp, Instagram) automatisch mit Vorlagen beantworten. Nur eingehende Nachrichten, die Kunden selbst schicken.",
    categories: ["messaging"],
  },
  {
    name: "Eingehende E-Mail-Anfragen automatisieren",
    description:
      "Gleichartige eingehende E-Mails (Lieferstatus, Bestell- oder Terminbestätigungen) automatisch beantworten. Nur eingehende Kommunikation, kein Outreach.",
    categories: ["email_automation"],
  },
  {
    name: "Anrufe automatisch annehmen",
    description:
      "Anrufe außerhalb der Öffnungszeiten entgegennehmen, Standardfragen automatisch beantworten und dringende Anliegen weiterleiten.",
    categories: ["voice"],
  },
  {
    name: "Termine automatisch annehmen & verwalten",
    description:
      "Terminanfragen per Website oder WhatsApp entgegennehmen und automatisch in den Kalender eintragen – ohne manuelle Absprache.",
    categories: ["appointment_booking"],
  },

  // ── Backoffice & Betrieb ──
  {
    name: "Buchhaltung, Belege & Rechnungen vereinfachen",
    description:
      "Papierbelege scannen, Ausgaben kategorisieren und eingehende Rechnungen automatisch auslesen und ins Buchführungssystem übertragen.",
    categories: ["accounting", "document_processing"],
  },
  {
    name: "Lagerbestand überwachen & nachbestellen",
    description:
      "Bestände im Blick behalten, Engpässe melden und Nachbestellmengen aus der Verkaufshistorie ableiten.",
    categories: ["inventory_management"],
  },
  {
    name: "Bestellungen bei Lieferanten automatisieren",
    description:
      "Bestellvorschläge erstellen und direkt an Lieferanten senden.",
    categories: ["ordering"],
  },
  {
    name: "Verkaufszahlen automatisch auswerten",
    description:
      "Kassendaten und Verkaufsstatistiken ohne Tabellenkalkulation zu einem verständlichen Überblick zusammenfassen (Bestseller, Ladenhüter, Umsatzentwicklung).",
    categories: ["analytics"],
  },

  // ── Sonstiges ──
  {
    name: "Texte für internationale Kunden übersetzen",
    description:
      "Produktbeschreibungen, Aushänge oder Menüs automatisch in andere Sprachen übersetzen, um fremdsprachige Kunden zu erreichen.",
    categories: ["translation"],
  },
];
