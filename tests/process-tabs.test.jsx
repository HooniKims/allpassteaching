import { afterEach, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProcessTabs } from '@/components/workflow/ProcessTabs.jsx';

const statuses = { lesson: 'complete', worksheet: 'review', assessment: 'prerequisite', grading: 'prerequisite', records: 'prerequisite' };
const originalScrollIntoView = Element.prototype.scrollIntoView;
const originalScrollTo = Element.prototype.scrollTo;
const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;

function rect(left, right) {
    return { x: left, y: 0, left, right, top: 0, bottom: 54, width: right - left, height: 54, toJSON: () => ({}) };
}

afterEach(() => {
    Element.prototype.scrollIntoView = originalScrollIntoView;
    Element.prototype.scrollTo = originalScrollTo;
    Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
});

test('renders all five processes with text statuses and allows blocked tabs to be selected', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ProcessTabs activeProcess="lesson" statuses={statuses} onChange={onChange}/>);

    expect(screen.getAllByRole('tab')).toHaveLength(5);
    expect(screen.getByRole('tab', { name: /지도안.*완료/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /학습지.*검토·재생성 필요/ })).toBeEnabled();
    const recordsTab = screen.getByRole('tab', { name: /세특.*선행 단계 필요/ });
    expect(recordsTab).toBeEnabled();
    await user.click(recordsTab);
    expect(onChange).toHaveBeenCalledWith('records');
});

test('explains that review needed can mean a missing, changed, or unconfirmed stage result', () => {
    render(<ProcessTabs activeProcess="lesson" statuses={statuses} onChange={() => {}}/>);

    expect(screen.getByRole('tab', { name: /학습지.*검토·재생성 필요/ })).toHaveAccessibleDescription('해당 단계의 결과가 아직 없거나, 앞 단계 변경으로 다시 생성 또는 교사 확인이 필요합니다.');
});

test('moves tab focus with arrow keys', async () => {
    const user = userEvent.setup();
    render(<ProcessTabs activeProcess="lesson" statuses={statuses} onChange={() => {}}/>);
    const lessonTab = screen.getByRole('tab', { name: /지도안/ });
    const worksheetTab = screen.getByRole('tab', { name: /학습지/ });

    lessonTab.focus();
    await user.keyboard('{ArrowRight}');
    expect(worksheetTab).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(lessonTab).toHaveFocus();
});

test('keeps the active grading tab first in the Tab order and preserves arrow navigation', async () => {
    const user = userEvent.setup();
    render(<ProcessTabs activeProcess="grading" statuses={statuses} onChange={() => {}}/>);
    const gradingTab = screen.getByRole('tab', { name: /OCR·채점/ });
    const recordsTab = screen.getByRole('tab', { name: /세특/ });

    await user.tab();
    expect(gradingTab).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(recordsTab).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(gradingTab).toHaveFocus();
});

test('keeps the active process visible without changing the keyboard navigation starting point', () => {
    const scrollIntoView = vi.fn();
    const scrollTo = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    Element.prototype.scrollTo = scrollTo;
    Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
        if (this.matches('.process-rail')) return rect(0, 375);
        if (this.matches('#process-tab-grading')) return rect(396, 528);
        return rect(0, 132);
    };

    render(<ProcessTabs activeProcess="grading" statuses={statuses} onChange={() => {}}/>);

    const rail = screen.getByRole('navigation', { name: '교수·학습·평가·기록 프로세스' });
    expect(scrollTo).toHaveBeenCalledWith({ left: 153, behavior: 'auto' });
    expect(scrollTo.mock.instances[0]).toBe(rail);
    expect(scrollIntoView).not.toHaveBeenCalled();
});
