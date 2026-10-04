import type { CSSProperties } from "react";

// Solargik brand system (from the proposal-branding skill / Solargik 360 mockup).
export const NAVY = "#142A5C";
export const NAVY_HOVER = "#1E3A70";
export const NAVY_MID = "#2F4C8F";
export const ORANGE = "#F5A623";
export const GRAY_LIGHT = "#E4E6EC";
export const PAGE_BG = "#F4F5F7";
export const BORDER = "#E4E6EC";
export const ROW_DIVIDER = "#EDEFF4";
export const TEXT_BODY = "#333333";
export const TEXT_MUTED = "#5A6172";

export const pageStyle: CSSProperties = {
  flex: 1,
  boxSizing: "border-box",
  width: "100%",
  maxWidth: 1400,
  margin: "0 auto",
  padding: "32px 40px",
  display: "flex",
  flexDirection: "column",
  gap: 20,
  background: PAGE_BG,
};

export const pageTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 30,
  fontWeight: 700,
  color: NAVY,
  letterSpacing: "-0.3px",
};

export const pageSubtitleStyle: CSSProperties = {
  marginTop: 6,
  fontSize: 14,
  color: TEXT_MUTED,
};

export const cardStyle: CSSProperties = {
  background: "#fff",
  border: `1px solid ${BORDER}`,
  borderRadius: 10,
  overflow: "hidden",
};
