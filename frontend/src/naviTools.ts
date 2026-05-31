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

  // local_listings
  { name: "SichtbarLokal", category: "local_listings", beschreibung: "Pflegt Google-Business-Einträge, Öffnungszeiten und Fotos automatisch." },

  // chatbot
  { name: "FAQ-Bot Alpha", category: "chatbot", beschreibung: "Beantwortet Standardfragen auf der Website rund um die Uhr." },

  // knowledge_base
  { name: "WissensHub", category: "knowledge_base", beschreibung: "Strukturiert internes Produktwissen und macht es für Chatbots abrufbar." },

  // email_automation
  { name: "MailPilot", category: "email_automation", beschreibung: "Automatisiert wiederkehrende E-Mails wie Bestellbestätigungen und Follow-ups." },

  // messaging
  { name: "ChatConnect", category: "messaging", beschreibung: "Verbindet WhatsApp oder Instagram-DMs mit automatischen Antwortvorlagen." },

  // accounting
  { name: "BuchhalterKI", category: "accounting", beschreibung: "Kategorisiert Ausgaben und bereitet den Steuerberater-Export automatisch vor." },

  // document_processing
  { name: "BelegScanner", category: "document_processing", beschreibung: "Scannt Papierbelege und Rechnungen und überträgt sie digital ins System." },

  // inventory_management
  { name: "LagerCheck", category: "inventory_management", beschreibung: "Meldet Engpässe und schlägt Nachbestellmengen basierend auf Verkaufshistorie vor." },

  // ordering
  { name: "BestellBot", category: "ordering", beschreibung: "Erstellt Bestellvorschläge und sendet sie direkt an Lieferanten." },
];
