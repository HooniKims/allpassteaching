import { createElement } from 'react';
import { LegalDocument } from '@/components/site/LegalDocument.jsx';
import { privacyPolicy } from '@/data/legal-documents.js';

export const metadata = {
    title: '개인정보처리방침 | 올패스 티칭',
    description: '올패스 티칭 개인정보처리방침',
};

export default function PrivacyPage() {
    return createElement(LegalDocument, {
        document: privacyPolicy,
        alternate: { href: '/terms', label: '이용약관' },
    });
}
