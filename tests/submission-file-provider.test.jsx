import { useEffect, useState } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
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

function CaptureFiles({ onReady }) {
    const files = useSubmissionFiles();
    useEffect(() => onReady(files), [files, onReady]);
    return null;
}

function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}

test('Given a volatile packet owner When an async operation starts Then it issues a replacement generation token', async () => {
    let files;
    render(<SubmissionFileProvider><CaptureFiles onReady={value => { files = value; }}/></SubmissionFileProvider>);
    await waitFor(() => expect(files).toBeDefined());

    expect(files.beginGeneration).toBeTypeOf('function');
    expect(files.beginGeneration()).toBe(1);
    expect(files.beginGeneration()).toBe(2);
});

test('Given a deferred PDF split When its provider unmounts before completion Then the late result creates no URL or map entry', async () => {
    const operation = deferred();
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:late');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    let files;
    const view = render(<SubmissionFileProvider><CaptureFiles onReady={value => { files = value; }}/></SubmissionFileProvider>);
    await waitFor(() => expect(files).toBeDefined());
    const generation = files.beginGeneration();
    const completion = operation.promise.then(result => files.setMany([{ id: 'submission-late', ...result }], generation));

    view.unmount();
    operation.resolve(packet('late'));
    const accepted = await completion;

    expect(accepted).toBe(false);
    expect(create).not.toHaveBeenCalled();
    expect(files.has('submission-late')).toBe(false);
});

test('Given two deferred PDF splits When the older one completes last Then only the replacement generation is retained', async () => {
    const first = deferred();
    const second = deferred();
    const create = vi.spyOn(URL, 'createObjectURL').mockImplementation(file => `blob:${file.name}`);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    let files;
    render(<SubmissionFileProvider><CaptureFiles onReady={value => { files = value; }}/></SubmissionFileProvider>);
    await waitFor(() => expect(files).toBeDefined());
    const firstGeneration = files.beginGeneration();
    const firstCompletion = first.promise.then(result => files.setMany([{ id: 'submission-a', ...result }], firstGeneration));
    const secondGeneration = files.beginGeneration();
    const secondCompletion = second.promise.then(result => files.setMany([{ id: 'submission-a', ...result }], secondGeneration));

    first.resolve(packet('old'));
    expect(await firstCompletion).toBe(false);
    expect(create).not.toHaveBeenCalled();
    await act(async () => {
        second.resolve(packet('new'));
        expect(await secondCompletion).toBe(true);
    });

    expect(files.get('submission-a').packetFile.name).toBe('new-packet.pdf');
    expect(create).toHaveBeenCalledTimes(1);
});

test('Given a deferred PDF split When all student data is cleared before completion Then the late result cannot restore deleted packets', async () => {
    const operation = deferred();
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:restored');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    let files;
    render(<SubmissionFileProvider><CaptureFiles onReady={value => { files = value; }}/></SubmissionFileProvider>);
    await waitFor(() => expect(files).toBeDefined());
    const generation = files.beginGeneration();
    const completion = operation.promise.then(result => files.setMany([{ id: 'submission-deleted', ...result }], generation));

    files.clear();
    operation.resolve(packet('deleted'));
    const accepted = await completion;

    expect(accepted).toBe(false);
    expect(create).not.toHaveBeenCalled();
    expect(files.has('submission-deleted')).toBe(false);
});

test('Given a deferred PDF split When its student is deleted before completion Then the late packet cannot reappear', async () => {
    const operation = deferred();
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:restored');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    let files;
    render(<SubmissionFileProvider><CaptureFiles onReady={value => { files = value; }}/></SubmissionFileProvider>);
    await waitFor(() => expect(files).toBeDefined());
    const generation = files.beginGeneration();
    const completion = operation.promise.then(result => files.setMany([{ id: 'submission-deleted', ...result }], generation));

    files.remove('submission-deleted');
    operation.resolve(packet('deleted'));
    const accepted = await completion;

    expect(accepted).toBe(false);
    expect(create).not.toHaveBeenCalled();
    expect(files.has('submission-deleted')).toBe(false);
});

test('Given a late generation that becomes stale while creating URLs When commit is checked Then the new URL is revoked immediately', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    let files;
    render(<SubmissionFileProvider><CaptureFiles onReady={value => { files = value; }}/></SubmissionFileProvider>);
    await waitFor(() => expect(files).toBeDefined());
    const generation = files.beginGeneration();
    vi.spyOn(URL, 'createObjectURL').mockImplementation(file => {
        files.beginGeneration();
        return `blob:${file.name}`;
    });

    const accepted = files.setMany([{ id: 'submission-a', ...packet('stale') }], generation);

    expect(accepted).toBe(false);
    expect(files.has('submission-a')).toBe(false);
    expect(revoke).toHaveBeenCalledWith('blob:stale-packet.pdf');
});

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
