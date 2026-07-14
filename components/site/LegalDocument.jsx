import Link from 'next/link';
import { legalEffectiveDate } from '@/data/legal-documents.js';

export function LegalDocument({ document, alternate }) {
    return (
        <main className="legal-workspace">
            <article className="legal-document" aria-labelledby="legal-title">
                <Link className="legal-back-link" href="/">
                    <span aria-hidden="true">←</span> 올패스 티칭으로 돌아가기
                </Link>

                <header className="legal-header">
                    <p className="legal-label">{document.label}</p>
                    <h1 id="legal-title">{document.title}</h1>
                    <p className="legal-description">{document.description}</p>
                    <dl className="legal-meta">
                        <div><dt>시행일</dt><dd>{legalEffectiveDate}</dd></div>
                        <div><dt>서비스</dt><dd>올패스 티칭</dd></div>
                    </dl>
                </header>

                {document.notice ? (
                    <aside className="legal-notice" aria-label="중요 안내">
                        <strong>학생 자료를 다룰 때</strong>
                        <p>{document.notice}</p>
                    </aside>
                ) : null}

                <div className="legal-sections">
                    {document.sections.map(section => (
                        <section key={section.title} className="legal-section">
                            <h2>{section.title}</h2>
                            {section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
                        </section>
                    ))}
                </div>

                <footer className="legal-document-footer">
                    <p>다른 정책 문서도 함께 확인해 주세요.</p>
                    <Link href={alternate.href}>{alternate.label} 보기</Link>
                </footer>
            </article>
        </main>
    );
}
