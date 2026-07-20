import { useState } from "react";
import { Check, ClipboardList, Copy, Download } from "lucide-react";
import type { NaviFacts } from "../../types.ts";
import { buildNaviPlanText } from "./naviPlanExport.ts";
import { downloadMarkdownFile } from "./chatMarkdownExport.ts";
import "./NaviPlanCard.css";

interface NaviPlanCardProps {
  naviFacts: NaviFacts;
  conversationTitle?: string;
}

export function NaviPlanCard({ naviFacts, conversationTitle }: NaviPlanCardProps) {
  const [copied, setCopied] = useState(false);
  const planText = buildNaviPlanText(naviFacts, conversationTitle);

  const handleCopy = () => {
    navigator.clipboard.writeText(planText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const handleDownload = () => {
    downloadMarkdownFile(`${conversationTitle ?? "navi"}-plan`, planText);
  };

  return (
    <div className="navi-plan-card">
      <div className="navi-plan-card-header">
        <ClipboardList size={14} className="navi-plan-card-icon" />
        <span>Dein Handlungsplan ist fertig</span>
      </div>
      <div className="navi-plan-card-actions">
        <button type="button" className="navi-plan-btn" onClick={handleCopy}>
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "Kopiert" : "Kopieren"}
        </button>
        <button type="button" className="navi-plan-btn" onClick={handleDownload}>
          <Download size={13} />
          Herunterladen
        </button>
      </div>
    </div>
  );
}
