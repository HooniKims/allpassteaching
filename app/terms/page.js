import { createElement } from 'react';
import { LegalDocument } from '@/components/site/LegalDocument.jsx';
import { termsOfService } from '@/data/legal-documents.js';

export const metadata = {
    title: '이용약관 | 올패스 티칭',
    description: '올패스 티칭 서비스 이용약관',
};

export default function TermsPage() {
    return createElement(LegalDocument, {
        document: termsOfService,
        alternate: { href: '/privacy', label: '개인정보처리방침' },
    });
}
