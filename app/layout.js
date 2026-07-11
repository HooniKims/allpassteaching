import Script from 'next/script';
import './globals.css';

export const metadata = {
    title: '올패스 티칭',
    description: '2022 개정 교육과정 기반 지도안·학습지·수행평가·OCR 채점·세특 작성 도구',
};

export default function RootLayout({ children }) {
    const enableDevTools = process.env.NODE_ENV === 'development'
        && process.env.NEXT_PUBLIC_DISABLE_REACT_DEVTOOLS !== '1';
    return (
        <html lang="ko">
            <head>
                <link rel="preload" href="/fonts/paperlogy/Paperlogy-4Regular.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
                {enableDevTools && <>
                    <Script src="https://unpkg.com/react-grab/dist/index.global.js" crossOrigin="anonymous" strategy="beforeInteractive" />
                    <Script src="https://unpkg.com/react-scan/dist/auto.global.js" crossOrigin="anonymous" strategy="beforeInteractive" />
                </>}
            </head>
            <body>{children}</body>
        </html>
    );
}
