import type { ComponentProps } from "react";

type P = ComponentProps<"svg"> & { size?: number };

function I({ size = 16, children, ...p }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
      {children}
    </svg>
  );
}

export const Icon = {
  home: (p: P) => <I {...p}><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></I>,
  clock: (p: P) => <I {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></I>,
  visits: (p: P) => <I {...p}><path d="M4 6h16M4 12h16M4 18h10" /></I>,
  clients: (p: P) => <I {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4.5-6.2" /></I>,
  staff: (p: P) => <I {...p}><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M9 3v4M15 3v4M8 12h8M8 16h5" /></I>,
  sites: (p: P) => <I {...p}><path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 10h4a1 1 0 0 1 1 1v10M8 8h3M8 12h3M8 16h3M4 21h17" /></I>,
  audit: (p: P) => <I {...p}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M9 12l2 2 4-4" /></I>,
  catalog: (p: P) => <I {...p}><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></I>,
  logout: (p: P) => <I {...p}><path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 8l4 4-4 4M19 12H9" /></I>,
  search: (p: P) => <I {...p}><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4-4" /></I>,
  // property icons
  id: (p: P) => <I {...p}><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="8.5" cy="12" r="2" /><path d="M13 10h5M13 14h5" /></I>,
  hash: (p: P) => <I {...p}><path d="M9 4L7 20M17 4l-2 16M4 9h17M3 15h17" /></I>,
  calendar: (p: P) => <I {...p}><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></I>,
  pin: (p: P) => <I {...p}><path d="M12 21s6-5.5 6-11a6 6 0 0 0-12 0c0 5.5 6 11 6 11z" /><circle cx="12" cy="10" r="2" /></I>,
  phone: (p: P) => <I {...p}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" /></I>,
  mail: (p: P) => <I {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></I>,
  user: (p: P) => <I {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></I>,
  tag: (p: P) => <I {...p}><path d="M3 12V4h8l10 10-8 8z" /><circle cx="7.5" cy="8.5" r="1.25" fill="currentColor" stroke="none" /></I>,
  code: (p: P) => <I {...p}><path d="M8 8l-4 4 4 4M16 8l4 4-4 4M14 5l-4 14" /></I>,
  units: (p: P) => <I {...p}><path d="M4 20V10M10 20V4M16 20v-8M22 20H2" /></I>,
  doc: (p: P) => <I {...p}><path d="M6 3h8l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></I>,
  flag: (p: P) => <I {...p}><path d="M5 21V4M5 4h12l-2 4 2 4H5" /></I>,
  building: (p: P) => <I {...p}><rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3" /></I>,
  history: (p: P) => <I {...p}><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5M12 7v5l3 2" /></I>,
  plus: (p: P) => <I {...p}><path d="M12 5v14M5 12h14" /></I>,
  check: (p: P) => <I {...p}><path d="M5 12l4 4 10-10" /></I>,
  edit: (p: P) => <I {...p}><path d="M4 20h4l10-10-4-4L4 16z" /><path d="M12 8l4 4" /></I>,
  inbox: (p: P) => <I {...p}><path d="M4 4h16v16H4z" /><path d="M4 14h5l1.5 2h3L15 14h5" /></I>,
  bell: (p: P) => <I {...p}><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20a2 2 0 0 0 4 0" /></I>,
  chart: (p: P) => <I {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></I>,
  money: (p: P) => <I {...p}><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M7 12h.01M17 12h.01" /></I>,
  settings: (p: P) => <I {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></I>,
  download: (p: P) => <I {...p}><path d="M12 4v11M7 10l5 5 5-5M4 20h16" /></I>,
  chevronLeft: (p: P) => <I {...p}><path d="M15 6l-6 6 6 6" /></I>,
  chevronRight: (p: P) => <I {...p}><path d="M9 6l6 6-6 6" /></I>,
  chevronDown: (p: P) => <I {...p}><path d="M6 9l6 6 6-6" /></I>,
  filter: (p: P) => <I {...p}><path d="M3 5h18l-7 8v6l-4-2v-4z" /></I>,
  spark: (p: P) => <I {...p}><path d="M3 17l5-6 4 3 5-8 4 5" /></I>,
  trend: (p: P) => <I {...p}><path d="M3 17l6-6 4 4 8-8M15 7h6v6" /></I>,
};

export type IconName = keyof typeof Icon;
