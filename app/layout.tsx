import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Should I Use This? · 설치 전 도입 판단",
  description: "공개 근거와 내 상황을 비교해 도구의 업무 도입 가치를 설치 전에 판단합니다.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
