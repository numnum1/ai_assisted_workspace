export interface NaviUseCase {
  name: string;
  /** One sentence: what kind of problem this use case addresses. Used for matching. */
  description: string;
  categories: string[];
}

export const NAVI_USE_CASES: NaviUseCase[] = [
  {
    name: "Increase Online Visibility",
    description: "Händler wird online kaum gefunden – bei Google, lokaler Suche oder Social Media.",
    categories: ["seo", "social_media", "local_listings"],
  },
  {
    name: "Automate FAQ & Customer Support",
    description: "Viele wiederkehrende Standardfragen zu Öffnungszeiten, Produkten, Preisen oder Rückgaben.",
    categories: ["chatbot", "knowledge_base"],
  },
  {
    name: "Answer Incoming Customer Requests",
    description: "Händler bekommt viele gleichartige eingehende Anfragen per E-Mail, WhatsApp oder Website – z.B. Fragen zu Lieferstatus, Öffnungszeiten oder Terminwünschen – und beantwortet alles manuell. Dieser Use Case betrifft ausschließlich eingehende Kommunikation: Kunden schreiben zuerst, der Händler antwortet. Kein Outreach, keine Kundenlisten, keine Newsletter.",
    categories: ["email_automation", "messaging"],
  },
  {
    name: "Simplify Bookkeeping",
    description: "Buchhaltung, Belege oder Rechnungen kosten unverhältnismäßig viel Zeit.",
    categories: ["accounting", "document_processing"],
  },
  {
    name: "Manage Inventory & Orders",
    description: "Bestandsverwaltung, Nachbestellungen oder Lieferantenabstimmung laufen manuell und fehleranfällig.",
    categories: ["inventory_management", "ordering"],
  },
];
