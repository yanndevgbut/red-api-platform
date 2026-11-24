import type { Metadata } from "next";
import HandoffDownloads from "./downloads";

export const metadata: Metadata = {
  title: "Unduhan privat · RED API",
  robots: { index: false, follow: false },
};

export default function HandoffPage() {
  return <HandoffDownloads />;
}
