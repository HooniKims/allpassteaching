import { access, readFile } from 'node:fs/promises';
import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { SiteFooter } from '@/components/site/SiteFooter.jsx';
import PrivacyPage from '@/app/privacy/page.js';
import TermsPage from '@/app/terms/page.js';

test('페이지 하단에서 이용약관과 개인정보처리방침으로 이동할 수 있다', () => {
    render(<SiteFooter/>);

    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '이용약관' })).toHaveAttribute('href', '/terms');
    expect(screen.getByRole('link', { name: '개인정보처리방침' })).toHaveAttribute('href', '/privacy');
});

test('이용약관은 무료 교육 지원 도구와 교사의 최종 검토 책임을 설명한다', () => {
    render(<TermsPage/>);

    expect(screen.getByRole('heading', { level: 1, name: '이용약관' })).toBeInTheDocument();
    expect(screen.getByText(/무료로 제공되는 교사용 교육 지원 도구/)).toBeInTheDocument();
    expect(screen.getByText(/교사가 최종 확인하고 판단해야 합니다/)).toBeInTheDocument();
    expect(screen.getByText(/김형훈 교사\(등촌중학교\).*02-6380-8339.*greenguyhh@gmail\.com/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /올패스 티칭으로 돌아가기/ })).toHaveAttribute('href', '/');
});

test('개인정보처리방침은 브라우저 저장과 Upstage 전송 범위를 명확히 알린다', () => {
    render(<PrivacyPage/>);

    expect(screen.getByRole('heading', { level: 1, name: '개인정보처리방침' })).toBeInTheDocument();
    expect(screen.getByText(/브라우저의 로컬 저장소/)).toBeInTheDocument();
    expect(screen.getByText(/Upstage API/)).toBeInTheDocument();
    expect(screen.getByText(/학생 개인정보는 필요한 범위로 최소화/)).toBeInTheDocument();
    expect(screen.getByText(/김형훈 교사\(등촌중학교\).*02-6380-8339.*greenguyhh@gmail\.com/)).toBeInTheDocument();
});

test('루트 레이아웃은 공통 하단 영역을 포함하고 생성된 아이콘을 제공한다', async () => {
    const layout = await readFile('app/layout.js', 'utf8');
    expect(layout).toContain('<SiteFooter/>');
    await expect(access('app/icon.png')).resolves.toBeUndefined();
    await expect(access('app/apple-icon.png')).resolves.toBeUndefined();
});
