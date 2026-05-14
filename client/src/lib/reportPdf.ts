import { jsPDF } from "jspdf";

export interface ReportPdfData {
  patient: {
    name?: string | null;
    patientId?: string | null;
    dateOfBirth?: Date | string | null;
    gender?: string | null;
  } | null;
  study: {
    studyId?: string | null;
    description?: string | null;
    modality?: string | null;
    bodyPart?: string | null;
    studyDate?: Date | string | null;
  } | null;
  report: {
    status: string;
    findings: string;
    impression: string;
    recommendations?: string | null;
    createdAt: Date | string;
  };
  radiologistName?: string | null;
}

export function exportReportPdf(data: ReportPdfData) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = 210;
  const marginL = 20;
  const marginR = 20;
  const contentW = pageW - marginL - marginR;
  let y = 20;

  const line = () => {
    doc.setDrawColor(180);
    doc.line(marginL, y, pageW - marginR, y);
    y += 5;
  };

  const section = (label: string, value: string) => {
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(label.toUpperCase(), marginL, y);
    y += 4;
    doc.setFontSize(10);
    doc.setTextColor(30);
    const lines = doc.splitTextToSize(value || "N/A", contentW);
    doc.text(lines, marginL, y);
    y += lines.length * 5 + 3;
  };

  // Header
  doc.setFillColor(30, 58, 138);
  doc.rect(0, 0, pageW, 18, "F");
  doc.setFontSize(13);
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold");
  doc.text("PACS Viewer — Radiology Report", marginL, 12);

  const statusLabel = data.report.status.toUpperCase();
  doc.setFontSize(8);
  doc.setTextColor(200, 220, 255);
  doc.text(statusLabel, pageW - marginR, 12, { align: "right" });

  y = 28;
  doc.setFont("helvetica", "normal");

  // Patient & Study info in two columns
  const col2X = marginL + contentW / 2 + 5;
  const col1W = contentW / 2 - 5;

  const colField = (x: number, label: string, value: string, colWidth: number) => {
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(label.toUpperCase(), x, y);
  };

  // Row labels
  const patientFields: [string, string][] = [
    ["Patient Name", data.patient?.name || "N/A"],
    ["Patient ID",   data.patient?.patientId || "N/A"],
    ["Date of Birth", data.patient?.dateOfBirth ? new Date(data.patient.dateOfBirth).toLocaleDateString() : "N/A"],
    ["Gender",        data.patient?.gender ? (data.patient.gender.charAt(0).toUpperCase() + data.patient.gender.slice(1)) : "N/A"],
  ];
  const studyFields: [string, string][] = [
    ["Study Description", data.study?.description || "N/A"],
    ["Modality",          data.study?.modality || "N/A"],
    ["Body Part",         data.study?.bodyPart || "N/A"],
    ["Study Date",        data.study?.studyDate ? new Date(data.study.studyDate).toLocaleDateString() : "N/A"],
  ];

  for (let i = 0; i < Math.max(patientFields.length, studyFields.length); i++) {
    const pf = patientFields[i];
    const sf = studyFields[i];
    if (pf) {
      doc.setFontSize(8); doc.setTextColor(120);
      doc.text(pf[0].toUpperCase(), marginL, y);
      doc.setFontSize(10); doc.setTextColor(30);
      doc.text(pf[1], marginL, y + 4);
    }
    if (sf) {
      doc.setFontSize(8); doc.setTextColor(120);
      doc.text(sf[0].toUpperCase(), col2X, y);
      doc.setFontSize(10); doc.setTextColor(30);
      doc.text(sf[1], col2X, y + 4);
    }
    y += 10;
  }

  y += 3;
  line();

  // Report metadata
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text("REPORT DATE", marginL, y);
  doc.text("RADIOLOGIST", col2X, y);
  y += 4;
  doc.setFontSize(10);
  doc.setTextColor(30);
  doc.text(new Date(data.report.createdAt).toLocaleString(), marginL, y);
  doc.text(data.radiologistName || "—", col2X, y);
  y += 9;
  line();

  // Findings
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(30);
  doc.text("Findings", marginL, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const findingLines = doc.splitTextToSize(data.report.findings, contentW);
  doc.text(findingLines, marginL, y);
  y += findingLines.length * 5 + 4;

  // Impression
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Impression", marginL, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const impressionLines = doc.splitTextToSize(data.report.impression, contentW);
  doc.text(impressionLines, marginL, y);
  y += impressionLines.length * 5 + 4;

  // Recommendations (optional)
  if (data.report.recommendations) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Recommendations", marginL, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const recLines = doc.splitTextToSize(data.report.recommendations, contentW);
    doc.text(recLines, marginL, y);
    y += recLines.length * 5 + 4;
  }

  // Footer
  const pageH = 297;
  doc.setDrawColor(180);
  doc.line(marginL, pageH - 15, pageW - marginR, pageH - 15);
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text("Generated by PACS Viewer", marginL, pageH - 9);
  doc.text(new Date().toLocaleString(), pageW - marginR, pageH - 9, { align: "right" });

  const safeName = (data.patient?.name || "report").replace(/\s+/g, "_");
  doc.save(`${safeName}_report_${new Date().toISOString().split("T")[0]}.pdf`);
}
