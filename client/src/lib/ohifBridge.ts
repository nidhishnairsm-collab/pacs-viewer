export type OhifOutboundMessage =
  | { type: 'OHIF_SET_THEME'; theme: 'dark' | 'light' }
  | { type: 'OHIF_SET_TOOL'; toolName: string }
  | { type: 'OHIF_SET_LAYOUT'; numRows: number; numCols: number }
  | { type: 'OHIF_TOGGLE_CINE' }
  | { type: 'OHIF_RESET_VIEWPORT' }
  | { type: 'OHIF_FLIP_H' }
  | { type: 'OHIF_FLIP_V' }
  | { type: 'OHIF_ROTATE_CW' }
  | { type: 'OHIF_INVERT' }
  | { type: 'OHIF_RUN_COMMAND'; commandName: string; options?: Record<string, unknown> };

export type OhifInboundMessage =
  | { type: 'OHIF_MEASUREMENT_ADDED'; uid: string; findingText: string }
  | { type: 'OHIF_MEASUREMENT_UPDATED'; uid: string; findingText: string }
  | { type: 'OHIF_MEASUREMENT_REMOVED'; uid: string }
  | { type: 'OHIF_TOOL_CHANGED'; toolId: string };

export function sendToOhif(iframe: HTMLIFrameElement | null, msg: OhifOutboundMessage) {
  iframe?.contentWindow?.postMessage(msg, window.location.origin);
}
