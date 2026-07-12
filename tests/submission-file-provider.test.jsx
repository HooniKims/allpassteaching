import { useState } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SubmissionFileProvider, useSubmissionFiles } from '@/components/workflow/SubmissionFileProvider.jsx';

afterEach(() => vi.restoreAllMocks());

function packet(label) {
    return {
        packetFile: new File([`packet-${label}`], `${label}-packet.pdf`, { type: 'application/pdf' }),
        answerFile: new File([`answer-${label}`], `${label}-answer.pdf`, { type: 'application/pdf' }),
    };
}

function Harness() {
    const files = useSubmissionFiles();
    const [visible, setVisible] = useState(true);
    return <>
        <button type="button" onClick={() => files.set('submission-a', packet('first'))}>첫 파일 연결</button>
        <button type="button" onClick={() => files.set('submission-a', packet('second'))}>파일 교체</button>
        <button type="button" onClick={() => files.remove('submission-a')}>파일 삭제</button>
        <button type="button" onClick={() => files.set('submission-b', packet('third'))}>둘째 파일 연결</button>
        <button type="button" onClick={() => files.clear()}>전체 지우기</button>
        <button type="button" onClick={() => setVisible(value => !value)}>화면 전환</button>
        {visible && <output>{files.has('submission-a') ? files.get('submission-a').packetFile.name : '연결 없음'}</output>}
    </>;
}

test('Given a volatile packet owner When replacing deleting clearing and unmounting Then every object URL is revoked exactly once', async () => {
    const user = userEvent.setup();
    const create = vi.spyOn(URL, 'createObjectURL').mockImplementation(file => `blob:${file.name}`);
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const view = render(<SubmissionFileProvider><Harness/></SubmissionFileProvider>);

    await user.click(screen.getByRole('button', { name: '첫 파일 연결' }));
    expect(screen.getByText('first-packet.pdf')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '화면 전환' }));
    await user.click(screen.getByRole('button', { name: '화면 전환' }));
    expect(screen.getByText('first-packet.pdf')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '파일 교체' }));
    expect(revoke).toHaveBeenCalledWith('blob:first-packet.pdf');
    await user.click(screen.getByRole('button', { name: '파일 삭제' }));
    expect(revoke).toHaveBeenCalledWith('blob:second-packet.pdf');
    await user.click(screen.getByRole('button', { name: '둘째 파일 연결' }));
    await user.click(screen.getByRole('button', { name: '전체 지우기' }));
    expect(revoke).toHaveBeenCalledWith('blob:third-packet.pdf');
    await user.click(screen.getByRole('button', { name: '첫 파일 연결' }));
    view.unmount();

    expect(create).toHaveBeenCalledTimes(4);
    expect(revoke).toHaveBeenCalledTimes(4);
    expect(revoke.mock.calls.map(([url]) => url)).toEqual([
        'blob:first-packet.pdf',
        'blob:second-packet.pdf',
        'blob:third-packet.pdf',
        'blob:first-packet.pdf',
    ]);
});
