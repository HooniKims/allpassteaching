import Link from 'next/link';

export function SiteFooter() {
    return (
        <footer className="site-footer">
            <nav aria-label="서비스 정책">
                <Link href="/terms">이용약관</Link>
                <span aria-hidden="true">·</span>
                <Link href="/privacy">개인정보처리방침</Link>
            </nav>
            <p>교사의 최종 판단을 돕는 교육 지원 도구</p>
        </footer>
    );
}
