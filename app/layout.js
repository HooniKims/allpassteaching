import './globals.css';

export const metadata = {
    title: '올패스 티칭',
    description: '2022 개정 교육과정 기반 수업 지도안 작성 도구',
};

export default function RootLayout({ children }) {
    return (
        <html lang="ko">
            <head>
                <link rel="preload" href="/fonts/paperlogy/Paperlogy-4Regular.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
            </head>
            <body>{children}</body>
        </html>
    );
}
